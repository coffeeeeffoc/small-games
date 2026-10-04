import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { designPoint, displayGeometry, gameURL, mobileOptions, reportsURL, startBrowser, tapDesign, verifyBuild, waitForReady } from './browser-utils.mjs';

const url = gameURL();
const build = await verifyBuild(url);
const browser = await startBrowser(url);
const evidence = { build, environment: 'Desktop Chromium, Android UA/touch emulation; not an Android device', errors: [], orientations: [] };
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, ...mobileOptions });
  page.on('pageerror', (e) => evidence.errors.push(e.message));
  await page.goto(url);
  await waitForReady(page);
  const state = () => page.evaluate(() => __kart.snapshot());
  const tap = (x, y) => tapDesign(page, x, y);
  const fullscreen = page.locator('[data-game-fullscreen]');
  // Fullscreen is a global setting. Its shared DOM controller is deliberately hidden.
  assert.equal(await fullscreen.isVisible(), false);
  const openSettings = async () => {
    if (!(await state()).hud.settingsVisible) {
      await tap(910, 46);
      await page.waitForFunction(() => __kart.snapshot().hud.settingsVisible);
    }
  };
  const closeSettings = async () => {
    await tap(640, 114);
    await page.waitForFunction(() => !__kart.snapshot().hud.settingsVisible);
  };
  await tap(198, 433);
  await page.waitForFunction(() => __kart.snapshot().time > 2, null, { timeout: 120000 });
  const before = await state();
  await openSettings();
  const paused = await state();
  assert.equal(paused.phase, 'paused');
  await tap(480, 244);
  await page.waitForFunction(() => document.fullscreenElement === document.documentElement);
  assert.equal(await fullscreen.getAttribute('aria-pressed'), 'true');
  await page.waitForTimeout(250);
  assert.equal((await state()).time, paused.time);
  assert.equal((await state()).seed, before.seed);
  await closeSettings();
  await page.waitForFunction(() => __kart.snapshot().phase === 'racing');
  await openSettings();
  await tap(480, 244);
  await page.waitForFunction(() => !document.fullscreenElement);
  assert.equal(await fullscreen.getAttribute('aria-pressed'), 'false');
  await closeSettings();
  await page.waitForFunction(() => __kart.snapshot().phase === 'racing');
  await tap(56, 126);
  await page.waitForFunction(() => __kart.snapshot().phase === 'paused');
  const resizeBefore = await state();
  for (const width of [305, 360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForFunction(async () => {
      const cc = await System.import('cc');
      const matrix = new DOMMatrix(getComputedStyle(document.getElementById('GameDiv')).transform);
      return matrix.b > 0.5 && cc.view.getVisibleSize().width > cc.view.getVisibleSize().height;
    });
    const geometry = await displayGeometry(page);
    assert.equal(geometry.rotated, true);
    assert.ok(geometry.visible.width > geometry.visible.height);
    assert.ok(geometry.scrollWidth <= width + 1);
    assert.equal(await page.locator('#kart-rotate').count(), 0, 'portrait remains playable without a rotate-screen gate');
    assert.equal((await state()).time, resizeBefore.time);
    assert.equal((await state()).seed, before.seed);
    // Actual touches must still find both the settings control and its close button after rotation.
    await openSettings();
    await closeSettings();
    assert.equal((await state()).phase, 'paused', 'closing settings preserves an existing manual pause');
    evidence.orientations.push({ width, geometry });
  }
  await page.screenshot({ path: fileURLToPath(new URL('display-portrait-held.png', reportsURL)) });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => Math.abs(new DOMMatrix(getComputedStyle(document.getElementById('GameDiv')).transform).b) < 0.01);
  await openSettings();
  await tap(480, 244);
  await page.waitForFunction(() => !!document.fullscreenElement);
  await closeSettings();
  await tap(743, 395);
  await page.waitForFunction(() => __kart.snapshot().phase === 'countdown');
  assert.equal((await state()).time, 0);
  await page.waitForFunction(() => __kart.snapshot().time > 1);
  await tap(56, 126);
  await page.waitForFunction(() => __kart.snapshot().phase === 'paused');
  // Browser/system exit, without invoking the game's setting.
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForFunction(() => document.querySelector('[data-game-fullscreen]').getAttribute('aria-pressed') === 'false');
  await tap(480, 395);
  await page.waitForFunction(() => __kart.snapshot().phase === 'racing');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...await designPoint(page, 200, 440), id: 1 }] });
  await page.waitForFunction(() => __kart.snapshot().input.steer > 0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => __kart.snapshot().input.steer === 0);
  evidence.after = await state();
  await page.screenshot({ path: fileURLToPath(new URL('display-modes.png', reportsURL)) });
  await openSettings();
  // Synthetic capability branches verify feedback only; physical Safari/Android remain unverified.
  for (const mode of ['unsupported', 'denied']) {
    await page.evaluate((mode) => {
      document.documentElement.requestFullscreen = mode === 'unsupported' ? undefined : () => Promise.reject(new Error('Denied'));
      document.documentElement.webkitRequestFullscreen = undefined;
    }, mode);
    const current = await state();
    await tap(480, 244);
    await page.waitForFunction(() => !document.getElementById('game-display-notice').hidden);
    assert.match(await page.locator('#game-display-notice').textContent(), /仍可在当前页面正常游玩/);
    assert.equal((await state()).seed, current.seed);
    assert.equal(await fullscreen.getAttribute('aria-pressed'), 'false');
    evidence[mode] = await page.locator('#game-display-notice').textContent();
  }
  assert.deepEqual(evidence.errors, []);
  await writeFile(new URL('display-modes.json', reportsURL), JSON.stringify(evidence, null, 2));
  console.log('PASS: settings fullscreen, pause/retry/resume, external exit, 305/360/390 portrait-held landscape and accurate touches, unsupported/denied feedback');
} finally { await browser.close(); }
