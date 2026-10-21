import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'node:http';
import { sourceHash, runtimeManifest } from '../scripts/artifact.mjs';
import { chromium } from '@playwright/test';
import { findHint, normalizeAngle, hasBandAt, createState } from '../assets/scripts/core/rules.ts';

import { CLASSIC_LEVELS } from '../assets/scripts/core/catalog.ts';

// Observation never mutates gameplay. All play actions use native CDP touch events.
const root = fileURLToPath(new URL('../', import.meta.url));
const publishingOnly = process.argv.includes('--publishing');
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
const out =
  process.env.ORBIT_EVIDENCE_DIR || path.join(root, 'docs/design/cocos-rebuild-2026-10-21/actual');
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
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(String(error)));
const cdp = await context.newCDPSession(page);
let target = page;
const snapshot = () => target.evaluate(() => globalThis.__orbit?.snapshot());
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
  return { x: rect.x + (x / s.width) * rect.width, y: rect.y + (y / s.height) * rect.height };
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
async function gesture(hint, mode = 'release', expectFlight = false) {
  const s = await snapshot(),
    r = s.state.rings.find((r) => r.id === hint.ringId),
    fit = s.fit;
  assert(r && !r.removed);
  const candidates = Array.from({ length: 48 }, (_, i) => (i * Math.PI) / 24).filter((a) =>
    hasBandAt(r, a),
  );
  const clearance = (a) =>
    Math.min(
      ...s.state.rings
        .filter((o) => o.id !== r.id && !o.removed)
        .map((o) =>
          Math.abs(Math.hypot(r.x + Math.cos(a) * r.r - o.x, r.y + Math.sin(a) * r.r - o.y) - o.r),
        ),
      1000,
    );
  candidates.sort((a, b) => clearance(b) - clearance(a));
  const start = candidates[0],
    delta = normalizeAngle(hint.angle - r.angle);
  const coord = async (angle) =>
    point(
      fit.x + (r.x - fit.cx + Math.cos(angle) * r.r) * fit.scale,
      fit.y + (r.y - fit.cy + Math.sin(angle) * r.r) * fit.scale,
    );
  await touch('touchStart', await coord(start));
  if (expectFlight) {
    const started = await snapshot();
    assert.equal(started.drag?.ringId, r.id);
    assert(started.flights > 0, 'The next drag starts while the previous ring is flying');
  }
  for (let i = 1; i <= 24; i++) {
    await touch('touchMove', await coord(start + (delta * i) / 24));
    await page.waitForTimeout(8);
  }
  const selected = await snapshot();
  assert.equal(selected.selectedRingId, r.id, 'The finger selects the intended solid ring');
  if (mode === 'cancel') {
    assert.notDeepEqual(selected.state, s.state, 'Cancellation exercises a moved gesture');
    await touch('touchCancel');
    return;
  }
  if (mode === 'hold') return { start, coord, delta, ring: r };
  await touch('touchEnd');
  await page.waitForTimeout(70);
  assert(
    (await snapshot()).state.rings.find((ring) => ring.id === r.id).removed,
    'Actual rotation and release remove the ring',
  );
}
async function shot(name) {
  await page.waitForTimeout(550);
  await page.screenshot({ path: path.join(out, name + '.png') });
}
async function check(name, fn) {
  try {
    await fn();
  } catch (error) {
    results.push({ name, status: 'failed', error: String(error) });
    throw error;
  }
  results.push({ name, status: 'passed' });
  console.log(`PASS ${name}`);
}
async function finish() {
  let count = 0;
  const maximumReleases = (await snapshot()).state.rings.filter((r) => !r.removed).length;
  while ((await snapshot()).screen === 'playing') {
    const s = await snapshot();
    const hint = findHint(s.state);
    if (!hint) break;
    await gesture(hint);
    assert(++count <= maximumReleases, 'Every gesture removes one of the original remaining rings');
  }
  await screen('result');
}
const saved = () => target.evaluate(() => localStorage.getItem('orbit-atelier.v2'));
try {
  const info = await (await context.request.get(new URL('build-info.json', url).href)).json();
  assert.equal(info.creator, '3.8.8');
  assert.equal(
    info.sourceHash,
    await sourceHash(),
    'Browser evidence belongs to the current source',
  );
  if (publishingOnly) {
    await context.addInitScript(() => {
      globalThis.SmallGamesPublishingConfig = {
        publicUrl: 'https://example.test/orbit/?dev=1&token=private#private',
      };
      globalThis.shareProbe = { mode: 'copy', copies: [], shares: [] };
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (payload) => {
          shareProbe.shares.push(payload);
          if (shareProbe.mode === 'cancel') throw new DOMException('Cancelled', 'AbortError');
          if (shareProbe.mode === 'copy')
            throw new DOMException('Unavailable', 'NotSupportedError');
        },
      });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text) => {
            shareProbe.copies.push(text);
          },
        },
      });
    });
    await page.goto(url);
    await ready();
    await tap('start');
    const baseline = await saved();
    await page.goto(new URL('?challenge=nova-02&dev=0', url).href);
    await ready();
    await check('challenge hint and undo preserve hint cost and normal progress', async () => {
      assert((await snapshot()).challenge);
      await tap('hint');
      await gesture(findHint((await snapshot()).state));
      await tap('undo');
      assert.equal((await snapshot()).hints, 1);
      assert.equal((await snapshot()).state.releasedCount, 0);
      assert.equal(await saved(), baseline);
      await finish();
      assert.equal((await snapshot()).medal, 1);
      assert.equal(await saved(), baseline);
    });
    await check(
      'share uses configured public URL and strips inherited private parameters',
      async () => {
        await tap('share');
        await page.waitForFunction(
          () => globalThis.__orbit.snapshot().shareStatus === '挑战链接已复制',
        );
        const probe = await page.evaluate(() => shareProbe);
        assert.equal(probe.copies.length, 1);
        assert.equal(probe.copies[0], 'https://example.test/orbit/?challenge=nova-02');
        assert.equal(await saved(), baseline);
      },
    );
    await check('cancelled system share does not copy or award progress', async () => {
      await page.evaluate(() => {
        shareProbe.mode = 'cancel';
      });
      await tap('share');
      await page.waitForFunction(() => globalThis.__orbit.snapshot().shareStatus === '已取消分享');
      assert.equal(await page.evaluate(() => shareProbe.copies.length), 1);
      assert.equal(await saved(), baseline);
      assert.equal(await page.locator('[data-game-ad]').count(), 0);
      await tap('home');
      assert.equal((await snapshot()).state.levelId, 'nova-01');
      assert.equal((await snapshot()).challenge, false);
    });
    await check('invalid and repeated challenge parameters do not start a challenge', async () => {
      for (const query of ['?challenge=missing', '?challenge=nova-01&challenge=nova-02']) {
        await page.goto(new URL(query, url).href);
        await ready();
        assert.equal((await snapshot()).screen, 'home');
        assert.equal((await snapshot()).challenge, false);
      }
    });
  } else {
    await page.goto(url);
    await ready();
    await screen('home');
    await shot('mobile-home');
    await check('native Cocos engine, home and locked map', async () => {
      assert.equal((await snapshot()).engine, 'Cocos Creator 3.8.8');
      assert.equal(
        await page.locator('#game-display-notice').isVisible(),
        false,
        'No empty fullscreen notice covers the footer',
      );
      await tap('levels');
      await screen('levels');
      assert((await snapshot()).controls.some((c) => c.id === 'level:nova-02' && c.disabled));
      await shot('mobile-levels');
      await tap('home');
      await tap('start');
      await screen('playing');
      await shot('mobile-playing');
    });
    await check('touch cancellation restores the complete pre-gesture state', async () => {
      const before = await snapshot(),
        persisted = await saved();
      await gesture(findHint(before.state), 'cancel');
      const after = await snapshot();
      assert.deepEqual(after.state, before.state);
      assert.equal(after.moves, before.moves);
      assert.equal(after.hints, before.hints);
      assert.equal(await saved(), persisted);
      assert.equal((await snapshot()).drag, null);
    });
    await check('slow dragging can leave magnetic alignment without sticking', async () => {
      const before = await snapshot(),
        hint = findHint(before.state),
        held = await gesture(hint, 'hold');
      await shot('mobile-aligned');
      for (let i = 1; i <= 16; i++) {
        await touch('touchMove', await held.coord(held.start + held.delta + (i * Math.PI) / 180));
        await page.waitForTimeout(8);
      }
      const ring = (await snapshot()).state.rings.find((r) => r.id === hint.ringId);
      assert(Math.abs(normalizeAngle(ring.angle - hint.angle)) > 0.15);
      await touch('touchCancel');
      assert.deepEqual((await snapshot()).state, before.state);
    });
    await check('pause, resume and the blur handler keep the attempt', async () => {
      const before = (await snapshot()).state;
      await tap('pause');
      await screen('paused');
      await shot('mobile-paused');
      await tap('resume');
      await screen('playing');
      assert.deepEqual((await snapshot()).state, before);
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await screen('paused');
      await tap('resume');
      assert.deepEqual((await snapshot()).state, before);
    });
    await check('all 24 main levels complete through native touch and normal unlocks', async () => {
      for (let index = 0; index < 24; index++) {
        let s = await snapshot();
        assert.equal(s.state.levelId, `nova-${String(index + 1).padStart(2, '0')}`);
        let moves = 0;
        while (
          s.screen === 'playing' &&
          !s.state.goalRingIds.every((id) => s.state.rings.find((r) => r.id === id).removed)
        ) {
          const hint = findHint(s.state);
          assert(hint);
          await gesture(hint);
          moves++;
          if (moves === 1 && index === 1) {
            // A successful flight is presentation-only: immediately grab another ring.
            const next = findHint((await snapshot()).state);
            if (next) {
              assert((await snapshot()).flights > 0);
              await gesture(next, 'hold', true);
              assert.equal((await snapshot()).selectedRingId, next.ringId);
              await touch('touchCancel');
            }
          }
          s = await snapshot();
          assert(moves < 12);
        }
        await screen('result');
        s = await snapshot();
        assert.equal(s.medal, 3);
        assert.equal(s.progress.medals[s.state.levelId], 3);
        if ([0, 5, 11, 17, 23].includes(index)) await shot(`result-${index + 1}`);
        if (index < 23) {
          await tap('next');
          await screen('playing');
        }
      }
    });
    await check('settings, classic preservation and responsive screens', async () => {
      await tap('home');
      await tap('settings');
      await shot('mobile-settings');
      await tap('help');
      await screen('help');
      await shot('mobile-help');
      await tap('back');
      await tap('classic');
      await screen('levels');
      assert((await snapshot()).controls.some((c) => c.id === 'level:orbit-01' && !c.disabled));
      await tap('home');
      for (const [width, height, name] of [
        [320, 640, 'mobile-small'],
        [844, 390, 'mobile-landscape'],
      ]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(300);
        await shot(name);
        await tap('settings');
        const s = await snapshot();
        assert(
          s.controls.every((c) => c.y >= 0 && c.y + c.h <= s.height),
          'Settings controls stay inside viewport',
        );
        await tap('home');
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await ready();
      assert.equal(
        Object.keys((await snapshot()).progress.medals).filter((id) => id.startsWith('nova-'))
          .length,
        24,
      );
    });
    await check('explicit developer mode stays isolated from player progress', async () => {
      const clean = new URL('__orbit_clean.html', url).href;
      await page.route(clean, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>Storage fixture</title>',
        }),
      );
      await page.goto(clean);
      await page.evaluate(() => {
        localStorage.removeItem('orbit-atelier.v2');
        localStorage.removeItem('orbit-atelier.v1');
      });
      await page.goto(new URL('?dev=1', url).href);
      await ready();
      await page
        .getByRole('button', { name: /开发者|调试/ })
        .first()
        .click();
      assert(await page.evaluate(() => window.SmallGamesDev.isEnabled()));
      const before = (await snapshot()).progress;
      assert.deepEqual(before.medals, {}, 'Trial starts with the final level still locked');
      // Use the actual public developer action button when its panel is open.
      const trial = page.getByRole('button', { name: '试玩最终星盘（不存进度）', exact: true });
      const persisted = await saved();
      assert.equal(await trial.count(), 1);
      {
        await trial.click();
        await page.getByRole('button', { name: '关闭', exact: true }).click();
        await screen('playing');
        assert((await snapshot()).practice);
        await finish();
        assert.equal(await saved(), persisted);
        await tap('home');
        assert.deepEqual((await snapshot()).progress, before);
      }
      await page.goto(new URL('?dev=0', url).href);
      await ready();
      assert.equal(await page.evaluate(() => window.SmallGamesDev.isEnabled()), false);
    });
    await check(
      'compiled classic final map retains authored geometry and completes by touch',
      async () => {
        await page.goto(new URL('?challenge=orbit-74&dev=0', url).href);
        await ready();
        assert.deepEqual((await snapshot()).state, createState(CLASSIC_LEVELS.at(-1)));
        await finish();
        assert.equal((await snapshot()).medal, 3);
      },
    );
    await check('sandbox iframe plays through native touch, pause and resume', async () => {
      const host = new URL('__orbit_frame.html', url).href;
      await page.route(host, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><iframe src="${new URL('?challenge=nova-02&dev=0', url).href}" sandbox="allow-scripts allow-same-origin" allow="fullscreen" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>`,
        }),
      );
      await page.goto(host);
      await page.waitForSelector('iframe');
      target = await (await page.locator('iframe').elementHandle()).contentFrame();
      assert(target);
      await ready();
      await screen('playing');
      await gesture(findHint((await snapshot()).state));
      const before = (await snapshot()).state;
      await tap('pause');
      await screen('paused');
      await tap('resume');
      assert.deepEqual((await snapshot()).state, before);
      await finish();
      await shot('iframe-result');
      target = page;
    });
    await check('disabled storage still allows a complete touch-played level', async () => {
      await page.addInitScript(() => {
        Storage.prototype.getItem = Storage.prototype.setItem = () => {
          throw new DOMException('Blocked', 'SecurityError');
        };
      });
      await page.goto(url);
      await ready();
      await tap('start');
      await finish();
      assert.equal((await snapshot()).medal, 3);
    });
  }
  assert.deepEqual(errors, []);
} catch (error) {
  failure = String(error);
  throw error;
} finally {
  await writeFile(
    path.join(out, publishingOnly ? 'publishing-verification.json' : 'verification.json'),
    JSON.stringify(
      {
        status: failure ? 'failed' : 'passed',
        failure,
        sourceHash: await sourceHash(),
        engine: 'Cocos Creator 3.8.8',
        environment:
          'Chromium desktop mobile emulation; native CDP touch; not physical-device acceptance',
        browser: browser.version(),
        url,
        results,
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
  server?.close();
}
