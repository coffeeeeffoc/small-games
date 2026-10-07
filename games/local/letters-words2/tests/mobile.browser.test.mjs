import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { restoreProgress, findSpelling } from '../engine.js';
import {
  chromium, browserOptions, activate, continueGame, goHome,
  openImport, openLibrary, openSettings, boardSnapshot,
} from './browser-helpers.mjs';

const base = process.env.GAME_URL || 'http://127.0.0.1:4175/';
const output = process.env.QA_OUTPUT || 'outputs/letters-words2-mobile';
await mkdir(output, { recursive: true });
const browser = await chromium.launch(browserOptions);
const errors = [];

async function noOverflow(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'page fits the phone width');
  const open = page.locator('dialog[open]');
  if (await open.count()) assert.ok(await open.evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth + 1), 'active page fits the phone width');
}

async function coreLayout(page, viewport) {
  const controls = await page.locator('.spelling-area,.board-tools').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { name: node.className, top: rect.top, bottom: rect.bottom };
  }));
  for (const rect of controls) assert.ok(rect.top >= 0 && rect.bottom <= viewport.height + 1, `${viewport.width}×${viewport.height}: ${JSON.stringify(rect)}`);
  const sizes = await page.locator('.tile,.board-tools button,#pause-button,#switch-word').evaluateAll(nodes => nodes.filter(node => !node.hidden).map(node => {
    const rect = node.getBoundingClientRect();
    return { label: node.getAttribute('aria-label') || node.textContent, width: rect.width, height: rect.height };
  }));
  for (const size of sizes) assert.ok(size.width >= 43.9 && size.height >= 43.9, `touch target: ${JSON.stringify(size)}`);
  await noOverflow(page);
}

async function screenshot(page, name, viewport) {
  if (viewport.width === 390) {
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(output, `${name}-390.png`) });
  }
}

async function importWords(page, text) {
  await openImport(page);
  await page.locator('#word-input').fill(text);
  await activate(page, '#import-form button[type="submit"]');
  await page.locator('#board').waitFor({ state: 'visible' });
}

async function savedGame(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ciyu-progress')));
}

async function solveActive(page) {
  const record = await savedGame(page);
  const game = restoreProgress(record.entries, record.completed, Math.random, record.board);
  const path = findSpelling(game, game.activeWordId);
  assert.ok(path, 'current word has a legal spelling');
  for (const id of path) await page.locator(`[data-tile-id="${id}"]`).tap();
  return record.completed.length + 1;
}

