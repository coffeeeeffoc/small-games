import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { sourceHash } from '../scripts/artifact.mjs';
import { exerciseStandalone } from '../../../../apps/shell-web/scripts/standalone-game-checks.mjs';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const errors = [],
  results = [];
try {
  for (const [url, w, h] of [
    ['http://localhost:4318', 1920, 1080],
    ['http://localhost:4319', 1366, 768],
  ]) {
    const build = await fetch(url + '/build-info.json').then((r) => r.json());
    assert.equal(build.sourceHash, await sourceHash());
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await exerciseStandalone(page, 'night-overwatch');
    const s = await page.evaluate(() => __night.snapshot());
    assert.equal(s.selected, 2);
    assert.equal(s.phase, 'playing');
    for (const b of s.buttons) {
      assert(b.x >= 0 && b.y >= 0 && b.x + b.w <= w && b.y + b.h <= h, `${b.id} fits viewport`);
    }
    const canvas = await page.locator('#GameCanvas').boundingBox();
    assert.equal(Math.round(canvas.width), w);
    assert.equal(Math.round(canvas.height), h);
    assert.equal(canvas.x, 0);
    assert.equal(canvas.y, 0);
    await page.screenshot({
      path: new URL(`../reports/${build.target}-final.png`, import.meta.url).pathname.replace(
        /^\/(?=[A-Za-z]:)/,
        '',
      ),
    });
    results.push({
      url,
      viewport: { width: w, height: h },
      build,
      drawCalls: s.drawCalls,
      triangles: s.triangles,
      modelImport: s.modelImport,
      audio: s.audio,
    });
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('../reports/final-smoke.json', import.meta.url),
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log('Fresh Web Mobile/Desktop, Shell exercise and canvas sizing passed');
} finally {
  await browser.close();
}
