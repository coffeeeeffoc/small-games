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
  const loading = page.locator('#kart-loading');
  assert.equal(await loading.isVisible(), true, 'the game loading screen stays visible while car assets are pending');
  assert.equal(await loading.locator('h1').textContent(), '浪湾卡丁车');
  assert.equal(await page.locator('#game-display-notice').isVisible(), false, 'hidden fullscreen notices must not cover loading artwork');
  assert.equal(await page.evaluate(async () => {
    const cc = await System.import('cc');
    return cc.settings.querySettings('splashScreen', 'totalTime');
  }), 0, 'the default Cocos splash must be disabled before engine startup');
  await page.screenshot({ path: new URL('../reports/loading-landscape.png', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '') });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await loading.isVisible(), true);
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1);
  await page.screenshot({ path: new URL('../reports/loading-portrait.png', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '') });
  await page.setViewportSize({ width: 960, height: 540 });
  const before = await page.evaluate(() => __kart.snapshot());
  await page.keyboard.press('Enter');
  for (let i = 0; i < 3; i++) await page.touchscreen.tap(480, 395);
  const after = await page.evaluate(() => __kart.snapshot());
  await writeFile(new URL('../reports/loading-start.json', import.meta.url), JSON.stringify({ build, before, after, errors }, null, 2));
  assert.equal(after.phase, 'ready', 'loading taps must not start or restart the race');
  assert.equal(after.seed, before.seed, 'loading taps must not recreate the race or reroll opponents');
  release();
  await page.waitForFunction(() => !__kart.snapshot().loading);
  await loading.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => __kart.snapshot().phase), 'ready');
  await page.touchscreen.tap(480, 395);
  await page.waitForFunction(() => __kart.snapshot().phase === 'racing');
  await page.waitForFunction(() => __kart.snapshot().player.speed > 5);
  const failure = await browser.newPage({ viewport: { width: 960, height: 540 } });
  failure.on('pageerror', (e) => errors.push(e.message));
  await failure.route('**/cocos-js/cc.*.js', route => route.abort());
  await failure.goto(url);
  await failure.getByRole('button', { name: '重新加载' }).waitFor({ state: 'visible' });
  assert.equal(await failure.locator('#kart-loading').getAttribute('aria-busy'), 'false');
  await failure.unroute('**/cocos-js/cc.*.js');
  await failure.getByRole('button', { name: '重新加载' }).click();
  await failure.locator('#kart-loading').waitFor({ state: 'detached' });
  await failure.waitForFunction(() => globalThis.__kart && !__kart.snapshot().loading);
  await failure.close();
  assert.deepEqual(errors, []);
  console.log('PASS: branded loading, portrait layout, delayed assets, input blocking, explicit race start and failed-engine retry');
} finally {
  release();
  await browser.close();
}
