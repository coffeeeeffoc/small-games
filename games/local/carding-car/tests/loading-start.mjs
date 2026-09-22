import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { sourceHash } from '../scripts/artifact.mjs';

const url = process.env.KART_URL || 'http://127.0.0.1:4198';
const build = await fetch(new URL('build-info.json', url)).then((r) => r.json());
assert.equal(build.sourceHash, await sourceHash());
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
let release;
const held = new Promise((resolve) => { release = resolve; });
try {
  const page = await browser.newPage({
    viewport: { width: 960, height: 540 },
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Hold actual selected-car assets, then release the same network responses.
  await page.route('**/assets/art-vehicle-classic-kart/**', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(url);
  await page.waitForFunction(() => globalThis.__kart && __kart.snapshot().loading);
  const before = await page.evaluate(() => __kart.snapshot());
  await page.keyboard.press('Enter');
  for (let i = 0; i < 3; i++) await page.touchscreen.tap(480, 395);
  const after = await page.evaluate(() => __kart.snapshot());
  await writeFile(new URL('../reports/loading-start.json', import.meta.url), JSON.stringify({ build, before, after, errors }, null, 2));
  assert.equal(after.phase, 'ready', 'loading taps must not start or restart the race');
  assert.equal(after.seed, before.seed, 'loading taps must not recreate the race or reroll opponents');
  release();
  await page.waitForFunction(() => !__kart.snapshot().loading);
  assert.equal(await page.evaluate(() => __kart.snapshot().phase), 'ready');
  await page.touchscreen.tap(480, 395);
  await page.waitForFunction(() => __kart.snapshot().phase === 'racing');
  await page.waitForFunction(() => __kart.snapshot().player.speed > 5);
  assert.deepEqual(errors, []);
  console.log('PASS: slow loading ignores Enter and repeated touch starts; an explicit loaded tap starts driving');
} finally {
  release();
  await browser.close();
}
