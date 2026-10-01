import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readScenes } from './check-catalog.mjs';
import { createCatalog } from '../src/catalog.js';
import { dailyDeck } from '../src/challenge.js';

const base = process.env.PLAYTEST_URL || 'http://127.0.0.1:4318/';
const invite = new URL(base); invite.search = '?daily=2026-10-01&v=1&region=china&timed=0&token=private&year=1420';
const catalog = createCatalog(readScenes(), '');
const challenge = { day: '2026-10-01', region: 'china', timed: false };
const expected = dailyDeck(catalog, challenge);
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE || '/usr/bin/chromium', headless: true });
const contexts = [], errors = [];
async function context(options = {}) {
  const result = await browser.newContext(options); contexts.push(result);
  await result.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('clipboard unavailable')) } });
  });
  result.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  return result;
}
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('here-and-then.v1')));
const ready = page => page.locator('#load-cover').waitFor({ state: 'hidden' });
async function pick(page, city, year) {
  if (await page.locator('#map-tab').isVisible()) await page.locator('#map-tab').click();
  await page.locator('#city-search').fill(city);
  await page.locator('#search-results button').first().click();
  await page.selectOption('#era-select', year < 0 ? 'bce' : 'ce');
  await page.locator('#year-number').fill(String(Math.abs(year)));
}
try {
  const first = await context({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await first.newPage();
  await page.goto(base);
  await page.locator('#start').click(); await ready(page);
  await pick(page, '北京', 1420);
  const ordinary = (await saved(page)).journey;
  await page.locator('#leave').click(); await page.locator('#exit').click();
  await page.goto(invite.href);
  await page.locator('#daily-share').click();
  const shared = new URL(await page.locator('#daily-link').inputValue());
  assert.deepEqual([...shared.searchParams.keys()], ['daily', 'v', 'region', 'timed']);
  assert.ok(!/private|year/.test(shared.href));
  await page.locator('#copy-daily').click();
  assert.match(await page.locator('#share-status').innerText(), /请长按/);
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await page.locator('#daily-start').click(); await ready(page);
  assert.deepEqual((await saved(page)).dailyJourney.deck, expected.map(round => round.id));
  assert.deepEqual((await saved(page)).journey, ordinary);

  const friendContext = await context({ viewport: { width: 1280, height: 900 } });
  await friendContext.addInitScript(({ ids, origin }) => {
    if (location.origin === origin) localStorage.setItem('here-and-then.v1', JSON.stringify({ best: 1234, visited: ids, sound: false }));
  }, { ids: catalog.map(round => round.id), origin: new URL(base).origin });
  const friend = await friendContext.newPage();
  await friend.goto(invite.href); await friend.locator('#daily-start').click(); await ready(friend);
  assert.equal((await saved(friend)).visited.length, catalog.length, 'the second browser starts with a full journal fixture');
  assert.deepEqual((await saved(friend)).dailyJourney.deck, (await saved(page)).dailyJourney.deck, 'another browser with a full journal still gets the same five scenes');
  assert.equal(await friend.locator('#panorama').getAttribute('data-image'), await page.locator('#panorama').getAttribute('data-image'));
  await pick(page, '北京', 1420);
  const dailyAnswer = (await saved(page)).dailyJourney;
  await page.reload(); await page.locator('#daily-start').click(); await ready(page);
  assert.deepEqual((await saved(page)).dailyJourney, dailyAnswer, 'daily refresh continues without replacing ordinary journey or answers');
  for (let i = 0; i < expected.length; i++) {
    await pick(page, expected[i].location, expected[i].year);
    await page.locator('#submit').click();
    await page.locator('#next').waitFor();
    await page.locator('#next').click();
    if (i < expected.length - 1) await ready(page);
  }
  await page.locator('.summary-row').first().waitFor();
  assert.equal(await page.locator('.summary-row').count(), 5);
  assert.equal((await saved(page)).dailyRecord.total, 25000);
  assert.equal((await saved(page)).best, 0, 'known daily retries do not raise the ordinary journey record');
  assert.deepEqual((await saved(page)).journey, ordinary);
  await page.locator('#again').click(); await ready(page);
  assert.deepEqual((await saved(page)).dailyJourney.deck, expected.map(round => round.id), 'same-topic replay preserves the five-scene order');
  await page.locator('#leave').click(); await page.locator('#exit').click();
  await page.locator('#resume').click(); await ready(page);
  assert.deepEqual((await saved(page)).journey, ordinary, 'the unfinished ordinary route and guess can still be resumed');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.goto(`${base}?daily=2026-02-29&region=world&timed=2`);
  assert.match(await page.locator('#toast').innerText(), /链接.*无效/);
  assert.deepEqual((await saved(page)).journey, ordinary);

  const canceled = await context();
  await canceled.addInitScript(() => Object.defineProperty(navigator, 'share', { configurable: true, value: () => Promise.reject(new DOMException('cancel', 'AbortError')) }));
  const cancelPage = await canceled.newPage();
  await cancelPage.goto(invite.href); await cancelPage.locator('#daily-share').click();
  assert.match(await cancelPage.locator('#toast').innerText(), /取消分享/);
  assert.equal(await cancelPage.locator('#modal').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS daily history: two browsers with different footprints share five scenes, ordinary/daily save and record isolation, retained guesses, five perfect rounds, exact replay, public links, clipboard fallback and native-share cancellation.');
} finally { for (const context of contexts) await context.close(); await browser.close(); }
