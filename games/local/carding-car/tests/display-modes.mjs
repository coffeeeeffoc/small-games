import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { designPoint, displayGeometry, gameURL, mobileOptions, reportsURL, startBrowser, tapDesign, verifyBuild, waitForReady, startRace } from './browser-utils.mjs';

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
  const displayProbe = await page.evaluateHandle(async () => ({ cc: await System.import('cc'), matches: 0 }));
  const waitForDisplay = async (width, height, rotated) => {
    await displayProbe.evaluate(probe => { probe.matches = 0; });
    // waitForFunction polls synchronous truthiness: an async predicate returns
    // a truthy Promise even when it resolves to false. Import the engine once,
    // then require complete geometry to match on three animation-frame polls.
    await page.waitForFunction(({ probe, width, height, rotated }) => {
      const frame = document.getElementById('GameDiv');
      const matrix = new DOMMatrix(getComputedStyle(frame).transform);
      const bounds = frame.getBoundingClientRect(), visible = probe.cc.view.getVisibleSize();
      const orientation = rotated
        ? matrix.b > 0.5 && Math.abs(matrix.a) < 0.01
        : Math.abs(matrix.b) < 0.01 && matrix.a > 0.5;
      const settled = orientation && visible.width > visible.height &&
        innerWidth === width && innerHeight === height &&
        Math.abs(bounds.width - width) < 1 && Math.abs(bounds.height - height) < 1;
      probe.matches = settled ? probe.matches + 1 : 0;
      return probe.matches >= 3;
    }, { probe: displayProbe, width, height, rotated });
  };
  assert.equal(await page.locator('[data-game-fullscreen]').count(), 0);
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
  await startRace(page);
  await page.waitForFunction(() => __kart.snapshot().time > 2, null, { timeout: 120000 });
  const before = await state();
  await openSettings();
  const paused = await state();
  assert.equal(paused.phase, 'paused');
  await page.waitForTimeout(250);
  assert.equal((await state()).time, paused.time);
  assert.equal((await state()).seed, before.seed);
  await closeSettings();
  await page.waitForFunction(() => __kart.snapshot().phase === 'racing');
  await openSettings();
  await closeSettings();
  await page.waitForFunction(() => __kart.snapshot().phase === 'racing');
  await tap(56, 126);
  await page.waitForFunction(() => __kart.snapshot().phase === 'paused');
  const resizeBefore = await state();
  for (const width of [305, 360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await waitForDisplay(width, 844, true);
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
  await waitForDisplay(844, 390, false);
  await openSettings();
  await closeSettings();
  await tap(743, 395);
  await waitForReady(page);
  assert.equal((await state()).phase, 'ready');
  assert.equal((await state()).staged, true);
  assert.equal((await state()).time, 0);
  await startRace(page);
  await page.waitForFunction(() => __kart.snapshot().time > 1);
  await tap(56, 126);
  await page.waitForFunction(() => __kart.snapshot().phase === 'paused');
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
  assert.equal(await page.locator('[data-game-fullscreen]').count(), 0);
  assert.deepEqual(evidence.errors, []);
  await writeFile(new URL('display-modes.json', reportsURL), JSON.stringify(evidence, null, 2));
  console.log('PASS: settings without fullscreen, pause/retry/resume, 305/360/390 portrait-held landscape and accurate touches');
} finally { await browser.close(); }
