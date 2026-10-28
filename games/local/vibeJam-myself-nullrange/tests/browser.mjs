import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';
import { pilot } from './pilot.mjs';
const root = fileURLToPath(new URL('../', import.meta.url)),
  port = Number(process.env.NULLRANGE_TEST_PORT || 43172);
const report = {
  date: new Date().toISOString(),
  sourceHash: JSON.parse(await readFile(root + 'dist/build-info.json', 'utf8')).sourceHash,
  checks: [],
  errors: [],
  engineDiagnostics: [],
};
await mkdir(root + 'reports/browser', { recursive: true });
const server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], {
  cwd: root,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'inherit'],
});
let browser;
const check = (name) => {
  report.checks.push(name);
  console.log('PASS ' + name);
};
try {
  await new Promise((resolve, reject) => {
    server.stdout.once('data', resolve);
    server.once('error', reject);
    server.once('exit', (c) => reject(Error('server exited ' + c)));
  });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    userAgent: devices['Pixel 7'].userAgent,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => {
    report.errors.push(e.stack || String(e));
    console.error(e.stack || e);
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // Creator 3.8.8 pal/input/web/touch-input.ts prevents default even on native noncancelable cancellation.
    if (
      message.text() ===
      'Ignored attempt to cancel a touchcancel event with cancelable=false, for example because scrolling is in progress and cannot be interrupted.'
    )
      report.engineDiagnostics.push(message.text());
    else report.errors.push(message.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400) report.errors.push(`${r.status()} ${r.url()}`);
  });
  const base = `http://127.0.0.1:${port}/`;
  await page.goto(base + '?dev=0');
  await page.waitForSelector('#nullrange-loading', { state: 'detached', timeout: 60000 });
  assert.equal(await page.evaluate(() => !!globalThis.__nullrange), false);
  assert.equal(await page.evaluate(() => SmallGamesDev.isEnabled()), false);
  check('default production Cocos entry, dev explicitly off');
  await page.evaluate(() => {
    localStorage.setItem('nullrange-cn-best', '314');
    localStorage.setItem('nullrange-cn-muted', 'true');
  });
  await page.goto(base + '?dev=1');
  await page.waitForFunction(() => globalThis.__nullrange?.snapshot().world.ready, null, {
    timeout: 60000,
  });
  const snap = () => page.evaluate(() => __nullrange.snapshot());
  const world = (await snap()).world;
  assert.equal(world.modelsLoaded, 17);
  assert.equal(world.texturesLoaded, 5);
  assert.deepEqual(world.errors, []);
  assert.equal(world.terrainMeshes, 49);
  assert.ok(world.instancedPasses > 0);
  assert.ok(world.meshes <= 70);
  assert.ok(world.drawCalls > 0 && world.drawCalls < 200);
  assert.ok(world.triangles > 10000 && world.triangles < 180000);
  report.world = world;
  check('17 native GLB Prefabs + 5 textures loaded, collidable terrain and actual GPU counters');
  const point = async (x, y) => {
    const s = await snap(),
      v = page.viewportSize();
    return v.width < v.height
      ? { x: v.width - y * s.scale, y: x * s.scale }
      : { x: x * s.scale, y: y * s.scale };
  };
  const tap = async (id) => {
    const s = await snap(),
      c = s.controls.find((c) => c.id === id && !c.disabled);
    assert.ok(c, 'enabled ' + id);
    const p = await point(c.x + c.w / 2, c.y + c.h / 2);
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForTimeout(150);
  };
  const shot = async (name) => page.screenshot({ path: root + `reports/browser/${name}.png` });
  for (const [width, height] of [
    [667, 375],
    [844, 390],
    [932, 430],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    const s = await snap();
    assert.ok(s.controls.every((c) => Math.min(c.w, c.h) * s.scale >= 43.9));
    await shot(`home-${width}x${height}`);
    await tap('online');
    assert.equal((await snap()).screen, 'online');
    await tap('back');
    await tap('missions');
    await tap('start');
    assert.equal((await snap()).screen, 'playing');
    const running = await snap();
    await shot(`flight-${width}x${height}`);
    report.checks.push({ viewport: `${width}x${height}`, world: running.world });
    assert.ok(running.controls.every((c) => Math.min(c.w, c.h) * running.scale >= 43.9));
    await tap('pause');
    assert.equal((await snap()).screen, 'paused');
    await tap('home');
    check(`${width}x${height}: Cocos tap navigation, rotated fallback, >=44px targets`);
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(250);
  await tap('missions');
  await tap('start');
  const cdp = await context.newCDPSession(page);
  const s = await snap(),
    stick = s.controls.find((c) => c.id === 'stick'),
    fire = s.controls.find((c) => c.id === 'fire');
  const a = await point(stick.x + stick.w / 2 + 25, stick.y + stick.h / 2),
    b = await point(fire.x + fire.w / 2, fire.y + fire.h / 2);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { ...a, id: 1 },
      { ...b, id: 2 },
    ],
  });
  await page.waitForTimeout(350);
  assert.equal((await snap()).input.pointers, 2);
  assert.ok((await snap()).state.heat > 0);
  await shot('flight-multitouch');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.waitForTimeout(100);
  assert.equal((await snap()).input.pointers, 0);
  check('simultaneous stick + fire and touch cancellation');
  await page.keyboard.down('Space');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(150);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const paused = await snap();
  assert.equal(paused.screen, 'paused');
  assert.equal(paused.input.keys, 0);
  const tick = paused.state.tick;
  const allocated = paused.world.modelInstancesCreated;
  await page.waitForTimeout(400);
  assert.equal((await snap()).state.tick, tick);
  assert.equal(
    (await snap()).world.modelInstancesCreated,
    allocated,
    'stationary scene allocates no model instances',
  );
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyD');
  check('blur clears input and pauses without catch-up');
  await shot('paused');
  await tap('home');
  await tap('missions');
  await tap('start');
  // Browser pilot drives actual Cocos keyboard events; snapshots are read-only.
  let held = new Set();
  for (let i = 0; i < 650; i++) {
    const state = (await snap()).state;
    if (state.status !== 'running') break;
    const desired = pilot(state),
      next = new Set();
    if (desired.x > 0.12) next.add('KeyD');
    if (desired.x < -0.12) next.add('KeyA');
    if (desired.y > 0.12) next.add('KeyW');
    if (desired.y < -0.12) next.add('KeyS');
    if (desired.fire) next.add('Space');
    for (const key of held) if (!next.has(key)) await page.keyboard.up(key);
    for (const key of next) if (!held.has(key)) await page.keyboard.down(key);
    held = next;
    if (desired.missile) await page.keyboard.press('KeyE');
    if (desired.scan) await page.keyboard.press('KeyQ');
    await page.waitForTimeout(80);
  }
  for (const key of held) await page.keyboard.up(key);
  const won = await snap();
  report.victory = won.state;
  assert.equal(won.state.status, 'won');
  assert.equal(won.screen, 'result');
  assert.equal(won.progress.best, 314, 'development run does not write best');
  await shot('victory');
  check(`normal browser flight victory, ${won.state.tick} ticks, ${won.state.score} score`);
  await tap('restart');
  assert.equal((await snap()).state.player.hull, 100);
  await page.keyboard.down('KeyS');
  await page.waitForFunction(() => __nullrange.snapshot().state.status === 'lost', null, {
    timeout: 60000,
  });
  await page.keyboard.up('KeyS');
  assert.match((await snap()).state.reason, /地形/);
  report.failure = (await snap()).state;
  await shot('failure');
  await tap('restart');
  assert.equal((await snap()).screen, 'playing');
  check('normal terrain failure and restart');
  await tap('pause');
  await tap('settings');
  await tap('sound');
  await tap('reduced');
  await tap('sensitivity');
  await shot('settings');
  await tap('back');
  assert.equal((await snap()).screen, 'paused');
  const preferences = (await snap()).progress;
  await page.reload();
  await page.waitForFunction(() => globalThis.__nullrange?.snapshot().world.ready);
  assert.deepEqual((await snap()).progress, preferences);
  check('settings persistence and pause return path');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForFunction(() => globalThis.__nullrange?.snapshot().world.ready);
  await tap('online');
  assert.equal((await snap()).screen, 'online');
  await tap('back');
  await shot('portrait-cold-boot');
  check('portrait cold boot and touch mapping');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.route(base + 'host-fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><style>body{margin:0}iframe{border:0;width:100vw;height:100vh}</style><script>window.displayMessages=[];addEventListener("message",e=>{if(e.origin===location.origin&&e.source===document.querySelector("iframe").contentWindow)displayMessages.push(e.data)})</script><iframe src="./?dev=1"></iframe>',
    }),
  );
  await page.goto(base + 'host-fixture');
  await page.waitForFunction(
    () => document.querySelector('iframe')?.contentWindow.__nullrange?.snapshot().world.ready,
  );
  const frame = page.frames().find((f) => f.url().endsWith('/?dev=1'));
  const frameTap = async (id) => {
    const s = await frame.evaluate(() => __nullrange.snapshot()),
      c = s.controls.find((c) => c.id === id);
    await page.touchscreen.tap((c.x + c.w / 2) * s.scale, (c.y + c.h / 2) * s.scale);
    await page.waitForTimeout(160);
  };
  for (const id of ['missions', 'start', 'pause', 'settings']) await frameTap(id);
  let message = await page.evaluate(() => displayMessages.at(-1));
  assert.deepEqual(message, {
    type: 'small-games:display-state',
    gameId: 'vibeJam-myself-nullrange',
    screen: 'playing',
  });
  await frameTap('back');
  await frameTap('home');
  message = await page.evaluate(() => displayMessages.at(-1));
  assert.equal(message.screen, 'home');
  check('same-origin iframe emits exact Shell display-state contract');
  assert.deepEqual(report.errors, []);
  await context.close();
} finally {
  await writeFile(root + 'reports/browser/report.json', JSON.stringify(report, null, 2));
  await browser?.close();
  server.kill();
}
