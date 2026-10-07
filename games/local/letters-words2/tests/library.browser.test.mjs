import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, browserOptions, openLibrary, continueGame } from './browser-helpers.mjs';
import { practiceBatches } from '../library.js';

const bookId = 'fltrp-sun-3-upper-2026';
const book = JSON.parse(await readFile(new URL(`../assets/english-dict/books/${bookId}.json`, import.meta.url)));
const catalog = JSON.parse(await readFile(new URL('../assets/english-dict/catalog.json', import.meta.url)));
const batches = practiceBatches(book.entries.filter(entry => entry.unit === 'Welcome'));
assert.equal(batches.at(-1).length, 1, 'exercise a real one-word final batch');
const browser = await chromium.launch(browserOptions);
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:4175');
  await openLibrary(page);
  for (const publisher of catalog.publishers) {
    await page.locator('#textbook-publisher').selectOption(publisher.id);
    const books = catalog.books.filter(item => item.publisherId === publisher.id);
    const grades = [...new Set(books.map(item => item.grade))].sort((a, b) => (a ?? 99) - (b ?? 99));
    assert.deepEqual(await page.locator('#textbook-grade option').evaluateAll(options => options.map(option => option.value)), grades.map(grade => String(grade ?? '')));
    for (const grade of grades) {
      await page.locator('#textbook-grade').selectOption(String(grade ?? ''));
      const expected = books.filter(item => item.grade === grade);
      assert.deepEqual(await page.locator('#textbook-book option').evaluateAll(options => options.map(option => option.value)), expected.map(item => item.id));
      for (const selected of expected) {
        await page.locator('#textbook-book').selectOption(selected.id);
        assert.deepEqual(await page.locator('#textbook-unit option').evaluateAll(options => options.map(option => option.value)), [...selected.units, '']);
      }
    }
  }
  await page.locator('#textbook-publisher').selectOption('fltrp');
  await page.locator('#textbook-grade').selectOption('7');
  const legacyId = 'fltrp-chenlin-2011-grade7-lower';
  const legacy = JSON.parse(await readFile(new URL(`../assets/english-dict/books/${legacyId}.json`, import.meta.url)));
  const legacyUnit = legacy.entries.find(entry => entry.word === 'Russia').unit;
  await page.locator('#textbook-book').selectOption(legacyId);
  await page.locator('#textbook-unit').selectOption(legacyUnit);
  await page.locator('#library-start').tap();
  await page.waitForFunction(() => !document.querySelector('#library-dialog').open);
  assert.deepEqual(await page.locator('.word-text').allTextContents(), practiceBatches(legacy.entries.filter(entry => entry.unit === legacyUnit))[0].map(entry => entry.meaning));
  await openLibrary(page);
  await page.locator('#textbook-publisher').selectOption('fltrp');
  await page.locator('#textbook-grade').selectOption('3');
  await page.locator('#textbook-book').selectOption(bookId);
  await page.locator('#textbook-unit').selectOption('Welcome');
  assert.equal(await page.locator('#library-details').evaluate(element => element.open), false);
  await page.locator('#library-start').click();
  await page.waitForFunction(() => !document.querySelector('#library-dialog').open);
  assert.match(await page.locator('#theme-name').textContent(), /孙有中.*Welcome/);
  let learned = 0;
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    assert.equal(await page.locator('.word-row').count(), batch.length);
    assert.deepEqual(await page.locator('.word-text').allTextContents(), batch.map(entry => entry.meaning));
    for (let completed = 0; completed < batch.length; completed++) {
      const playable = page.locator('.word-row:not(.done)').filter({ hasText: '可拼' }).first();
      if (await playable.count()) {
        if (await page.locator('#switch-word').isVisible()) await page.locator('#switch-word').tap();
        await playable.tap();
      }
      const length = await page.locator('.answer-slot').count();
      for (let letter = 0; letter < length; letter++) {
        await page.locator('#hint-button').tap();
        await page.locator('.tile.is-hinted').tap();
      }
      await page.waitForFunction(count => document.querySelectorAll('.word-row.done').length === count, completed + 1);
      if (batchIndex === 0 && completed === 0) {
        await page.reload();
        assert.equal(await page.locator('.word-row.done').count(), 1);
        assert.match(await page.locator('#feedback').textContent(), /恢复/);
        await continueGame(page);
      }
    }
    await page.locator('#win-dialog [data-close]').last().tap();
    assert.equal(await page.locator('#win-dialog').evaluate(dialog => dialog.open), false);
    await page.locator('#result-button').tap();
    assert.equal(await page.locator('#win-dialog').evaluate(dialog => dialog.open), true, 'textbook continuation and review remain reachable after dismissing results');
    learned += batch.length;
    await page.locator('#win-dialog').waitFor({ state: 'visible' });
    assert.deepEqual(await page.locator('#win-words span').allTextContents(), batch.map(entry => `${entry.displayWord || entry.word} · ${entry.meaning}`));
    assert.match(await page.locator('#study-progress').textContent(), new RegExp(`${learned} / 31`));
    if (batchIndex + 1 < batches.length) await page.locator('#play-again-button').tap();
  }
  assert.match(await page.locator('#play-again-button').textContent(), /本次教材练习完成/);
  assert.match(await page.locator('#review-button').textContent(), /31 个/);
  await page.locator('#review-button').tap();
  assert.match(await page.locator('#theme-name').textContent(), /易错词复习/);
  // An already-open game can use a cached book even when the network goes away.
  await context.setOffline(true);
  await openLibrary(page);
  await page.locator('#textbook-publisher').selectOption('fltrp');
  await page.locator('#textbook-grade').selectOption('3');
  await page.locator('#textbook-book').selectOption(bookId);
  await page.locator('#textbook-unit').selectOption('Unit 2');
  await page.locator('#library-start').tap();
  await page.waitForFunction(() => !document.querySelector('#library-dialog').open);
  assert.match(await page.locator('#theme-name').textContent(), /Unit 2/);
  assert.deepEqual(await page.locator('.word-text').allTextContents(), practiceBatches(book.entries.filter(entry => entry.unit === 'Unit 2'))[0].map(entry => entry.meaning));
  assert.deepEqual(errors, []);
  console.log(`Textbook touch flow passed: all ${catalog.books.length} publisher/grade/book/unit selections, reviewed legacy replacement, 31 new-edition words in 6 batches, one-word tail, reload, correct case, hinted-word review and cached-book offline practice.`);
} finally {
  await browser.close();
}
