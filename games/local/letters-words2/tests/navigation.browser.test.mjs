import assert from 'node:assert/strict';
import { createNativeSession } from '../native-session.js';
import { restoreProgress, findSpelling } from '../engine.js';
import { chromium, browserOptions } from './browser-helpers.mjs';

const base = process.env.GAME_URL || 'http://127.0.0.1:4175/';
const browser = await chromium.launch(browserOptions);
const errors = [];
const contexts = [];
async function phone(storage = []) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'no-preference' });
  contexts.push(context);
  await context.addInitScript(records => {
    localStorage.clear();
    for (const [key, value] of records) localStorage.setItem(key, value);
  }, storage);
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on('pageerror', error => errors.push(error.message));
  return page;
}
const tap = (page, selector) => page.locator(selector).first().tap();
const screen = page => page.locator('dialog[open]').evaluateAll(dialogs => dialogs.map(dialog => dialog.id));

try {
  const page = await phone();
  await page.goto(base);
  await tap(page, '#learn-button');
  await tap(page, '#my-words-button');
  assert.deepEqual(await screen(page), ['import-dialog']);
  await tap(page, '#import-dialog [data-close]');
  assert.deepEqual(await screen(page), ['learn-dialog']);
  await tap(page, '#learn-dialog [data-close]');
  assert.deepEqual(await screen(page), []);
  await tap(page, '#focus-button');
  await tap(page, '#pause-button');
  await tap(page, '#pause-settings');
  await tap(page, '#settings-dialog [data-close]');
  assert.deepEqual(await screen(page), ['pause-dialog']);
  await tap(page, '#help-button');
  await tap(page, '#help-dialog [data-close]');
  assert.deepEqual(await screen(page), ['pause-dialog']);
  await tap(page, '#resume-back');
  assert.deepEqual(await screen(page), []);

  for (const outcome of ['resolve', 'reject']) {
    const sharing = await phone();
    await sharing.goto(new URL('?mini=dawn', base).href);
    await tap(sharing, '#pause-button');
    await sharing.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: () => new Promise((resolve, reject) => {
      globalThis.__finishShare = { resolve, reject };
    }) }));
    await tap(sharing, '#mini-share');
    await sharing.waitForFunction(() => !!globalThis.__finishShare);
    await tap(sharing, '#home-button');
    const previousStatus = await sharing.locator('#home-status').textContent();
    await sharing.evaluate(outcome => __finishShare[outcome](outcome === 'reject' ? new Error('SDK share unavailable') : undefined), outcome);
    await sharing.waitForTimeout(60);
    assert.deepEqual(await screen(sharing), [], `late share ${outcome} keeps home visible`);
    assert.equal(await sharing.evaluate(() => document.body.classList.contains('is-playing')), false);
    assert.equal(await sharing.locator('#home-status').textContent(), previousStatus, 'late share feedback cannot write to a newer page');
  }

  const nativeStorage = new Map();
  const completed = createNativeSession({ getItem: key => nativeStorage.get(key), setItem: (key, value) => nativeStorage.set(key, value) });
  completed.startMini('dawn');
  while (!completed.completed) {
    const path = findSpelling(completed.state.game, completed.state.game.activeWordId);
    assert.ok(path);
    for (const id of path) completed.pick(id);
  }
  const results = await phone([...nativeStorage]);
  await results.goto(new URL('?mini=dawn', base).href);
  assert.deepEqual(await screen(results), ['win-dialog']);
  await results.evaluate(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => new Promise(resolve => { globalThis.__finishCopy = resolve; }) } });
  });
  await tap(results, '#win-share');
  assert.deepEqual(await screen(results), ['share-dialog']);
  assert.equal(await results.locator('#share-dialog').getAttribute('data-return-to'), 'win-dialog');
  await tap(results, '#copy-challenge');
  await results.waitForFunction(() => !!globalThis.__finishCopy);
  await results.evaluate(() => __finishCopy());
  await results.waitForFunction(() => document.querySelector('#share-status').textContent === '同题链接已复制。');
  await tap(results, '#share-dialog [data-close]');
  assert.deepEqual(await screen(results), ['win-dialog'], 'share returns to the result page');
  await tap(results, '#win-share');
  await results.evaluate(() => { globalThis.__finishCopy = undefined; });
  await tap(results, '#copy-challenge');
  await results.waitForFunction(() => !!globalThis.__finishCopy);
  const previousCopyStatus = await results.locator('#share-status').textContent();
  await tap(results, '#share-dialog [data-close]');
  await tap(results, '#win-home');
  await results.evaluate(() => __finishCopy());
  await results.waitForTimeout(60);
  assert.deepEqual(await screen(results), [], 'late clipboard success keeps home visible');
  assert.equal(await results.locator('#share-status').textContent(), previousCopyStatus, 'late clipboard success cannot change a dismissed page');

  const entries = [{ word: 'cat', meaning: '猫' }, { word: 'sun', meaning: '太阳' }];
  const finalGame = restoreProgress(entries, ['sun'], () => 0.45);
  const finalRecord = { entries, completed: ['sun'], name: '最后一词', practice: null, review: [], board: { tiles: finalGame.tiles, boardHeight: finalGame.boardHeight, activeWordId: finalGame.activeWordId, selected: [] } };
  const celebrating = await phone([['ciyu-progress', JSON.stringify(finalRecord)]]);
  await celebrating.goto(base);
  await tap(celebrating, '#focus-button');
  await celebrating.evaluate(() => {
    globalThis.__finalInputTimes = [];
    document.addEventListener('click', event => {
      if (event.target.closest('.tile,#pause-button')) __finalInputTimes.push(performance.now());
    }, true);
  });
  for (const id of findSpelling(finalGame, finalGame.activeWordId)) await tap(celebrating, `[data-tile-id="${id}"]`);
  await tap(celebrating, '#pause-button');
  const times = await celebrating.evaluate(() => __finalInputTimes);
  assert.ok(times.at(-1) - times.at(-2) < 280, 'pause occurs inside the delayed celebration window');
  await celebrating.waitForTimeout(350);
  assert.deepEqual(await screen(celebrating), ['pause-dialog'], 'delayed win keeps the player’s pause page');
  await tap(celebrating, '#resume-button');
  assert.deepEqual(await screen(celebrating), ['win-dialog'], 'completed round opens result when resumed');
  assert.deepEqual(errors, []);
  console.log('Mobile navigation, stale share/clipboard callbacks, result return chain and delayed celebration passed.');
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
