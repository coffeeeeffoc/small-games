import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { sourceHash } from '../scripts/artifact.mjs';
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } }),
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
  const base = process.env.NIGHT_URL || 'http://localhost:4318';
  const build = await fetch(base + '/build-info.json').then((r) => r.json());
  assert.equal(build.sourceHash, await sourceHash());
  await page.goto(base);
  await page.waitForFunction(() =>
    globalThis.__night?.snapshot().buttons.some((b) => b.id === 'start'),
  );
  await press('start');
  await aim({ x: -35, z: -20 });
  await page.mouse.down();
  await page.waitForTimeout(180);
  // Dispatch the actual browser lifecycle signal, without touching simulation state.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
  const frozen = await snap();
  await page.waitForTimeout(250);
  assert.equal((await snap()).time, frozen.time);
  assert.equal(frozen.held.length, 0);
  assert.equal((await snap()).enginePlaying, false);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(220);
  assert.equal((await snap()).fired, frozen.fired);
  await page.keyboard.press('p');
  await page.waitForTimeout(80);
  await press('fullscreen');
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => !!document.fullscreenElement));
  await press('fullscreen');
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), false);
  await press('resume');
  const counts = [];
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('3');
    await aim((await snap()).units[0]);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(3100);
    await aim((await snap()).units[0]);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForFunction(() => __night.snapshot().phase === 'failure');
    await press('retry');
    const s = await snap();
    assert(s.time < 0.5);
    assert.equal(s.fired, 0);
    assert.equal(s.guns[2].ammo, 6);
    assert.equal(s.renderNodes, 4);
    assert(s.markerLabels <= s.units.length, 'Retry removes old target labels');
    counts.push(s.renderNodes);
  }
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('../reports/lifecycle.json', import.meta.url),
    JSON.stringify(
      {
        build,
        syntheticBrowserBlurFocus: true,
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
  console.log('Lifecycle/fullscreen/10 retries passed');
} finally {
  await browser.close();
}
