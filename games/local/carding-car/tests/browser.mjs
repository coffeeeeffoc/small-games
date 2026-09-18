import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createTrack } from '../assets/scripts/TrackGenerator.ts';
import { barrierOverlap } from '../assets/scripts/KartPhysics.ts';
const track = createTrack();
const executablePath =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
  (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : undefined);
const browser = await chromium.launch({ headless: true, executablePath });
const reports = new URL('../reports/', import.meta.url);
await mkdir(reports, { recursive: true });
const errors = [],
  engineWarnings = [],
  evidence = {};
const url = process.env.KART_URL || 'http://127.0.0.1:4198';
const snapshot = (p) => p.evaluate(() => globalThis.__kart.snapshot());
async function open(options) {
  const page = await browser.newPage(options);
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
  await page.waitForFunction(
    () =>
      globalThis.__kart?.snapshot().audioClips === 7 && globalThis.__kart.snapshot().modelsLoaded,
  );
  return page;
}
try {
  const desktop = await open({ viewport: { width: 960, height: 540 } });
  await desktop.screenshot({
    path: new URL('menu.png', reports).pathname.replace(/^\/(?=[A-Za-z]:)/, ''),
  });
  await desktop.keyboard.press('Enter');
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
  await desktop.keyboard.press('p');
  const paused = await snapshot(desktop);
  await desktop.waitForTimeout(300);
  assert.equal((await snapshot(desktop)).time, paused.time);
  assert.equal(paused.phase, 'paused');
  await desktop.keyboard.press('r');
  assert.equal((await snapshot(desktop)).phase, 'countdown');
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
  await tap(480, 347);
  await wide.waitForFunction(() => __kart.snapshot().time > 2);
  await wideCdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [ui(200, 440), ui(844, 440, 2)],
  });
  await wide.waitForTimeout(80);
  assert.ok((await snapshot(wide)).input.steer > 0 && (await snapshot(wide)).input.drift);
  await wideCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await tap(787, 50);
  assert.equal((await snapshot(wide)).muted, true);
  await tap(893, 50);
  await wide.waitForFunction(() => __kart.snapshot().phase === 'paused');
  await tap(480, 347);
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
  await wide.setViewportSize({ width: 390, height: 844 });
  await wide.waitForTimeout(200);
  await wide.setViewportSize({ width: 844, height: 390 });
  await wide.waitForTimeout(200);
  await tap(480, 347);
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
  await mobile.touchscreen.tap(480, 347);
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
  // Replay a driving line through actual touch events. No game state is mutated by the test.
  const fps = [],
    deadline = Date.now() + 270000;
  let lap = 0,
    airborne = false,
    lastLog = 0;
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
  fps.sort((a, b) => a - b);
  evidence.mobile = {
    ...finish,
    airborne,
    medianFps: fps[Math.floor(fps.length * 0.5)],
    p10Fps: fps[Math.floor(fps.length * 0.1)],
  };
  await mobile.screenshot({
    path: new URL('finish.png', reports).pathname.replace(/^\/(?=[A-Za-z]:)/, ''),
  });
  await mobile.touchscreen.tap(480, 347);
  await mobile.waitForFunction(() => __kart.snapshot().phase === 'countdown');
  assert.equal((await snapshot(mobile)).progress.laps, 0);
  await mobile.close();
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('browser.json', reports),
    JSON.stringify({ errors, engineWarnings, evidence }, null, 2),
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
