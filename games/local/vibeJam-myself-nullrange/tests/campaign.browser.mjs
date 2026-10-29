import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';
import { pilot } from './pilot.mjs';
const root = fileURLToPath(new URL('../', import.meta.url)),
  port = 43174;
const report = {
  sourceHash: JSON.parse(await readFile(root + 'dist/build-info.json', 'utf8')).sourceHash,
  runs: [],
  errors: [],
};
const capture = process.env.NULLRANGE_CAPTURE === '1';
await mkdir(root + 'reports/campaign', { recursive: true });
const server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], {
  cwd: root,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'inherit'],
});
let browser;
try {
  await new Promise((resolve, reject) => {
    server.stdout.once('data', resolve);
    server.once('error', reject);
  });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
  });
  const context = await browser.newContext({
    viewport: capture ? { width: 1280, height: 720 } : { width: 844, height: 390 },
    ...(capture
      ? {
          recordVideo: { dir: root + 'reports/campaign/video', size: { width: 1280, height: 720 } },
        }
      : {}),
    userAgent: devices['Pixel 7'].userAgent,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const recordingStart = Date.now();
  page.on('pageerror', (e) => report.errors.push(String(e)));
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push(message.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400) report.errors.push(r.status() + ' ' + r.url());
  });
  await page.goto(`http://127.0.0.1:${port}/?dev=0`);
  const snap = () => page.evaluate(() => SmallGamesDev.inspect().game);
  await page.waitForFunction(
    () => SmallGamesDev.inspect().game?.world.ready && SmallGamesDev.inspect().game?.atlasReady,
    null,
    { timeout: 60000 },
  );
  assert.equal(await page.evaluate(() => SmallGamesDev.isEnabled()), false);
  assert.equal(await page.evaluate(() => !!globalThis.__nullrange), false);
  const tap = async (id) => {
    const s = await snap(),
      c = s.controls.find((c) => c.id === id && !c.disabled);
    assert.ok(c, 'enabled ' + id);
    await page.touchscreen.tap((c.x + c.w / 2) * s.scale, (c.y + c.h / 2) * s.scale);
    await page.waitForTimeout(150);
  };
  const shot = async (name) =>
    page.screenshot({ path: root + 'reports/campaign/' + name + '.png' });
  const cdp = await context.newCDPSession(page);
  let held = new Map(),
    stickOrigin = null;
  const touch = async (next) => {
    // CDP touchEnd requires an empty point list: release and re-grab surviving contacts.
    if ([...held.keys()].some((id) => !next.has(id))) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      held.clear();
    }
    const added = [...next.keys()].some((id) => !held.has(id));
    if (added)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [...next.values()].map((p) =>
          p.id === 1 && !held.has(1) ? { ...p, ...stickOrigin } : p,
        ),
      });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [...next.values()],
    });
    held = next;
    assert.ok((await snap()).input.pointers <= next.size, 'released touch contacts do not stick');
  };
  const ids = [
    'dawn-patrol',
    'ridge-intercept',
    'echo-recovery',
    'valley-escort',
    'crosswind',
    'last-light',
  ];
  const limit = Number(process.env.NULLRANGE_CAMPAIGN_LIMIT || 6);
  for (let i = 0; i < limit; i++) {
    const id = ids[i];
    if (i === 0) await tap('missions');
    else await tap('next');
    assert.equal((await snap()).state.mission.id, id);
    await shot('mission-' + id);
    if (i === 2 || i === 4) {
      await tap('prepare');
      await tap(i === 2 ? 'craft:kestrel' : 'craft:warden');
      await shot(i === 2 ? 'hangar-kestrel' : 'hangar-warden');
    }
    await tap('start');
    const initial = await snap(),
      stick = initial.controls.find((c) => c.id === 'stick');
    stickOrigin = {
      x: (stick.x + stick.w / 2) * initial.scale,
      y: (stick.y + stick.h / 2) * initial.scale,
    };
    await touch(new Map([[1, { id: 1, ...stickOrigin }]]));
    const start = Date.now();
    const videoStart = (start - recordingStart) / 1000;
    let seenTick = -1,
      first = null,
      maxDraws = 0,
      maxTriangles = 0,
      lastLog = 0,
      captured = false,
      missilePulse = false,
      scanPulse = false;
    while (true) {
      const s = await snap(),
        state = s.state;
      if (state.status !== 'running') break;
      assert.equal(s.screen, 'playing', 'campaign must not silently wait through a pause');
      if (Date.now() - start > state.mission.timeLimit * 3500)
        throw Error('Browser did not finish in wall budget ' + id);
      maxDraws = Math.max(maxDraws, s.world.drawCalls);
      maxTriangles = Math.max(maxTriangles, s.world.triangles);
      if (first === null && state.impacts.some((e) => e.kind === 'hit')) first = state.tick / 60;
      if (state.tick === seenTick) {
        await page.waitForTimeout(40);
        continue;
      }
      seenTick = state.tick;
      const escorts = state.enemies.filter((e) => !e.priority);
      const input = pilot(i === 1 && escorts.length ? { ...state, enemies: escorts } : state),
        next = new Map(),
        point = (name, id, dx = 0, dy = 0) => {
          const c = s.controls.find((c) => c.id === name);
          return { id, x: (c.x + c.w / 2 + dx) * s.scale, y: (c.y + c.h / 2 + dy) * s.scale };
        };
      if (i === 1) input.boost = false;
      const enabled = (name) => s.controls.some((c) => c.id === name && !c.disabled);
      next.set(1, point('stick', 1, input.x * 45, -input.y * 45));
      if (input.fire && enabled('fire')) next.set(2, point('fire', 2));
      if (input.boost && enabled('boost')) next.set(3, point('boost', 3));
      if (input.missile && !missilePulse && enabled('missile')) next.set(4, point('missile', 4));
      if (input.scan && !scanPulse && enabled('scan')) next.set(5, point('scan', 5));
      missilePulse = next.has(4);
      scanPulse = next.has(5);
      await touch(next);
      if (state.tick > lastLog + 1200) {
        lastLog = state.tick;
        console.log(
          id,
          Math.round(state.tick / 60) + 's',
          'wave',
          state.wave + 1,
          'kills',
          state.kills,
          'hull',
          Math.round(state.player.hull),
          'input',
          JSON.stringify(s.input),
          'desired',
          JSON.stringify(input),
        );
      }
      if (lastLog > 0 && !captured) {
        await shot('combat-' + id);
        captured = true;
      }
      await page.waitForTimeout(55);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    held.clear();
    await page.waitForTimeout(200);
    const result = await snap();
    await shot('result-' + id);
    report.runs.push({
      mission: id,
      strategy: i === 1 ? 'escorts first; no boost; normal touch inputs' : 'normal touch inputs',
      craft: result.state.craft.id,
      status: result.state.status,
      reason: result.state.reason,
      seconds: result.state.tick / 60,
      wallSeconds: (Date.now() - start) / 1000,
      videoStart,
      firstContact: first,
      kills: result.state.kills,
      recovered: result.state.recovered,
      hull: result.state.player.hull,
      progress: result.progress,
      maxDraws,
      maxTriangles,
      world: result.world,
    });
    await writeFile(root + 'reports/campaign/report.json', JSON.stringify(report, null, 2));
    assert.equal(result.practice, false);
    assert.equal(result.state.status, 'won', id + ': ' + result.state.reason);
    assert.ok(result.progress.completed[id]);
    console.log('PASS normal touch campaign', id, result.state.tick / 60, 'seconds');
  }
  const saved = (await snap()).progress;
  await page.reload();
  await page.waitForFunction(() => SmallGamesDev.inspect().game?.world.ready, null, {
    timeout: 60000,
  });
  assert.deepEqual((await snap()).progress, saved);
  assert.deepEqual(report.errors, []);
  await context.close();
  if (capture) report.video = await page.video().path();
} finally {
  await writeFile(root + 'reports/campaign/report.json', JSON.stringify(report, null, 2));
  await browser?.close();
  server.kill();
}