try {
  for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(7000);
    await page.goto(base);
    assert.equal(await page.locator('#board').isVisible(), false, 'homepage keeps gameplay behind its entrance');
    for (const selector of ['#focus-button', '#islands-button', '#learn-button']) {
      const rect = await page.locator(selector).boundingBox();
      assert.ok(rect && rect.y >= 0 && rect.y + rect.height <= viewport.height, `${selector} is reachable on the first home screen`);
      assert.ok(rect.height >= 44 && rect.width >= 44);
    }
    await screenshot(page, 'home', viewport);
    await activate(page, '#islands-button');
    await page.locator('#islands-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#mini-choices [data-mini]').count(), 3);
    await noOverflow(page);
    await screenshot(page, 'islands', viewport);
    await activate(page, '#islands-dialog [data-close]');
    await activate(page, '#learn-button');
    assert.equal(await page.locator('#learn-dialog').isVisible(), true);
    assert.equal(await page.locator('#open-library').isVisible(), true);
    assert.equal(await page.locator('#my-words-button').isVisible(), true);
    await screenshot(page, 'learn', viewport);
    await goHome(page);

    await continueGame(page);
    assert.match(await page.locator('#pause-button').getAttribute('aria-label'), /暂停/);
    await coreLayout(page, viewport);
    await screenshot(page, 'game', viewport);
    const tile = page.locator('.tile[aria-disabled="false"]').first();
    await tile.scrollIntoViewIfNeeded();
    const rect = await tile.boundingBox();
    const beforeCancel = await boardSnapshot(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.deepEqual(await boardSnapshot(page), beforeCancel, 'cancelled touch leaves the board unchanged');
    await tile.tap();
    assert.equal(await page.locator('.answer-slot.filled').count(), 1);
    const selected = await boardSnapshot(page);
    await activate(page, '#pause-button');
    assert.equal(await page.locator('#pause-dialog').isVisible(), true);
    assert.equal(await page.locator('#resume-button').isVisible(), true);
    await screenshot(page, 'pause', viewport);
    await activate(page, '#resume-button');
    assert.deepEqual(await boardSnapshot(page), selected, 'pause/resume keeps the partial spelling');
    await goHome(page);
    await openLibrary(page);
    await page.locator('#textbook-publisher option').first().waitFor({ state: 'attached' });
    await noOverflow(page);
    await screenshot(page, 'library', viewport);
    await goHome(page);
    await openSettings(page);
    assert.equal(await page.locator('[data-game-fullscreen]').count(), 1, 'one H5 fullscreen entry');
    await screenshot(page, 'settings', viewport);
    await goHome(page);
    await continueGame(page);
    assert.deepEqual(await boardSnapshot(page), selected, 'learning/settings navigation preserves the live board');
    await page.setViewportSize({ width: 844, height: 390 });
    await coreLayout(page, { width: 844, height: 390 });
    assert.deepEqual(await boardSnapshot(page), selected, 'physical orientation change preserves selection');
    await page.setViewportSize(viewport);
    await page.reload();
    await continueGame(page);
    assert.deepEqual(await boardSnapshot(page), selected, 'reload preserves the selected tile and positions');

    const longWord = 'a'.repeat(79);
    await importWords(page, `${longWord} 长词测试\nI 我`);
    await activate(page, '#switch-word');
    await activate(page, '[data-word-id="word-0"]');
    assert.equal(await page.locator('.answer-slot').count(), 79, 'maximum supported word remains playable');
    await coreLayout(page, viewport);
    const boardArea = page.locator('.board-scene');
    const area = await boardArea.boundingBox();
    assert.ok(await boardArea.evaluate(node => node.scrollHeight > node.clientHeight), 'long board has an independent scrolling viewport');
    const x = area.x + area.width / 2;
    const startY = area.y + area.height - 24;
    const endY = area.y + 24;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY }] });
    for (let step = 1; step <= 6; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: startY + (endY - startY) * step / 6 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(() => document.querySelector('.board-scene').scrollTop > 0);
    assert.equal(await page.locator('.answer-slot.filled').count(), 0, 'scrolling the board does not pick a letter');
    await coreLayout(page, viewport);
    await screenshot(page, 'long-word', viewport);

    if (viewport.width === 390) {
      await importWords(page, 'I 我\nMs 女士');
      const count = await solveActive(page);
      await page.waitForFunction(completed => document.querySelectorAll('.word-row.done').length === completed, count);
      await solveActive(page);
      await activate(page, '#pause-button');
      await page.waitForTimeout(400);
      assert.equal(await page.locator('#pause-dialog').isVisible(), true, 'delayed celebration keeps the pause page in front');
      assert.equal(await page.locator('#win-dialog').isVisible(), false, 'result does not interrupt pause');
      await activate(page, '#resume-button');
      if (!(await page.locator('#win-dialog').isVisible())) await activate(page, '#result-button');
      assert.deepEqual(await page.locator('#win-words span').allTextContents(), ['I · 我', 'Ms · 女士']);
      await screenshot(page, 'results', viewport);
    }
    await cdp.detach();
    await context.close();
    console.log(`PASS mobile ${viewport.width}×${viewport.height}: page navigation, 44px touch targets, cancel, save/resume, orientation, 79-character scrolling board`);
  }

  const unavailable = await browser.newContext({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
  await unavailable.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Disabled', 'SecurityError'); } });
  });
  const page = await unavailable.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await continueGame(page);
  await page.locator('.tile[aria-disabled="false"]').first().tap();
  assert.equal(await page.locator('.answer-slot.filled').count(), 1, 'disabled storage does not prevent local play');
  await goHome(page);
  await continueGame(page);
  assert.equal(await page.locator('.answer-slot.filled').count(), 1, 'in-memory game survives page navigation without storage');
  await unavailable.close();
  assert.deepEqual(errors, [], 'mobile navigation has no runtime errors');
  console.log(`PASS storage-disabled local play and delayed-result pause. Chrome touch emulation screenshots: ${output}`);
} finally {
  await browser.close();
}
