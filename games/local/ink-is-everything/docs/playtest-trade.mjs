import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { Player, snapshot, sleep } from './playtest-driver.mjs';
import { attachRewardHandler } from './playtest-rewards.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const url = process.env.GAME_URL || 'http://127.0.0.1:4412/';
const report = {
  version: 3,
  date: new Date().toISOString(),
  url,
  input: 'Native touch through the free main route, public shop and browser reload',
  cases: [],
  errors: [],
  status: 'running',
};
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  const player = new Player(page, context, true);
  await player.init();
  attachRewardHandler(player, report, async () => {}, { checkReload: false });
  await player.tap('#start-game');
  assert.equal((await snapshot(page)).version, 3);
  await player.clearRoom({ reserve: 45 });
  await player.pickupAll();
  await player.moveTo({ x: 905, y: 300 }, { expectedRoom: 'sentinel' });
  await player.clearRoom({ reserve: 45 });
  await player.pickupAll();
  await player.moveTo({ x: 905, y: 300 }, { expectedRoom: 'market' });
  await player.moveTo({ x: 683, y: 232 });
  await player.tap('#interact');
  await page.waitForSelector('[data-buy]');
  const before = await snapshot(page);
  const offer = before.definition.shopItems.find((item) => {
    const definition = before.definition.equipment[item.itemId || item.id];
    return (
      definition &&
      !definition.modifiers.maxInk &&
      (before.equipment[item.itemId || item.id] || 0) < definition.maxRank &&
      before.player.ink - item.price >= before.definition.rules.minInkAfterSpend
    );
  });
  assert.ok(offer, 'There must be an affordable equipment rank left after the actual journey');
  const itemId = offer.itemId || offer.id;
  await player.tap(`[data-buy="${offer.id}"]`);
  const after = await snapshot(page);
  assert.equal(after.player.ink, Math.round((before.player.ink - offer.price) * 100) / 100);
  assert.equal(after.player.maxInk, before.player.maxInk);
  assert.equal(after.equipment[itemId], (before.equipment[itemId] || 0) + 1);
  assert.equal(after.stats.spent.trade - before.stats.spent.trade, offer.price);
  assert.equal(after.stats.trades, before.stats.trades + 1);
  await player.tap('#modal-close');
  await player.tap('#pause');
  await player.tap('[data-menu="equipment"]');
  assert.equal(await page.locator('#modal').getAttribute('data-kind'), 'equipment');
  await page.screenshot({
    path: new URL('./screenshots/v3-mobile-trade.png', import.meta.url).pathname,
  });
  await player.release();
  await player.touch?.close();
  player.touch = null;
  await page.reload({ waitUntil: 'networkidle' });
  await player.init();
  assert.match(await page.locator('#start-game').textContent(), /继续/);
  await player.tap('#start-game');
  const restored = await snapshot(page);
  assert.equal(restored.roomId, 'market');
  assert.equal(restored.player.ink, after.player.ink);
  assert.deepEqual(restored.equipment, after.equipment);
  assert.equal(restored.stats.trades, after.stats.trades);
  report.cases.push({
    name: 'Actual shop purchase consumes only survival ink, adds one equipment rank, and persists exactly once across refresh',
    status: 'passed',
    offer: offer.id,
    itemId,
    price: offer.price,
    inkBefore: before.player.ink,
    inkAfter: after.player.ink,
    maxInk: after.player.maxInk,
    previousRank: before.equipment[itemId] || 0,
    rank: after.equipment[itemId],
  });
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  await browser?.close();
  await writeFile(
    new URL('./playtest-trade-report.json', import.meta.url),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
}
