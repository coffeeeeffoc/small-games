import assert from 'node:assert/strict';
import { chromium, browserOptions, continueGame, pauseGame } from './browser-helpers.mjs';
import { restoreProgress, findSpelling } from '../engine.js';

const base = process.env.GAME_URL || 'http://127.0.0.1:4175/';
const invite = new URL(base); invite.search = '?daily=2026-10-01&v=1&token=private&answers=spoiler';
const browser = await chromium.launch(browserOptions);
const errors = [];
const contexts = [];
async function context(options = {}) {
  const result = await browser.newContext(options); contexts.push(result);
  await result.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('clipboard unavailable')) } });
  });
  result.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  return result;
}
const board = page => page.locator('.tile').evaluateAll(tiles => tiles.map(tile => ({ id: tile.dataset.tileId, char: tile.dataset.char, left: tile.style.left, top: tile.style.top, z: tile.style.zIndex, selected: tile.getAttribute('aria-pressed') })));
const daily = page => page.evaluate(() => JSON.parse(localStorage.getItem('ciyu-daily-v1')));
try {
  const first = await context({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const page = await first.newPage();
  await page.goto(base);
  await continueGame(page);
  await page.locator('.tile[aria-disabled="false"]').first().tap();
  const free = await page.evaluate(() => localStorage.getItem('ciyu-progress'));
  const freeBoard = await board(page);
  await page.goto(invite.href);
  const initial = await board(page);
  assert.equal((await daily(page)).challenge, '2026-10-01');
  assert.equal(await page.evaluate(() => localStorage.getItem('ciyu-progress')), free, 'opening an invitation preserves the ordinary partial game');
  const second = await context({ viewport: { width: 1280, height: 900 } });
  const friend = await second.newPage();
  await friend.goto(invite.href);
  assert.deepEqual(await board(friend), initial, 'another browser starts the identical theme, tiles and active meaning');
  await pauseGame(page);
  await page.locator('#daily-share').tap();
  const shared = new URL(await page.locator('#challenge-link').inputValue());
  assert.deepEqual([...shared.searchParams.keys()], ['daily', 'v']);
  assert.equal(shared.hash, '');
  assert.ok(!/private|spoiler/.test(shared.href));
  await page.locator('#copy-challenge').tap();
  assert.match(await page.locator('#share-status').innerText(), /请长按/);
  await page.locator('#share-dialog [data-close]').last().tap();
  await continueGame(page);
  await page.locator('.tile[aria-disabled="false"]').first().tap();
  const partial = await board(page);
  await page.reload();
  assert.deepEqual(await board(page), partial, 'daily reload retains the unfinished answer and exact positions');
  await continueGame(page);
  await page.locator('#clear-button').tap();
  while ((await daily(page)).completed.length < 6) {
    const record = await daily(page);
    const game = restoreProgress(record.entries, record.completed, Math.random, record.board);
    const spelling = findSpelling(game, game.activeWordId);
    assert.ok(spelling, 'the daily island always offers a playable word');
    for (const id of spelling) await page.locator(`[data-tile-id="${id}"]`).tap();
    await page.waitForFunction(count => Number(document.querySelector('#completed-count').textContent) > count, record.completed.length);
  }
  await page.locator('#win-dialog').waitFor({ state: 'visible' });
  assert.match(await page.locator('#win-summary').innerText(), /独立拾词/);
  await page.locator('#play-again-button').tap();
  assert.deepEqual(await board(page), initial, 'same-day replay resets to the same puzzle, not a new random island');
  await page.locator('#hint-button').tap();
  assert.equal((await daily(page)).dailyStats.hints, 1);
  await page.locator('#shuffle-button').tap();
  assert.equal((await daily(page)).dailyStats.shuffles, 1);
  await page.locator('#pause-button').tap();
  await page.locator('#daily-exit').tap();
  assert.deepEqual(await board(page), freeBoard, 'leaving a daily island restores the original ordinary partial board');
  assert.equal(await page.evaluate(() => localStorage.getItem('ciyu-progress')), free);
  await page.reload();
  assert.deepEqual(await board(page), freeBoard);
  await page.goto(`${base}?daily=2026-02-29&v=1`);
  assert.match(await page.locator('#feedback').innerText(), /链接.*无效/);
  assert.deepEqual(await board(page), freeBoard, 'invalid invitations do not discard saved ordinary progress');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

  const canceled = await context();
  await canceled.addInitScript(() => Object.defineProperty(navigator, 'share', { configurable: true, value: () => Promise.reject(new DOMException('cancel', 'AbortError')) }));
  const cancelPage = await canceled.newPage();
  await cancelPage.goto(invite.href);
  await pauseGame(cancelPage);
  await cancelPage.locator('#daily-share').click();
  assert.match(await cancelPage.locator('#feedback').innerText(), /取消分享/);
  assert.equal(await cancelPage.locator('#share-dialog').isVisible(), false, 'canceling native share never pretends a link was copied');
  assert.deepEqual(errors, []);
  console.log('PASS daily word island: cross-browser identical puzzle, ordinary/daily partial save isolation, full six-word win, counters, exact replay, sanitized link, clipboard fallback and native-share cancellation.');
} finally { for (const context of contexts) await context.close(); await browser.close(); }
