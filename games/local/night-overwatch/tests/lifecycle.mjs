import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { sourceHash } from '../scripts/artifact.mjs';
import { friendlyFailure, evidenceDirectory, acceptanceBuild } from './flight-browser.mjs';
const base = process.env.NIGHT_URL || 'http://localhost:4318';
const build = await acceptanceBuild(base);
const dir = evidenceDirectory('lifecycle');
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage(),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const snap = () => page.evaluate(() => __night.snapshot());
const press = async (id) => {
  const b = (await snap()).buttons.find((b) => b.id === id);
  assert(b, id);
  await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
  await page.waitForTimeout(80);
};
const aim = async (point) => {
  const p = await page.evaluate((v) => __night.screenPoint(v), point);
  await page.mouse.move(p.x, p.y);
};
try {
  await page.goto(base);
  await page.waitForFunction(() =>
    globalThis.__night?.snapshot().buttons.some((b) => b.id === 'start'),
  );
  await press('start');
  const initial = await snap();
  await aim({ x: -35, z: -20 });
  await page.mouse.down();
  await page.waitForTimeout(180);
  // Real tab switching did not deliver lifecycle signals in headless or offscreen-headed Chrome here.
  // Explicitly synthetic browser events test the adapter; they do not prove real background behaviour.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(
    () => __night.snapshot().pauses.some((p) => p === 'focus' || p === 'background'),
    null,
    { polling: 100, timeout: 10000 },
  );
  const backgroundObservation = await page.evaluate(() => ({
    hidden: document.hidden,
    focused: document.hasFocus(),
  }));
  await page.mouse.up();
  const frozen = await snap();
  await page.waitForTimeout(250);
  assert.equal((await snap()).time, frozen.time);
  assert.deepEqual((await snap()).aircraft, frozen.aircraft);
  assert.deepEqual((await snap()).shotPositions, frozen.shotPositions);
  assert.equal(frozen.held.length, 0);
  assert.equal((await snap()).enginePlaying, false);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => __night.snapshot().pauses.length === 0, null, {
    polling: 100,
    timeout: 10000,
  });
  const foregroundObservation = await page.evaluate(() => ({
    hidden: document.hidden,
    focused: document.hasFocus(),
  }));
  assert.equal(foregroundObservation.hidden, false);
  await page.waitForTimeout(220);
  assert.equal((await snap()).fired, frozen.fired);
  const beforeFullscreen = await snap();
  assert(
    beforeFullscreen.buttons.some((b) => b.id === 'fullscreen'),
    'Fullscreen is visible in live play',
  );
  await press('fullscreen');
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => !!document.fullscreenElement));
  await press('fullscreen');
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), false);
  assert.equal((await snap()).pauses.length, 0);
  assert((await snap()).time > beforeFullscreen.time);
  assert.equal((await snap()).fired, beforeFullscreen.fired);
  const counts = [];
  for (let i = 0; i < 10; i++) {
    await friendlyFailure(page);
    if (i % 2 === 0) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(80);
    } else await press('retry');
    const s = await snap();
    assert(s.time < 0.5);
    assert.equal(s.fired, 0);
    assert.equal(s.kills, 0);
    assert.equal(s.friendlyKills, 0, 'Retry clears defensive kill attribution');
    assert.equal(s.guns[2].ammo, initial.guns[2].ammo);
    assert.equal(s.renderNodes, initial.renderNodes);
    assert.equal(s.units.length, initial.units.length);
    assert.equal(s.threatsRemaining, initial.threatsRemaining);
    assert(s.markerLabels <= s.units.length, 'Retry removes old target labels');
    counts.push(s.renderNodes);
  }
  assert.deepEqual(errors, []);
  assert.equal(build.sourceHash, await sourceHash(), 'Production source changed during acceptance');
  await mkdir(dir, { recursive: true });
  await writeFile(
    `${dir}/lifecycle.json`,
    JSON.stringify(
      {
        build,
        base,
        realBrowserTabBackgroundAndForeground: false,
        realBackgroundStatus:
          'unsupported: tab switching emitted no lifecycle signal in headless and offscreen-headed Chrome',
        syntheticBrowserBlurFocus: true,
        headedBrowser: false,
        backgroundObservation,
        foregroundObservation,
        requiresFreshFire: true,
        realFullscreenEntryExit: true,
        retries: 10,
        renderNodesAfterRetry: counts,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'Synthetic blur/focus response, real fullscreen and 10 retries passed; real tab background unsupported here',
  );
} finally {
  await browser.close();
}
