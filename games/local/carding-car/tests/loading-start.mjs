import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { gameURL, verifyBuild, startBrowser, tapDesign, prepareRace, startRace, tapHome, waitForReady } from './browser-utils.mjs';

const url = gameURL();
const build = await verifyBuild(url);
const browser = await startBrowser(url);
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
  for (let i = 0; i < 3; i++) await tapDesign(page, 198, 433);
  const after = await page.evaluate(() => __kart.snapshot());
  await writeFile(new URL('../reports/loading-start.json', import.meta.url), JSON.stringify({ build, before, after, errors }, null, 2));
  assert.equal(after.phase, 'ready', 'loading taps must not start or restart the race');
  assert.equal(after.seed, before.seed, 'loading taps must not recreate the race or reroll opponents');
  release();
  await page.waitForFunction(() => !__kart.snapshot().loading);
  await loading.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => __kart.snapshot().phase), 'ready');
  assert.equal(await page.evaluate(() => __kart.snapshot().home.visible), true);
  await prepareRace(page);
  const staged = await page.evaluate(() => __kart.snapshot());
  assert.equal(staged.phase, 'ready', 'loading all racers never starts the countdown');
  assert.equal(staged.staged, true);
  assert.equal(staged.home.visible, false);
  assert.equal(staged.countdown, 3);
  assert.equal(staged.time, 0);
  assert.equal(staged.renderedVehicles.length, 4, 'all racers are assembled before the explicit start');
  await startRace(page);
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
  const assetFailure = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
  await assetFailure.goto(url);
  await waitForReady(assetFailure);
  await assetFailure.route('**/assets/art-vehicle-dune-buggy/**', route => route.abort());
  await tapHome(assetFailure, '选择比赛');
  await tapHome(assetFailure, '›', 2);
  await assetFailure.waitForFunction(() => !!__kart.snapshot().loadError, null, { timeout: 60000 });
  assert.equal(await assetFailure.evaluate(() => __kart.snapshot().phase), 'ready');
  await assetFailure.unroute('**/assets/art-vehicle-dune-buggy/**');
  await tapHome(assetFailure, '重新加载');
  await waitForReady(assetFailure);
  assert.equal(await assetFailure.evaluate(() => __kart.snapshot().loadError), '');
  assert.equal(await assetFailure.evaluate(() => __kart.snapshot().selection.vehicle), 'dune-buggy');
  assert.equal(await assetFailure.evaluate(() => __kart.snapshot().staged), false, 'retry only restores the selected preview');
  await assetFailure.close();
  const garageFailure = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
  garageFailure.on('pageerror', error => errors.push(error.message));
  const garage = JSON.parse(await readFile(new URL('../assets/resources/menu/garage.jpg.meta', import.meta.url), 'utf8'));
  const garageImage = `**/${garage.uuid}*.jpg`;
  await garageFailure.goto(url); await waitForReady(garageFailure);
  await garageFailure.route(garageImage, route => route.abort());
  await tapHome(garageFailure, '选择比赛');
  await garageFailure.waitForFunction(() => !!__kart.snapshot().menuArtwork.error, null, { timeout: 60000 });
  await garageFailure.waitForFunction(() => __kart.snapshot().home.buttons.some(button => button.label === '重新加载' && button.enabled));
  assert.equal(await garageFailure.evaluate(() => __kart.snapshot().phase), 'ready');
  await garageFailure.unroute(garageImage);
  await tapHome(garageFailure, '重新加载');
  await garageFailure.waitForFunction(() => __kart.snapshot().menuArtwork.background === 'garage' && !__kart.snapshot().menuArtwork.error);
  assert.equal(await garageFailure.evaluate(() => __kart.snapshot().home.page), 'setup');
  assert.equal(await garageFailure.evaluate(() => __kart.snapshot().staged), false, 'background retry keeps the player in configuration');
  await garageFailure.close();
  assert.deepEqual(errors, []);
  console.log('PASS: branded loading, portrait layout, delayed assets, input blocking, explicit race start and failed-engine/selected-asset/menu-art retry');
} finally {
  release();
  await browser.close();
}
