import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'node:http';
import { sourceHash, runtimeManifest } from '../scripts/artifact.mjs';
import { chromium } from '@playwright/test';
import { findHint, normalizeAngle, createState } from '../assets/scripts/core/rules.ts';

import { METAL_LEVELS, NOVA_LEVELS } from '../assets/scripts/core/catalog.ts';
import { wirePaths, wireBasis } from '../assets/scripts/core/metal.ts';

// Observation never mutates gameplay. All play actions use native CDP touch events.
const root = fileURLToPath(new URL('../', import.meta.url));
const mediaOnly = process.argv.includes('--media');
let server;
let url = process.env.ORBIT_URL;
if (!url) {
  const dist = path.join(root, 'dist');
  await access(path.join(dist, 'index.html')).catch(() => {
    throw Error(
      'No Creator build. Run pnpm build with Creator 3.8.8 or a verified artifact first.',
    );
  });
  const info = JSON.parse(await readFile(path.join(dist, 'build-info.json'), 'utf8'));
  assert.equal(
    info.sourceHash,
    await sourceHash(),
    'Build current Cocos sources before browser validation',
  );
  assert.deepEqual(info.files, await runtimeManifest(dist), 'Creator runtime integrity');
  server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(dist, '.' + pathname.replace(/\/$/, '/index.html'));
      assert(file.startsWith(dist + path.sep));
      const types = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.json': 'application/json',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.wav': 'audio/wav',
        '.wasm': 'application/wasm',
      };
      const data = await readFile(file);
      res
        .writeHead(200, {
          'Content-Type': types[path.extname(file)] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        })
        .end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}/`;
}
const out = process.env.ORBIT_EVIDENCE_DIR || path.join(root, 'docs/design/physical-metal/actual');
await mkdir(out, { recursive: true });
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
  });
} catch (error) {
  server?.close();
  throw error;
}
let failure;
const results = [],
  errors = [];
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  deviceScaleFactor: Number(process.env.ORBIT_DEVICE_SCALE || 1),
  ...(process.env.ORBIT_RECORD_VIDEO
    ? { recordVideo: { dir: out, size: { width: 390, height: 844 } } }
    : {}),
});
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(String(error)));
const cdp = await context.newCDPSession(page);
let target = page;
const snapshot = () => target.evaluate(() => globalThis.__orbit?.snapshot());
function contentBounds(s, rect) {
  const scale = Math.min(rect.width / s.width, rect.height / s.height);
  return {
    x: rect.x + (rect.width - s.width * scale) / 2,
    y: rect.y + (rect.height - s.height * scale) / 2,
    width: s.width * scale,
    height: s.height * scale,
  };
}
const screen = (name) =>
  target.waitForFunction((value) => globalThis.__orbit?.snapshot().screen === value, name);
async function ready() {
  await target.waitForFunction(() => globalThis.__orbit?.snapshot().assetReady, null, {
    timeout: 45000,
  });
}
async function point(x, y) {
  const [s, rect] = await Promise.all([snapshot(), target.locator('#GameCanvas').boundingBox()]);
  assert(rect);
  const bounds = contentBounds(s, rect);
  return {
    x: bounds.x + (x / s.width) * bounds.width,
    y: bounds.y + (y / s.height) * bounds.height,
  };
}
async function tap(id) {
  const s = await snapshot(),
    control = s.controls.find((c) => c.id === id && !c.disabled);
  assert(control, `Visible enabled control ${id} on ${s.screen}`);
  const p = await point(control.x + control.w / 2, control.y + control.h / 2);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(70);
}
async function touch(type, p) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: p ? [{ ...p, radiusX: 5, radiusY: 5, id: 1 }] : [],
  });
}

async function shot(name) {
  await page.waitForTimeout(180);
  await page.screenshot({ path: path.join(out, name + '.png') });
}
async function check(name, run) {
  await run();
  results.push({ name, status: 'passed' });
  console.log('PASS ' + name);
}
function project(p, s, bounds) {
  const m = s.metalView,
    f = s.fit;
  const x = p.x * m.right.x + p.y * m.right.y + p.z * m.right.z;
  const y = -(p.x * m.up.x + p.y * m.up.y + p.z * m.up.z);
  return {
    x: bounds.x + ((f.x + (x - f.cx) * f.scale) / s.width) * bounds.width,
    y: bounds.y + ((f.y + (y - f.cy) * f.scale) / s.height) * bounds.height,
  };
}
async function dragTo(
  hint,
  { pointer = 'touch', cancel = false, hold = false, fraction = 1, mode = 'turn' } = {},
) {
  await tap(mode === 'turn' ? 'metal-turn' : 'metal-tilt');
  const s = await snapshot(),
    rect = await target.locator('#GameCanvas').boundingBox(),
    bounds = contentBounds(s, rect);
  const ring = s.state.rings.find((r) => r.id === hint.ringId);
  assert(ring && !ring.removed && !ring.wire.fixed);
  const all = s.state.rings
    .filter((r) => !r.removed && r.id !== ring.id)
    .flatMap((r) =>
      wirePaths(r)
        .flat()
        .map((p) => project(p, s, bounds)),
    );
  const choices = wirePaths(ring)
    .flat()
    .filter((_, i) => i % 3 === 0)
    .map((world) => {
      const p = project(world, s, bounds);
      return {
        world,
        p,
        clearance: Math.min(...all.map((a) => Math.hypot(a.x - p.x, a.y - p.y)), 999),
      };
    })
    .filter(
      (a) =>
        a.p.x > bounds.x + 12 &&
        a.p.x < bounds.x + bounds.width - 12 &&
        a.p.y > bounds.y + (150 * bounds.height) / s.height &&
        a.p.y < bounds.y + bounds.height - (155 * bounds.height) / s.height,
    );
  choices.sort((a, b) => b.clearance - a.clearance);
  const selected = choices[0];
  assert(selected, 'reachable wire surface');
  const start = selected.p,
    basis = wireBasis(ring),
    center = { x: ring.x, y: ring.y, z: ring.wire.z };
  const dx = selected.world.x - center.x,
    dy = selected.world.y - center.y,
    dz = selected.world.z - center.z;
  const u = dx * basis.u.x + dy * basis.u.y + dz * basis.u.z,
    v = dx * basis.v.x + dy * basis.v.y + dz * basis.v.z;
  const delta = normalizeAngle(hint.angle - ring.angle) * fraction;
  if (pointer === 'mouse') {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
  } else await touch('touchStart', start);
  assert.equal(
    (await snapshot()).drag?.ringId,
    ring.id,
    'real pointer selects the intended metal rod',
  );
  const count = 24;
  for (let i = 1; i <= count; i++) {
    let p;
    if (mode === 'tilt')
      p = {
        x: start.x,
        y:
          start.y -
          (((((((hint.tilt ?? 0) - (ring.tilt ?? 0)) * fraction * i) / count) * 240) / Math.PI) *
            bounds.height) /
            s.height,
      };
    else {
      const a = (delta * i) / count,
        x = u * Math.cos(a) - v * Math.sin(a),
        y = u * Math.sin(a) + v * Math.cos(a);
      p = project(
        {
          x: center.x + basis.u.x * x + basis.v.x * y,
          y: center.y + basis.u.y * x + basis.v.y * y,
          z: center.z + basis.u.z * x + basis.v.z * y,
        },
        s,
        bounds,
      );
    }
    if (pointer === 'mouse') await page.mouse.move(p.x, p.y);
    else await touch('touchMove', p);
    await page.waitForTimeout(6);
  }
  if (hold) return;
  if (cancel) {
    if (pointer === 'mouse') {
      await target
        .locator('#GameCanvas')
        .dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
      await page.mouse.up();
    } else await touch('touchCancel');
  } else if (pointer === 'mouse') await page.mouse.up();
  else await touch('touchEnd');
  await page.waitForTimeout(40);
}
async function solve(pointer = 'touch') {
  let count = 0;
  while ((await snapshot()).screen === 'playing') {
    const before = await snapshot();
    if (before.state.goalRingIds.every((id) => before.state.rings.find((r) => r.id === id).removed))
      break;
    const hint = findHint(before.state);
    assert(hint, 'physical hint exists');
    await dragTo(hint, { pointer });
    let s = await snapshot(),
      r = s.state.rings.find((r) => r.id === hint.ringId);
    if (Math.abs((hint.tilt ?? 0) - (r.tilt ?? 0)) > 0.002)
      await dragTo(hint, { pointer, mode: 'tilt' });
    r = (await snapshot()).state.rings.find((r) => r.id === hint.ringId);
    assert(
      Math.abs(normalizeAngle(r.angle - hint.angle)) < 0.025,
      'drag reaches the required gap angle',
    );
    assert(Math.abs((r.tilt ?? 0) - (hint.tilt ?? 0)) < 0.025, 'gesture reaches the required tilt');
    assert.equal(
      (await snapshot()).state.releasedCount,
      before.state.releasedCount,
      'rotation does not silently release',
    );
    const pullingPose = (await snapshot()).state;
    await tap('metal-pull');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('q');
    assert.deepEqual(
      (await snapshot()).state,
      pullingPose,
      'keyboard cannot change an in-flight physical pose',
    );
    await target.waitForFunction(
      (id) => globalThis.__orbit.snapshot().state.rings.find((r) => r.id === id).removed,
      hint.ringId,
      { timeout: 12000 },
    );
    const after = await snapshot();
    assert.equal(after.state.releasedCount, before.state.releasedCount + 1);
    assert(after.state.rings.filter((r) => r.wire.fixed).every((r) => !r.removed));
    assert(++count <= 4);
  }
  await screen('result');
}
try {
  await page.goto(url);
  await ready();
  await screen('home');
  await shot('metal-home');
  await check(
    'default game starts with an ordinary physical ring and a real narrow opening',
    async () => {
      await tap('levels');
      await screen('levels');
      assert((await snapshot()).controls.some((c) => c.id === 'level:metal-02' && c.disabled));
      await shot('metal-levels');
      await tap('home');
      await tap('start');
      await screen('playing');
      const s = await snapshot();
      assert.equal(s.state.levelId, 'metal-01');
      assert(s.state.rings.every((r) => r.wire.shape === 'circle'));
      assert(s.state.rings.some((r) => r.gap === 0));
      assert(s.state.rings.some((r) => r.gap > 0 && r.gap < 0.5));
      await shot('metal-circle');
    },
  );
  if (mediaOnly) {
    const before = (await snapshot()).state;
    const ring = before.rings.find((r) => !r.wire.fixed);
    await dragTo(
      { ringId: ring.id, angle: ring.angle, tilt: 0.15 },
      { mode: 'tilt', pointer: 'mouse' },
    );
    assert(Math.abs((await snapshot()).state.rings.find((r) => r.id === ring.id).tilt) > 0.08);
    await page.waitForTimeout(400);
    await tap('undo');
    assert.deepEqual((await snapshot()).state, before);
    await tap('metal-turn');
  }
  if (!mediaOnly) {
    await check(
      'backwards gap cannot release and pausing cancels an unfinished extraction',
      async () => {
        const before = (await snapshot()).state;
        await tap('metal-pull');
        assert.equal((await snapshot()).metalPull.clear, false);
        await page.waitForTimeout(150);
        await tap('pause');
        await screen('paused');
        assert.equal((await snapshot()).metalPull, null);
        assert.deepEqual((await snapshot()).state, before);
        await tap('resume');
        await screen('playing');
        await tap('metal-pull');
        await target.waitForFunction(() => !globalThis.__orbit.snapshot().metalPull);
        assert.deepEqual((await snapshot()).state, before);
      },
    );
    await check('mouse and native touch cancellation restore physical angle and tilt', async () => {
      for (const pointer of ['mouse', 'touch']) {
        const before = await snapshot(),
          hint = findHint(before.state);
        await dragTo(hint, { pointer, cancel: true, fraction: 0.35 });
        assert.deepEqual((await snapshot()).state, before.state);
        assert.equal((await snapshot()).drag, null);
      }
    });
    await check(
      'tilting moves a real plane, undo restores it, and observation never mutates the puzzle',
      async () => {
        const before = await snapshot(),
          r = before.state.rings.find((r) => !r.wire.fixed);
        await dragTo({ ringId: r.id, angle: r.angle, tilt: 0.15 }, { mode: 'tilt' });
        assert(Math.abs((await snapshot()).state.rings.find((a) => a.id === r.id).tilt) > 0.08);
        await tap('undo');
        assert.equal(JSON.stringify((await snapshot()).state), JSON.stringify(before.state));
        const p = await point(25, 185);
        await touch('touchStart', p);
        await touch('touchMove', { x: p.x + 40, y: p.y + 15 });
        await touch('touchEnd');
        const after = await snapshot();
        assert.deepEqual(after.state, before.state);
        assert.notEqual(after.metalView.yaw, before.metalView.yaw);
        await tap('pause');
        await tap('retry');
        await screen('playing');
      },
    );
  }
  await check(
    'all twelve levels, circular then actual noncircular parts, complete using real player input',
    async () => {
      for (const [index, level] of METAL_LEVELS.entries()) {
        const s = await snapshot();
        assert.equal(s.state.levelId, level.id);
        if (index < 6) assert(s.state.rings.every((r) => r.wire.shape === 'circle'));
        else assert(s.state.rings.some((r) => r.wire.shape !== 'circle'));
        if ([0, 2, 6, 7, 9, 11].includes(index)) await shot('metal-playing-' + (index + 1));
        await solve(index === 0 ? 'mouse' : 'touch');
        const result = await snapshot();
        assert.equal(result.medal, 3);
        assert.equal(result.progress.medals[level.id], 3);
        if ([0, 9, 11].includes(index)) await shot('metal-result-' + (index + 1));
        await tap('next');
      }
      await screen('levels');
      await tap('chapter:1');
      await shot('metal-shape-levels');
    },
  );
  await check(
    'complex wire geometry remains visible and selectable across phone, tablet and landscape',
    async () => {
      await page.goto(new URL('?challenge=metal-12', url).href);
      await ready();
      for (const [width, height, name] of [
        [390, 844, 'portrait'],
        [320, 640, 'small'],
        [768, 1024, 'tablet'],
        [844, 390, 'landscape'],
      ]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(250);
        await shot('metal-complex-' + name);
        const before = (await snapshot()).state,
          hint = findHint(before);
        await dragTo(hint, { cancel: true, fraction: 0.25 });
        assert.deepEqual((await snapshot()).state, before);
        await tap('pause');
        await screen('paused');
        await tap('resume');
        await screen('playing');
      }
      await page.setViewportSize({ width: 390, height: 844 });
    },
  );
  if (!mediaOnly)
    await check(
      'legacy current run survives starting metal, and both resume after reload',
      async () => {
        await page.goto(url);
        await ready();
        const old = { state: createState(NOVA_LEVELS[0]), moves: 1, hints: 0 };
        old.state.rings[0].angle = 0.4;
        // Leave the controller before installing a fixture: pagehide persists its current run.
        const fixtureURL = new URL('/fixture-reset', url).href;
        await page.route(fixtureURL, (route) =>
          route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html>' }),
        );
        await page.goto(fixtureURL);
        await page.evaluate((old) => {
          localStorage.setItem(
            'orbit-atelier.v2',
            JSON.stringify({
              version: 2,
              medals: { 'orbit-01': 2 },
              settings: { sound: false, vibration: false, reducedMotion: false },
              run: old,
            }),
          );
        }, old);
        await page.goto(url);
        await ready();
        await tap('start');
        assert.equal((await snapshot()).state.levelId, 'metal-01');
        assert(Math.abs((await snapshot()).progress.runs.nova.state.rings[0].angle - 0.4) < 1e-9);
        await tap('pause');
        await tap('home');
        await tap('settings');
        await tap('legacy-nova');
        await tap('level:nova-01');
        assert(Math.abs((await snapshot()).state.rings[0].angle - 0.4) < 1e-9);
        assert.equal((await snapshot()).progress.runs.metal.state.levelId, 'metal-01');
        await page.reload();
        await ready();
        await tap('start');
        assert.equal((await snapshot()).state.levelId, 'metal-01');
        assert.equal((await snapshot()).progress.medals['orbit-01'], 2);
      },
    );
  assert.deepEqual(errors, []);
} catch (error) {
  failure = String(error);
  await shot('metal-failure').catch(() => {});
  console.error(JSON.stringify(await snapshot().catch(() => null)));
  throw error;
} finally {
  await writeFile(
    path.join(out, mediaOnly ? 'metal-media-verification.json' : 'metal-verification.json'),
    JSON.stringify(
      {
        status: failure ? 'failed' : 'passed',
        failure,
        sourceHash: await sourceHash(),
        engine: 'Cocos Creator 3.8.8',
        environment:
          'Chromium desktop mobile emulation; real mouse and native CDP touch; not physical-device acceptance',
        results,
        errors,
      },
      null,
      2,
    ),
  );
  if (process.env.ORBIT_RECORD_VIDEO) {
    await context.close();
    await page.video()?.saveAs(path.join(out, 'metal-actual-play.webm'));
  }
  await browser.close();
  server?.close();
}
