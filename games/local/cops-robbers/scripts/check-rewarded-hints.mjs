import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { chromium } from '@playwright/test';
import { levels } from '../src/levels.js';
import { solutions } from '../src/solutions.js';
import { initialState, step } from '../src/engine.js';

let ownServer;
if (!process.env.BASE_URL) {
  const previousPort = process.env.PORT;
  process.env.PORT = '0'; process.argv.push('--dist');
  ownServer = (await import('./serve.mjs')).server;
  if (previousPort === undefined) delete process.env.PORT; else process.env.PORT = previousPort;
  if (!ownServer.listening) await once(ownServer, 'listening');
}
const base = process.env.BASE_URL || `http://127.0.0.1:${ownServer.address().port}`;
const output = new URL('../outputs/rewarded-hints/', import.meta.url);
let browser;
const report = { base, physicalMobile: false, realAdsVerified: false, checks: [] };
async function check(name, run, init, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
  if (init) await context.addInitScript(init);
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => errors.push(request.failure()?.errorText));
  page.on('request', request => { if (/\/api\/competition\//.test(request.url())) requests.push(request.url()); });
  try {
    await page.goto(`${base}/?dev=0&motion=reduce&room=OLDROOM`);
    await page.locator('#home-start').waitFor({ state: 'visible' });
    assert.ok(await page.locator('#friend-duel').isDisabled());
    await run(page);
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, [], 'Single-player release does not contact competition services');
    report.checks.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } finally { await context.close(); }
}
const state = page => page.evaluate(() => JSON.parse(localStorage.getItem('cops-robbers-v3')).current.state);
const start = async page => { await page.locator('#home-start').tap(); await page.getByTestId('board').waitFor({ state: 'visible' }); };
const ready = page => page.waitForFunction(() => !document.getElementById('hint').disabled);
try {
  await mkdir(output, { recursive: true });
  const entry = await (await fetch(base)).text();
  assert.ok(!entry.includes('src="./competition.js"'), 'Offline release must not inject the disabled friend competition entry');
  const executablePath = process.env.BROWSER_EXECUTABLE || process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.CHROMIUM_PATH;
  browser = await chromium.launch(executablePath ? { executablePath } : {});
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await check(`mock-complete-cancel-${viewport.width}`, async page => {
      await page.screenshot({ path: fileURLToPath(new URL(`home-${viewport.width}.png`, output)) });
      await start(page);
      const before = await state(page);
      await page.getByTestId('hint').tap();
      const ad = page.locator('[data-game-ad="mock"]');
      await ad.waitFor();
      assert.equal(await page.locator('.hint-circle').count(), 0, 'No hint before ad completion');
      assert.ok(await ad.getByRole('button', { name: '领取奖励', exact: true }).isDisabled());
      await page.keyboard.press('Control+z');
      await page.locator('#board').evaluate(board => board.querySelector('.node-label').dispatchEvent(new MouseEvent('click', { bubbles: true })));
      assert.deepEqual(await state(page), before, 'Ad locks keyboard and scene input');
      await page.screenshot({ path: fileURLToPath(new URL(`ad-${viewport.width}.png`, output)) });
      await ad.getByRole('button', { name: '关闭并继续', exact: true }).tap();
      await ready(page);
      assert.equal(await page.locator('.hint-circle').count(), 0);
      assert.match(await page.locator('#play-prompt').textContent(), /广告未看完/);
      await page.getByTestId('hint').tap();
      await ad.getByRole('button', { name: '领取奖励', exact: true }).tap();
      await page.locator('.hint-circle').waitFor();
      assert.deepEqual(await state(page), before, 'Ad and hint consume no turn');
      await page.screenshot({ path: fileURLToPath(new URL(`hint-${viewport.width}.png`, output)) });
      await page.locator('#focus-toggle').tap();
      await page.reload();
      await page.locator('#resume-patrol').tap();
      assert.deepEqual(await state(page), before, 'Return/reload preserves the local patrol');
    }, undefined, viewport);
  }
  for (const status of ['dismissed', 'unavailable', 'failed', 'invalid']) {
    await check(`host-${status}`, async page => {
      await page.evaluate(status => { globalThis.SmallGamesRewardAds = { offer: async request => { globalThis.__adRequest = request; return { status }; } }; }, status);
      await start(page); const before = await state(page);
      await page.getByTestId('hint').tap(); await ready(page);
      assert.equal(await page.locator('.hint-circle').count(), 0);
      assert.match(await page.locator('#play-prompt').textContent(), /广告/);
      assert.deepEqual(await state(page), before);
      assert.deepEqual(await page.evaluate(() => globalThis.__adRequest), { id: 'cops-robbers:hint', reward: { hint: 1 } });
    });
  }
  await check('host-missing-and-throwing', async page => {
    await start(page);
    await page.evaluate(() => { globalThis.SmallGamesPublishingConfig = { adMode: 'host' }; });
    await page.getByTestId('hint').tap(); await ready(page);
    assert.match(await page.locator('#play-prompt').textContent(), /广告暂不可用/);
    await page.evaluate(() => { globalThis.SmallGamesPublishingConfig.provider = { show() { throw new Error('SDK failure'); } }; });
    await page.getByTestId('hint').tap(); await ready(page);
    assert.match(await page.locator('#play-prompt').textContent(), /广告加载失败/);
    assert.equal(await page.locator('.hint-circle').count(), 0);
  });
  await check('stale-completion-and-repeated-request', async page => {
    await start(page); const before = await state(page);
    await page.evaluate(() => {
      globalThis.__offers = 0;
      globalThis.SmallGamesRewardAds = { offer: () => { globalThis.__offers++; return new Promise(resolve => { globalThis.__finishAd = resolve; }); } };
    });
    await page.getByTestId('hint').tap();
    await page.locator('#hint').evaluate(button => button.dispatchEvent(new MouseEvent('click')));
    assert.equal(await page.evaluate(() => globalThis.__offers), 1);
    await page.locator('#focus-toggle').evaluate(button => button.click());
    await page.locator('#resume-patrol').tap();
    await page.evaluate(() => globalThis.__finishAd({ status: 'completed' }));
    await ready(page);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    assert.equal(await page.locator('.hint-circle').count(), 0, 'Late completion cannot reward a cancelled request');
    assert.deepEqual(await state(page), before);
  });
  for (const cleanup of ['missing', 'pending']) await check(`host-timeout-and-background-${cleanup}`, async page => {
    await start(page);
    await page.clock.install();
    await page.evaluate(cleanup => {
      globalThis.__offers = 0;
      globalThis.SmallGamesRewardAds = { offer: () => { globalThis.__offers++; return new Promise(resolve => { globalThis.__finishAd = resolve; }); } };
      if (cleanup === 'pending') globalThis.SmallGamesRewardAds.dispose = () => { globalThis.__disposed = true; };
    }, cleanup);
    await page.getByTestId('hint').tap();
    await page.clock.fastForward(45001);
    await page.waitForFunction(() => !document.querySelector('[inert]'));
    assert.match(await page.locator('#play-prompt').textContent(), /广告加载失败/);
    assert.equal(await page.evaluate(() => globalThis.__disposed === true), cleanup === 'pending');
    assert.ok(await page.getByTestId('hint').isDisabled());
    await page.locator('#hint').evaluate(button => button.dispatchEvent(new MouseEvent('click')));
    assert.equal(await page.evaluate(() => globalThis.__offers), 1, 'Timeout cannot reenter an unfinished host ad');
    await page.evaluate(() => globalThis.__finishAd({ status: 'completed' }));
    await ready(page);
    assert.equal(await page.locator('.hint-circle').count(), 0);
    await page.getByTestId('hint').tap();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.locator('[inert], .hint-circle').count(), 0);
    await page.evaluate(() => globalThis.__finishAd({ status: 'completed' }));
    await ready(page);
    assert.equal(await page.locator('.hint-circle').count(), 0);
  });
  await check('completed-host-hints-and-win', async page => {
    await start(page); let current = initialState(levels[0]);
    for (const plan of solutions[1]) {
      await page.getByTestId('hint').tap(); await page.locator('.hint-circle').waitFor();
      const cop = Math.max(0, plan.findIndex((node, i) => node !== current.cops[i]));
      await page.locator(`#squad [data-cop="${cop}"]`).tap();
      await page.getByTestId(`node-${plan[cop]}`).tap();
      current = step(levels[0], current, plan).state;
      await page.waitForFunction(turn => +document.body.dataset.turn === turn && ['planning', 'won'].includes(document.body.dataset.phase), current.turn);
    }
    assert.equal(await page.locator('body').getAttribute('data-phase'), 'won');
    assert.equal(await page.evaluate(() => globalThis.__offers), solutions[1].length, 'Every hint requires its own completed ad');
    await page.locator('#next-level').tap();
    assert.equal(await page.locator('body').getAttribute('data-level'), '2');
  }, () => { globalThis.__offers = 0; globalThis.SmallGamesRewardAds = { offer: async () => { globalThis.__offers++; return { status: 'completed' }; } }; });
  report.passed = true;
} finally {
  try { await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2)); }
  finally {
    await browser?.close();
    if (ownServer) await new Promise(resolve => ownServer.close(resolve));
  }
}
