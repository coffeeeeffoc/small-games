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
  await page.screenshot({ path: root + 'reports/browser/production-home-844x390.png' });
  assert.ok(await page.locator('#nullrange-safe-area').count());
  assert.match(await page.locator('link[rel="icon"]').getAttribute('href'), /icon\.png$/);
  await page.evaluate(() => {
    localStorage.setItem('nullrange-cn-best', '314');
    localStorage.setItem('nullrange-cn-muted', 'true');
  });
  await page.goto(base + '?dev=1');
  await page.waitForFunction(
    () => {
      const world = globalThis.__nullrange?.snapshot().world;
      return world?.ready && world.terrainMeshes === 49 && world.drawCalls > 0;
    },
    null,
    {
      timeout: 60000,
    },
  );
  const snap = () => page.evaluate(() => __nullrange.snapshot());
  const world = (await snap()).world;
  assert.equal(world.modelsLoaded, 21);
  assert.equal(world.texturesLoaded, 5);
  assert.deepEqual(world.errors, []);
  assert.equal(world.terrainMeshes, 49);
  assert.ok(world.instancedPasses > 0);
  assert.ok(
    world.foliage.length > 0 && world.foliage.every((m) => m.albedo && m.alphaTest && m.textured),
  );
  assert.ok(world.meshes <= 70);
  assert.ok(world.drawCalls > 0 && world.drawCalls < 200);
  assert.ok(world.triangles > 10000 && world.triangles < 180000);
  report.world = world;
  check('21 native GLB Prefabs + 5 textures loaded, collidable terrain and actual GPU counters');
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
  const layout = async () => {
    const s = await snap(),
      a = s.safe;
    for (const c of s.controls) {
      assert.ok(Math.min(c.w, c.h) * s.scale >= 43.9, `${s.screen}/${c.id} >=44px`);
      assert.ok(
        c.x >= a.left - 0.1 &&
          c.y >= a.top - 0.1 &&
          c.x + c.w <= a.right + 0.1 &&
          c.y + c.h <= a.bottom + 0.1,
        `${s.screen}/${c.id} inside safe area ${JSON.stringify(a)}`,
      );
      for (const d of s.controls)
        if (c.id < d.id)
          assert.ok(
            c.x + c.w <= d.x + 0.1 ||
              d.x + d.w <= c.x + 0.1 ||
              c.y + c.h <= d.y + 0.1 ||
              d.y + d.h <= c.y + 0.1,
            `${s.screen} overlapping ${c.id}/${d.id}`,
          );
    }
  };
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
    await layout();
    await shot(`home-${width}x${height}`);
    await tap('online');
    assert.equal((await snap()).screen, 'online');
    await layout();
    await shot(`online-${width}x${height}`);
    await tap('back');
    await tap('help');
    await layout();
    await shot(`help-${width}x${height}`);
    await tap('back');
    await tap('settings');
    await layout();
    await shot(`settings-${width}x${height}`);
    await tap('back');
    await tap('missions');
    await layout();
    await shot(`mission-${width}x${height}`);
    await tap('mission:dawn-patrol');
    await tap('prepare');
    assert.equal((await snap()).screen, 'prepare');
    await layout();
    await shot(`prepare-${width}x${height}`);
    await tap('start');
    assert.equal((await snap()).screen, 'playing');
    const running = await snap();
    assert.ok(running.targetMarker, 'visible initial target has a projected lock bracket');
    assert.equal(running.targetMarker.id, running.lock);
    assert.ok(
      Math.abs(running.targetMarker.labelY - running.targetMarker.y) >= 28 - 1e-6,
      'distance label leaves the target bracket unobscured',
    );
    assert.ok(Number.isFinite(running.targetMarker.x) && Number.isFinite(running.targetMarker.y));
    assert.ok(
      Math.hypot(
        running.targetMarker.x - running.width / 2,
        running.targetMarker.y - running.height * 0.46,
      ) > 10,
      'lock bracket is not pinned to the central gunsight',
    );
    await layout();
    await shot(`flight-${width}x${height}`);
    report.checks.push({ viewport: `${width}x${height}`, world: running.world });
    assert.ok(running.controls.every((c) => Math.min(c.w, c.h) * running.scale >= 43.9));
    await tap('pause');
    assert.equal((await snap()).screen, 'paused');
    await layout();
    await shot(`pause-${width}x${height}`);
    const tick = (await snap()).state.tick;
    await tap('settings');
    await tap('back');
    assert.equal((await snap()).screen, 'paused');
    assert.equal((await snap()).state.tick, tick);
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
  for (let i = 0; i < 2400; i++) {
    const sample = await snap(),
      state = sample.state;
    if (sample.targetMarker)
      assert.ok(
        Math.abs(sample.targetMarker.labelY - sample.targetMarker.y) >= 28 - 1e-6,
        'moving lock label keeps a 4px gap beyond the bracket: ' +
          JSON.stringify(sample.targetMarker),
      );
    if (state.status !== 'running') break;
    const desired = pilot(state),
      next = new Set();
    if (desired.x > 0.12) next.add('KeyD');
    if (desired.x < -0.12) next.add('KeyA');
    if (desired.y > 0.12) next.add('KeyW');
    if (desired.y < -0.12) next.add('KeyS');
    if (desired.fire) next.add('Space');
    if (desired.boost) next.add('ShiftLeft');
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
  for (const [width, height] of [
    [667, 375],
    [844, 390],
    [932, 430],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    await layout();
    await shot(`result-${width}x${height}`);
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(250);
  check(`normal browser flight victory, ${won.state.tick} ticks, ${won.state.score} score`);
  await tap('restart');
  assert.equal((await snap()).state.player.hull, 100);
  await page.keyboard.down('KeyS');
  await page.waitForFunction(() => __nullrange.snapshot().state.status === 'lost', null, {
    timeout: 60000,
  });
  await page.keyboard.up('KeyS');
  assert.match((await snap()).state.reason, /地形/);
  const impact = await snap();
  report.failure = impact.state;
  assert.equal(impact.screen, 'playing');
  assert.ok(impact.state.impacts.some((e) => e.kind === 'crash'));
  await page.waitForTimeout(100);
  assert.equal((await snap()).world.playerVisible, false);
  assert.ok((await snap()).world.activeFx > 0);
  assert.equal((await snap()).audio.engine, false);
  await shot('crash-impact');
  await tap('pause');
  const crashPaused = await snap();
  await page.waitForTimeout(250);
  assert.equal((await snap()).crashTime, crashPaused.crashTime);
  assert.equal((await snap()).state.tick, impact.state.tick);
  await tap('resume');
  await page.waitForFunction(() => __nullrange.snapshot().screen === 'result');
  assert.deepEqual((await snap()).state.player, impact.state.player);
  await shot('failure');
  await layout();
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
  assert.deepEqual(await page.evaluate(() => Object.keys(__nullrange)), ['snapshot']);
  assert.equal(
    await page.evaluate(() => {
      const s = __nullrange.snapshot();
      s.state.player.hull = 0;
      return __nullrange.snapshot().state.player.hull;
    }),
    100,
  );
  check('development interface remains a detached read-only snapshot');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForFunction(() => globalThis.__nullrange?.snapshot().world.ready);
  await tap('online');
  assert.equal((await snap()).screen, 'online');
  await tap('back');
  await shot('portrait-cold-boot');
  check('portrait cold boot and touch mapping');
  // Both readers see the same physical safe area, like an actual notched Web device.
  for (const [width, height] of [
    [667, 375],
    [844, 390],
    [932, 430],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => {
      document.querySelector('#nullrange-safe-area').style.padding = '7px 13px 19px 31px';
      for (const [side, value] of Object.entries({ top: 7, right: 13, bottom: 19, left: 31 }))
        document.documentElement.style.setProperty('--safe-' + side, value + 'px');
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(350);
    const s = await snap(),
      expected =
        width < height
          ? { left: 7, top: 13, right: 19, bottom: 31 }
          : { left: 31, top: 7, right: 13, bottom: 19 };
    assert.ok(Math.abs(s.safe.left - 18 - expected.left / s.scale) < 0.1);
    assert.ok(Math.abs(s.safe.top - 12 - expected.top / s.scale) < 0.1);
    assert.ok(Math.abs(s.width - s.safe.right - 18 - expected.right / s.scale) < 0.1);
    assert.ok(Math.abs(s.height - s.safe.bottom - 12 - expected.bottom / s.scale) < 0.1);
    await layout();
    await shot(`safe-home-${width}x${height}`);
    for (const id of ['settings', 'help', 'online']) {
      await tap(id);
      await layout();
      await shot(`safe-${id}-${width}x${height}`);
      await tap('back');
    }
    await tap('missions');
    await layout();
    await tap('mission:dawn-patrol');
    await tap('prepare');
    await layout();
    await tap('back');
    assert.equal((await snap()).screen, 'missions');
    await tap('start');
    await layout();
    await shot(`safe-flight-${width}x${height}`);
    await tap('pause');
    await layout();
    await tap('settings');
    await layout();
    await tap('back');
    await tap('home');
  }
  check(
    'four viewports: measured asymmetric CSS insets, transformed bounds, every page has separate >=44px touch regions',
  );
  await page.evaluate(() => {
    for (const side of ['top', 'right', 'bottom', 'left'])
      document.documentElement.style.removeProperty('--safe-' + side);
    document.querySelector('#nullrange-safe-area').style.padding =
      'env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    window.dispatchEvent(new Event('resize'));
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
  await tap('missions');
  await tap('start');
  const beforeRotate = await snap(),
    rc = beforeRotate.controls.find((c) => c.id === 'stick'),
    rf = beforeRotate.controls.find((c) => c.id === 'fire');
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { ...(await point(rc.x + rc.w / 2 + 20, rc.y + rc.h / 2)), id: 5 },
      { ...(await point(rf.x + rf.w / 2, rf.y + rf.h / 2)), id: 6 },
    ],
  });
  await page.waitForTimeout(80);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  assert.equal((await snap()).input.pointers, 0);
  assert.deepEqual((await snap()).input.stick, { x: 0, y: 0 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const background = await snap();
  assert.equal(background.screen, 'paused');
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pageshow'));
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(200);
  assert.equal((await snap()).state.tick, background.state.tick);
  assert.equal((await snap()).audio.engine, false);
  assert.equal((await snap()).audio.effects, 0);
  await tap('home');
  // A touch dragged out of a menu control cannot activate it on release.
  const hc = (await snap()).controls.find((c) => c.id === 'missions');
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...(await point(hc.x + hc.w / 2, hc.y + hc.h / 2)), id: 7 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...(await point(300, 140)), id: 7 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
  assert.equal((await snap()).screen, 'home');
  check(
    'held multitouch clears on rotation; pagehide/focus keeps pause and silences audio; drag-out cancels activation',
  );
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
