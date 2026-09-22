import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createTrack } from '../assets/scripts/TrackGenerator.ts';
import { barrierOverlap } from '../assets/scripts/KartPhysics.ts';
import { sourceHash } from '../scripts/artifact.mjs';
const track = createTrack();
const executablePath =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
  (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : undefined);
const url = process.env.KART_URL || 'http://127.0.0.1:4198';
const build = await fetch(new URL('build-info.json', url)).then((response) => response.json());
assert.equal(build.sourceHash, await sourceHash(), 'browser must exercise the current game build');
const browser = await chromium.launch({ headless: true, executablePath });
const reports = new URL('../reports/', import.meta.url);
await mkdir(reports, { recursive: true });
const errors = [],
  engineWarnings = [],
  evidence = {};
const snapshot = (p) => p.evaluate(() => globalThis.__kart.snapshot());
async function open(options) {
  const page = await browser.newPage({
    ...options,
    userAgent: options?.hasTouch
      ? 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'
      : undefined,
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Cocos 3.8.8 calls preventDefault on Chromium's non-cancelable CDP touchCancel.
    // Keep that engine warning in the report; every other console error fails the check.
    if (m.text().startsWith('Ignored attempt to cancel a touchcancel event with cancelable=false'))
      engineWarnings.push(m.text());
    else errors.push(m.text());
  });
  await page.goto(url);
  assert.equal(await page.title(), '浪湾卡丁车', 'verify the server identity before driving');
  await page.waitForFunction(
    () =>
      globalThis.__kart &&
      globalThis.__kart.snapshot().modelsLoaded &&
      globalThis.__kart.snapshot().sceneryLoaded,
  );
  return page;
}
try {
  const desktop = await open({ viewport: { width: 960, height: 540 } });
  await desktop.screenshot({
    path: new URL('menu.png', reports).pathname.replace(/^\/(?=[A-Za-z]:)/, ''),
  });
  await desktop.keyboard.press('Enter');
  await desktop.waitForFunction(() => __kart.snapshot().time > 1);
  assert.equal((await snapshot(desktop)).input.throttle, 0, 'desktop waits for forward input');
  assert.ok((await snapshot(desktop)).player.speed < 0.1, 'desktop does not auto-accelerate');
  for (const [key, field, value] of [
    ['w', 'throttle', 1],
    ['ArrowUp', 'throttle', 1],
    ['a', 'steer', -1],
    ['ArrowLeft', 'steer', -1],
    ['d', 'steer', 1],
    ['ArrowRight', 'steer', 1],
    ['s', 'brake', true],
    ['ArrowDown', 'brake', true],
    ['Space', 'drift', true],
    ['ShiftLeft', 'nitro', true],
    ['ShiftRight', 'nitro', true],
  ]) {
    await desktop.keyboard.down(key);
    assert.equal((await snapshot(desktop)).input[field], value, `${key} presses ${field}`);
    await desktop.keyboard.up(key);
    assert.equal(
      (await snapshot(desktop)).input[field],
      typeof value === 'boolean' ? false : 0,
      `${key} releases ${field}`,
    );
  }
  await desktop.keyboard.down('w');
  await desktop.keyboard.down('ArrowUp');
  await desktop.keyboard.up('w');
  assert.equal((await snapshot(desktop)).input.throttle, 1, 'held alias stays active');
  await desktop.keyboard.down('s');
  const braking = (await snapshot(desktop)).input;
  assert.equal(braking.throttle, 0, 'braking takes priority over forward');
  assert.equal(braking.reverse, true);
  await desktop.keyboard.up('s');
  await desktop.keyboard.up('ArrowUp');
  await desktop.keyboard.down('a');
  await desktop.keyboard.down('d');
  assert.equal((await snapshot(desktop)).input.steer, 0, 'opposite steering cancels');
  await desktop.keyboard.up('a');
  assert.equal((await snapshot(desktop)).input.steer, 1);
  await desktop.keyboard.up('d');
  await desktop.keyboard.press('p');
  await desktop.keyboard.press('r');
  await desktop.keyboard.down('ArrowUp');
  await desktop.waitForFunction(() => __kart.snapshot().time > 5.2);
  await desktop.keyboard.down('ArrowLeft');
  await desktop.keyboard.down('Space');
  await desktop.waitForFunction(() => __kart.snapshot().player.tier >= 1, {}, { timeout: 3000 });
  await desktop.keyboard.up('Space');
  await desktop.keyboard.up('ArrowLeft');
  await desktop.waitForFunction(() => __kart.snapshot().boosts > 0);
  evidence.keyboardBoost = await snapshot(desktop);
  await desktop.screenshot({
    path: new URL('keyboard-boost.png', reports).pathname.replace(/^\/(?=[A-Za-z]:)/, ''),
  });
  await desktop.keyboard.down('p');
  await desktop.keyboard.up('ArrowUp');
  const paused = await snapshot(desktop);
  await desktop.keyboard.down('p');
  await desktop.waitForTimeout(300);
  assert.equal((await snapshot(desktop)).time, paused.time);
  assert.equal(paused.phase, 'paused');
  assert.equal(
    (await snapshot(desktop)).phase,
    'paused',
    'holding pause must not toggle repeatedly',
  );
  await desktop.keyboard.up('p');
  await desktop.keyboard.down('ArrowRight');
  await desktop.keyboard.down('Space');
  await desktop.keyboard.press('Enter');
  const resumed = await snapshot(desktop);
  assert.equal(resumed.input.steer, 0, 'driving keys pressed while paused must not stick');
  assert.equal(resumed.input.drift, false);
  await desktop.keyboard.up('ArrowRight');
  await desktop.keyboard.up('Space');
  await desktop.keyboard.press('p');
  await desktop.keyboard.press('r');
  assert.equal((await snapshot(desktop)).phase, 'countdown');
  assert.equal((await snapshot(desktop)).time, 0);
  assert.equal((await snapshot(desktop)).currentLapTime, 0);
  await desktop.keyboard.press('p');
  const countdown = await snapshot(desktop);
  await desktop.waitForTimeout(250);
  assert.equal((await snapshot(desktop)).phase, 'paused');
  assert.equal((await snapshot(desktop)).time, countdown.time);
  await desktop.keyboard.press('Enter');
  await desktop.keyboard.down('ArrowUp');
  await desktop.waitForFunction(() => __kart.snapshot().time > 2);
  await desktop.keyboard.down('ArrowRight');
  await desktop.keyboard.down('Space');
  await desktop.waitForFunction(() => __kart.snapshot().player.tier === 1);
  const boostBeforePause = (await snapshot(desktop)).boosts;
  await desktop.keyboard.press('p');
  assert.equal((await snapshot(desktop)).player.charge, 0);
  await desktop.keyboard.up('ArrowRight');
  await desktop.keyboard.up('Space');
  await desktop.keyboard.press('Enter');
  await desktop.waitForTimeout(100);
  assert.equal(
    (await snapshot(desktop)).boosts,
    boostBeforePause,
    'pausing does not redeem drift charge',
  );
  evidence.pauseAndRestart =
    'paused inputs cleared; countdown and race clocks frozen; restart resets clocks';
  await desktop.close();

  const wide = await open({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  const ui = (x, y, id = 1) => ({
    x: (844 - (960 * 390) / 540) / 2 + (x * 390) / 540,
    y: (y * 390) / 540,
    id,
  });
  const tap = async (x, y) => {
    const p = ui(x, y);
    await wide.touchscreen.tap(p.x, p.y);
  };
  const wideCdp = await wide.context().newCDPSession(wide);
  await tap(480, 395);
  await wide.waitForFunction(() => __kart.snapshot().time > 2);
  await wideCdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [ui(200, 440), ui(844, 440, 2)],
  });
  await wide.waitForTimeout(80);
  assert.ok((await snapshot(wide)).input.steer > 0 && (await snapshot(wide)).input.drift);
  await wideCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await tap(70, 180);
  assert.equal((await snapshot(wide)).muted, true);
  await tap(70, 240);
  await wide.waitForFunction(() => __kart.snapshot().phase === 'paused');
  await tap(480, 395);
  const speedBeforeBrake = (await snapshot(wide)).player.speed;
  await wideCdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [ui(674, 440)],
  });
  await wide.waitForTimeout(500);
  assert.ok((await snapshot(wide)).input.brake);
  assert.ok((await snapshot(wide)).player.speed < speedBeforeBrake);
  await wideCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal((await snapshot(wide)).input.brake, false);
  // Synthetic window lifecycle event: headless tabs do not reliably lose OS focus.
  await wide.evaluate(() => window.dispatchEvent(new Event('blur')));
  await wide.waitForFunction(() => __kart.snapshot().phase === 'paused');
  for (const width of [360, 390]) {
    await wide.setViewportSize({ width, height: 844 });
    await wide.waitForTimeout(200);
    assert.ok(await wide.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const rect = await wide.locator('#GameCanvas').boundingBox();
    assert.ok(
      rect && rect.x >= -1 && rect.x + rect.width <= width + 1,
      'rotated canvas stays in viewport',
    );
    await wide.screenshot({
      path: new URL(`portrait-${width}.png`, reports).pathname.replace(/^\/(?=[A-Za-z]:)/, ''),
    });
  }
  await wide.setViewportSize({ width: 844, height: 390 });
  await wide.waitForTimeout(200);
  await tap(480, 395);
  await wide.waitForFunction(() => __kart.snapshot().phase === 'racing');
  await wide.screenshot({
    path: new URL('wide.png', reports).pathname.replace(/^\/(?=[A-Za-z]:)/, ''),
  });
  evidence.wideLayout = { controls: 'passed', resize: 'passed', blur: 'synthetic event passed' };
  await wide.close();

  const mobile = await open({
    viewport: { width: 960, height: 540 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1.5,
  });
  const cdp = await mobile.context().newCDPSession(mobile);
  let previous = [];
  async function touches(points) {
    if (previous.some((p) => !points.some((q) => p.id === q.id))) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      previous = [];
    }
    if (!points.length) return;
    const type = points.length > previous.length ? 'touchStart' : 'touchMove';
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    previous = points;
  }
  await mobile.touchscreen.tap(480, 395);
  await mobile.waitForFunction(() => __kart.snapshot().phase === 'racing');
  await touches([
    { x: 185, y: 440, id: 1 },
    { x: 844, y: 440, id: 2 },
  ]);
  await mobile.waitForTimeout(120);
  const two = await snapshot(mobile);
  assert.ok(two.input.steer > 0.1 && two.input.drift, 'simultaneous fingers steer and drift');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  previous = [];
  await mobile.waitForTimeout(60);
  assert.equal((await snapshot(mobile)).input.drift, false);
  assert.equal((await snapshot(mobile)).input.steer, 0);
  assert.equal(
    (await snapshot(mobile)).boosts,
    two.boosts,
    'cancelled touch does not redeem drift charge',
  );
  // Replay a driving line through actual touch events. No game state is mutated by the test.
  const fps = [],
    deadline = Date.now() + 270000;
  let lap = 0,
    airborne = false,
    lastLog = 0;
  const chargeTiers = new Set();
  const forks = new Set();
  while (Date.now() < deadline) {
    const s = await snapshot(mobile);
    if (s.phase === 'finished') break;
    assert.equal(s.phase, 'racing');
    assert.ok(
      track.barriers.every((wall) => (barrierOverlap(s.player, wall)?.depth ?? 0) < 0.01),
      'car body must stay outside visible rails',
    );
    for (const [name, distance] of [
      ['entry', track.shortcutStart],
      ['exit', track.shortcutEnd],
    ]) {
      if (!forks.has(name) && s.progress.laps === 0 && Math.abs(s.progress.s - distance) < 10) {
        forks.add(name);
        await mobile.screenshot({
          path: new URL(`fork-${name}.png`, reports).pathname.replace(/^\/(?=[A-Za-z]:)/, ''),
        });
      }
    }
    airborne ||= s.player.airborne;
    chargeTiers.add(s.player.tier);
    assert.ok(s.currentLapTime >= 0 && s.currentLapTime <= s.time + 0.001);
    fps.push(s.fps);
    if (s.time > lastLog + 15) {
      lastLog = s.time;
      console.log(
        `touch ${s.time.toFixed(0)}s: ${s.progress.laps} laps, ${s.boosts} boosts, ${s.fps} FPS`,
      );
    }
    const a = s.suggestedInput,
      points = [{ x: 960 * (0.16 + a.steer * 0.095), y: 440, id: 1 }];
    if (a.drift) points.push({ x: 844, y: 440, id: 2 });
    if (a.brake) points.push({ x: 674, y: 440, id: 3 });
    await touches(points);
    if (s.progress.laps > lap) {
      lap = s.progress.laps;
      console.log(`mobile lap ${lap}: ${s.time.toFixed(1)}s, ${s.boosts} boosts`);
      await mobile.screenshot({
        path: new URL(`lap-${lap}.png`, reports).pathname.replace(/^\/(?=[A-Za-z]:)/, ''),
      });
    }
    await mobile.waitForTimeout(45);
  }
  await touches([]);
  const finish = await snapshot(mobile);
  await writeFile(new URL('last-race.json', reports), JSON.stringify(finish, null, 2));
  assert.equal(finish.phase, 'finished');
  assert.equal(finish.progress.laps, 3);
  assert.ok(finish.boosts >= 3);
  assert.ok(
    finish.drivers.every((d) => d.lap >= 2),
    'all rivals remain competitive',
  );
  assert.ok(airborne, 'the road rise produces a real jump');
  assert.ok(chargeTiers.has(1) && chargeTiers.has(2), 'both drift reward tiers are reachable');
  assert.equal(finish.progress.lapTimes.length, 3);
  assert.equal(finish.bestLapTime, Math.min(...finish.progress.lapTimes));
  assert.ok(
    Math.abs(finish.progress.lapTimes.reduce((sum, lapTime) => sum + lapTime, 0) - finish.time) <
      0.001,
  );
  assert.equal(finish.records.length, 1, 'a complete race adds one local leaderboard result');
  assert.equal(finish.records[0].time, finish.time);
  assert.equal(finish.records[0].place, finish.order.indexOf(0) + 1);
  fps.sort((a, b) => a - b);
  evidence.mobile = {
    ...finish,
    airborne,
    medianFps: fps[Math.floor(fps.length * 0.5)],
    p10Fps: fps[Math.floor(fps.length * 0.1)],
  };
  await mobile.waitForFunction(() => /冠军|冲线/.test(__kart.snapshot().hud.title));
  await mobile.screenshot({
    path: new URL('finish.png', reports).pathname.replace(/^\/(?=[A-Za-z]:)/, ''),
  });
  await mobile.touchscreen.tap(480, 395);
  await mobile.waitForFunction(() => __kart.snapshot().phase === 'countdown');
  assert.equal((await snapshot(mobile)).progress.laps, 0);
  assert.equal(
    (await snapshot(mobile)).records.length,
    1,
    'restarting does not duplicate a result',
  );
  await mobile.reload();
  await mobile.waitForFunction(() => globalThis.__kart?.snapshot().modelsLoaded);
  const reloaded = await snapshot(mobile);
  assert.equal(reloaded.phase, 'ready');
  assert.deepEqual(reloaded.records, finish.records, 'the leaderboard survives a page reload');
  evidence.leaderboard = { saved: finish.records, reloaded: reloaded.records };
  await mobile.screenshot({
    path: new URL('leaderboard.png', reports).pathname.replace(/^\/(?=[A-Za-z]:)/, ''),
  });
  await mobile.evaluate(() => localStorage.setItem('coastline-records-v1', '{broken'));
  await mobile.reload();
  await mobile.waitForFunction(() => globalThis.__kart?.snapshot().modelsLoaded);
  assert.deepEqual(
    (await snapshot(mobile)).records,
    [],
    'damaged records cannot prevent the next race',
  );
  await mobile.close();
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('browser.json', reports),
    JSON.stringify({ build, errors, engineWarnings, evidence }, null, 2),
  );
  console.log(
    JSON.stringify(
      { keyboardBoost: evidence.keyboardBoost.boosts, mobile: evidence.mobile },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
