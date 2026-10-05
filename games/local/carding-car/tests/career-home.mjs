import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gameURL, verifyBuild, startBrowser, waitForReady, tapHome, tapDesign, designPoint, mobileOptions, reportsURL } from './browser-utils.mjs';

const url = gameURL(), build = await verifyBuild(url), browser = await startBrowser(url);
const evidence = { build, environment: 'Chromium Android UA with real CDP touch; physical devices unverified', errors: [], cases: [] };
const state = page => page.evaluate(() => __kart.snapshot());
const shot = (page, name) => page.screenshot({ path: fileURLToPath(new URL(`career-${name}.png`, reportsURL)) });
function observe(page) { page.on('pageerror', error => evidence.errors.push(error.message)); }
let release = () => {};
try {
  const context = await browser.newContext({ ...mobileOptions, viewport: { width: 844, height: 390 } });
  const page = await context.newPage(); observe(page);
  await page.goto(url); await waitForReady(page);
  const initial = await state(page);
  assert.equal(initial.home.page, 'home');
  assert.equal(initial.career.races, 0);
  assert.deepEqual(initial.renderedVehicles, ['classic-kart']);
  assert.equal(initial.requestedArt.filter(path => path.startsWith('art-vehicle-')).length, 1);
  await shot(page, 'home');
  await tapHome(page, '选择比赛');
  assert.equal((await state(page)).home.advanced, false);
  await tapHome(page, '三圈竞速'); await waitForReady(page);
  await tapHome(page, '展开高级');
  for (let i = 0; i < 4; i++) await tapHome(page, '+');
  await tapHome(page, '□');
  await tapHome(page, '进入赛道'); await waitForReady(page);
  let prepared = await state(page);
  assert.equal(prepared.phase, 'ready');
  assert.equal(prepared.drivers.length, 8);
  assert.ok(prepared.renderedVehicles.every(id => id === 'classic-kart'));
  assert.ok(prepared.renderedDrivers.every(id => id === 'rookie'));
  await page.waitForTimeout(1100);
  assert.equal((await state(page)).countdown, 3, 'waiting on the grid cannot start the clock');
  await tapDesign(page, 870, 472);
  await waitForReady(page); await tapHome(page, '选择比赛');
  for (let i = 0; i < 4; i++) await tapHome(page, '−');
  await tapHome(page, '☑');
  await shot(page, 'setup');

  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/assets/art-vehicle-supercar/**', async route => { await held; await route.continue(); });
  await page.evaluate(() => { globalThis.savedRandom = Math.random; Math.random = () => 0.999; });
  await tapHome(page, '进入赛道');
  await page.evaluate(() => { Math.random = globalThis.savedRandom; delete globalThis.savedRandom; });
  await page.waitForFunction(() => __kart.snapshot().loading && __kart.snapshot().staged);
  await tapDesign(page, 198, 433);
  await page.waitForTimeout(1100);
  const heldState = await state(page);
  assert.equal(heldState.phase, 'ready');
  assert.equal(heldState.countdown, 3);
  assert.equal(heldState.hud.menuVisible, true);
  release(); await waitForReady(page);
  prepared = await state(page);
  assert.deepEqual(prepared.renderedVehicles, ['classic-kart', 'supercar', 'supercar', 'supercar']);
  const requestedCars = prepared.requestedArt.filter(path => /art-(vehicle|driver)-/.test(path));
  await shot(page, 'grid');
  const started = performance.now();
  await tapDesign(page, 198, 433);
  await page.waitForFunction(() => __kart.snapshot().phase === 'countdown');
  await page.evaluate(() => { const until = performance.now() + 1100; while (performance.now() < until) {} });
  await page.waitForFunction(() => __kart.snapshot().countdown < 2);
  const stalled = await state(page);
  assert.ok(stalled.countdown < 2, 'a stalled frame must consume the actual second');
  await page.waitForFunction(() => __kart.snapshot().phase === 'racing');
  const countdownMilliseconds = performance.now() - started;
  assert.ok(countdownMilliseconds >= 2800 && countdownMilliseconds < 4500, `countdown took ${countdownMilliseconds} ms`);
  assert.deepEqual((await state(page)).requestedArt.filter(path => /art-(vehicle|driver)-/.test(path)), requestedCars);
  const cdp = await context.newCDPSession(page);
  let touching = false;
  const touch = async (type, points) => {
    if ((type === 'touchEnd' || type === 'touchCancel') && !touching) return;
    await cdp.send('Input.dispatchTouchEvent', { type,
      touchPoints: await Promise.all(points.map(async ([x, y, id]) => ({ ...await designPoint(page, x, y), id }))) });
    touching = type !== 'touchEnd' && type !== 'touchCancel';
  };
  await touch('touchStart', [[180, 440, 1], [845, 440, 2]]);
  await page.waitForFunction(() => __kart.snapshot().input.steer > 0 && __kart.snapshot().input.drift);
  await touch('touchCancel', []);
  await page.waitForFunction(() => !__kart.snapshot().input.drift && __kart.snapshot().input.steer === 0);
  await tapDesign(page, 56, 126);
  await page.waitForFunction(() => __kart.snapshot().phase === 'paused');
  await shot(page, 'paused');
  await tapDesign(page, 480, 395);
  await page.waitForFunction(() => __kart.snapshot().phase === 'racing');

  // Complete a legal lap using actual browser touches and the read-only driving suggestion.
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const current = await state(page);
    if (current.phase === 'finished') break;
    const input = current.suggestedInput;
    const points = [[960 * (0.16 + input.steer * 0.095), 440, 1]];
    if (input.drift) points.push([845, 440, 2]);
    if (input.brake) points.push([674, 440, 3]);
    await touch('touchEnd', []);
    await touch('touchStart', points);
    await page.waitForTimeout(70);
  }
  await touch('touchEnd', []);
  const finished = await state(page);
  assert.equal(finished.phase, 'finished', 'the actual touch lap must finish');
  assert.equal(finished.career.races, 1);
  assert.ok(finished.career.coins > 0 && finished.career.xp > 0);
  assert.ok(finished.reward.coins > 0);
  await page.waitForTimeout(1500);
  assert.deepEqual((await state(page)).career, finished.career, 'live results cannot award twice');
  await shot(page, 'finish');
  await tapDesign(page, 216, 395); await waitForReady(page);
  await tapHome(page, '生涯 /');
  await tapHome(page, '领取奖励');
  const claimed = await state(page);
  assert.ok(claimed.career.claimed.includes('first-finish'));
  assert.ok(claimed.career.coins > finished.career.coins);
  await shot(page, 'career');
  await page.reload(); await waitForReady(page);
  assert.deepEqual((await state(page)).career, claimed.career);
  evidence.cases.push({ initial, prepared, heldState, stalled, countdownMilliseconds, finished, claimed });
  await context.close();

  // Seed only the wallet for deterministic shop coverage; this is separate from the real-lap evidence above.
  const shopContext = await browser.newContext({ ...mobileOptions, viewport: { width: 390, height: 844 } });
  await shopContext.addInitScript(() => { if (!localStorage.getItem('kart-career-v1')) localStorage.setItem('kart-career-v1', JSON.stringify({ coins: 5000 })); });
  const shopPage = await shopContext.newPage(); observe(shopPage);
  await shopPage.goto(url); await waitForReady(shopPage);
  await tapHome(shopPage, '商店 /');
  for (const [category, forward] of [['赛车', 1], ['装饰', 1], ['宠物', 1], ['车手服', 0]]) {
    await tapHome(shopPage, category);
    for (let i = 0; i < forward; i++) { await tapHome(shopPage, '›'); await waitForReady(shopPage); }
    await tapHome(shopPage, '购买'); await waitForReady(shopPage);
  }
  await shot(shopPage, 'shop-portrait');
  await tapHome(shopPage, '零部件');
  for (let i = 0; i < 3; i++) { await tapHome(shopPage, '升级', i); await waitForReady(shopPage); }
  await tapHome(shopPage, '主页'); await waitForReady(shopPage);
  const purchased = await state(shopPage);
  assert.equal(purchased.career.equipped.vehicle, 'dune-buggy');
  assert.equal(purchased.career.equipped.decoration, 'racing-stripes');
  assert.equal(purchased.career.equipped.pet, 'cloud-cat');
  assert.equal(purchased.career.equipped.driver, 'aviator');
  assert.deepEqual(purchased.upgrades, { engine: 1, grip: 1, nitro: 1 });
  assert.ok(purchased.career.coins < 5000);
  await shot(shopPage, 'equipped-portrait');
  await shopPage.reload(); await waitForReady(shopPage);
  assert.deepEqual((await state(shopPage)).career, purchased.career);
  await tapHome(shopPage, '选择比赛'); await tapHome(shopPage, '展开高级');
  for (let i = 0; i < 3; i++) await tapHome(shopPage, '−');
  await tapHome(shopPage, '进入赛道'); await waitForReady(shopPage);
  assert.equal((await state(shopPage)).drivers.length, 1);
  evidence.cases.push({ syntheticWallet: true, purchased, soloGrid: await state(shopPage) });
  await shopContext.close();
  assert.deepEqual(evidence.errors, []);
  await writeFile(new URL('career-home.json', reportsURL), JSON.stringify(evidence, null, 2));
  console.log('PASS: real touch career lap and rewards; default lazy assets; 0/3/7 bots; blocked asset loading; real-time countdown; shop, equipment and upgrades with seeded wallet; phone portrait persistence');
} finally { release(); await browser.close(); }
