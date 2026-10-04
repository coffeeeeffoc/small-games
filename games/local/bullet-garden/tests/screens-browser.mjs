import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : '@playwright/test'
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const url = process.env.GAME_URL || 'http://127.0.0.1:4410';
const output = process.env.QA_OUTPUT || 'docs/qa/clear-and-charges/screens';
await mkdir(output, { recursive: true });
const report = { browser: await browser.version(), url, errors: [], checks: [], passed: false };
const snapshot = (page) => page.evaluate(() => window.__bulletGarden.snapshot());
async function click(page, selector) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  await page.locator(selector).tap();
  await page.clock.runFor(64);
}
async function screen(page, name) {
  assert.equal(await page.locator('body').getAttribute('data-screen'), name);
  assert.equal(await page.locator('#overlay > section:visible').count(), 1);
  assert.equal(
    await page.locator('#arena').isVisible(),
    false,
    'other pages have no battlefield backdrop',
  );
  const rect = await page.locator(`#${name}-panel`).boundingBox();
  assert.deepEqual(
    { width: rect.width, height: rect.height, x: rect.x, y: rect.y },
    { ...page.viewportSize(), x: 0, y: 0 },
  );
  assert.equal(
    await page
      .locator(`#${name}-panel`)
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
    true,
  );
}
async function setup(viewport, stored = null, query = '') {
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
  if (stored !== null)
    await context.addInitScript(
      (value) => localStorage.setItem('bullet-garden.dev', value),
      stored,
    );
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-04T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-04T00:00:01Z'));
  await page.goto(`${url}/${query}`);
  await page.clock.runFor(64);
  return { context, page };
}
try {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [1680, 900],
  ]) {
    const { context, page } = await setup({ width, height });
    await screen(page, 'ready');
    assert.equal(await page.locator('#ready-last-result').isVisible(), false);
    await page.screenshot({ path: `${output}/home-${width}x${height}.png` });
    await click(page, '#ready-campaign');
    await screen(page, 'campaign');
    assert.equal(
      await page.locator('[data-level]:enabled').count(),
      1,
      'normal mode keeps progression locks',
    );
    await page.screenshot({ path: `${output}/campaign-${width}x${height}.png` });
    await click(page, '#close-campaign');
    await screen(page, 'ready');
    await click(page, '#ready-shop');
    await screen(page, 'shop');
    await page
      .locator('#shop-panel')
      .evaluate((element) => (element.scrollTop = element.scrollHeight));
    await page.clock.runFor(32);
    assert.equal(await page.locator('#close-shop').isVisible(), true);
    await page.screenshot({ path: `${output}/camp-${width}x${height}.png` });
    await click(page, '#close-shop');
    await click(page, '#start');
    assert.equal(await page.locator('body').getAttribute('data-screen'), 'battle');
    assert.equal(await page.locator('#overlay').isVisible(), false);
    await click(page, '#auto-fire');
    let state = await snapshot(page);
    for (let turn = 0; ['playing', 'upgrade'].includes(state.phase) && turn < 100; turn++) {
      if (state.phase === 'upgrade') await click(page, '[data-upgrade]:first-child');
      else await page.clock.runFor(1000);
      state = await snapshot(page);
    }
    assert.equal(state.phase, 'lost', 'actual damage produces the game-end screen');
    await screen(page, 'result');
    assert.equal(
      await page.locator('#result-panel button').count(),
      1,
      'end screen only returns home',
    );
    const overview = await page.locator('#result-stats').innerText();
    const profile = await page.evaluate(() => localStorage.getItem('bullet-garden.profile.v1'));
    await page.screenshot({ path: `${output}/overview-${width}x${height}.png` });
    await click(page, '#result-home');
    await screen(page, 'ready');
    await click(page, '#ready-last-result');
    await screen(page, 'result');
    assert.equal(await page.locator('#result-stats').innerText(), overview);
    assert.equal(
      await page.evaluate(() => localStorage.getItem('bullet-garden.profile.v1')),
      profile,
      'review does not settle the run twice',
    );
    report.checks.push({
      viewport: { width, height },
      screens: ['ready', 'campaign', 'shop', 'battle', 'result', 'ready', 'result'],
      termination: 'natural loss',
      overviewPreserved: true,
    });
    console.log(`PASS exclusive screens and last-run overview ${width}x${height}`);
    await context.close();
  }
  for (const [stored, query, enabled] of [
    [null, '?dev=1', true],
    ['true', '', true],
    ['true', '?dev=0', false],
  ]) {
    const { context, page } = await setup({ width: 844, height: 390 }, stored, query);
    assert.equal((await snapshot(page)).controls.developerMode, enabled);
    await click(page, '#ready-campaign');
    assert.equal(await page.locator('[data-level]:enabled').count(), enabled ? 11 : 1);
    if (enabled) {
      await click(page, '[data-level="heartgarden"]');
      assert.equal((await snapshot(page)).levelId, 'heartgarden');
      await click(page, '#start');
      assert.equal((await snapshot(page)).developerRun, true);
      await click(page, '#auto-fire');
      for (let turn = 0; (await snapshot(page)).phase === 'playing' && turn < 100; turn++)
        await page.clock.runFor(1000);
      await screen(page, 'result');
      assert.match(await page.locator('#reward-note').innerText(), /开发者试玩/);
      const saved = JSON.parse(
        await page.evaluate(() => localStorage.getItem('bullet-garden.profile.v1')),
      );
      assert.deepEqual(saved.completed, []);
      assert.equal(saved.coins, 0);
      assert.equal(saved.xp, 0);
    }
    report.checks.push({ developerMode: { stored, query, enabled }, allLevelsSelectable: enabled });
    console.log(`PASS developer mode stored=${stored} query=${query} enabled=${enabled}`);
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.failure = error.stack;
  throw error;
} finally {
  await writeFile(`${output}/screens-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}
