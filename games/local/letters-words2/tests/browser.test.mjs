import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');

const baseURL = process.env.GAME_URL || 'http://127.0.0.1:4175';
const entries = [
  { word: 'apple', meaning: '苹果' },
  { word: "can't", meaning: '不能' },
  { word: 'ice-cream', meaning: '冰淇淋' },
  { word: 'tea', meaning: '茶' },
];

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' }),
  headless: true,
});
try {
  for (const viewport of [{ width: 1280, height: 960 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600, reducedMotion: viewport.width < 600 ? 'no-preference' : 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(message.location().url)) errors.push(message.text());
    });
    page.on('requestfailed', request => {
      if (!/fonts\.(googleapis|gstatic)\.com/.test(request.url())) errors.push(`${request.url()}: ${request.failure()?.errorText}`);
    });
    page.setDefaultTimeout(7000);

    const tileCount = () => page.locator('.tile').count();
    const filledCount = () => page.locator('.answer-slot.filled').count();
    const tileSnapshot = () => page.locator('.tile').evaluateAll(tiles => tiles.map(tile => ({
      id: tile.dataset.tileId, char: tile.dataset.char,
      blocked: tile.getAttribute('aria-disabled') === 'true',
      selected: tile.getAttribute('aria-pressed') === 'true', z: Number(tile.style.zIndex),
      left: tile.style.left, top: tile.style.top,
    })));
    const clickTile = id => {
      const tile = page.locator(`[data-tile-id="${id}"]`);
      return viewport.width < 600 ? tile.tap() : tile.click();
    };
    const activeWord = async () => entries[Number((await page.locator('.word-row.active').getAttribute('data-word-id')).slice(5))].word;
    const importWords = async text => {
      await page.locator('#import-button').click();
      await page.locator('#word-input').fill(text);
      await page.locator('#import-form button[type="submit"]').click();
    };
    const assertLayout = async () => {
      const sizes = await page.evaluate(() => {
        const board = document.querySelector('#board').getBoundingClientRect();
        return {
          viewport: innerWidth, page: document.documentElement.scrollWidth,
          outsideTiles: [...document.querySelectorAll('.tile')].filter(tile => {
            const rect = tile.getBoundingClientRect();
            return rect.left < board.left - 1 || rect.top < board.top - 1 || rect.right > board.right + 1 || rect.bottom > board.bottom + 1;
          }).length,
          overflow: [...document.querySelectorAll('#answer-slots, #word-list, dialog[open]')]
            .filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.id || element.className),
          clippedMeaning: document.querySelector('#current-meaning').scrollWidth > document.querySelector('#current-meaning').clientWidth + 1,
        };
      });
      assert.ok(sizes.page <= sizes.viewport + 1, `page overflows: ${JSON.stringify(sizes)}`);
      assert.equal(sizes.outsideTiles, 0, 'all cards stay in the board');
      assert.deepEqual(sizes.overflow, [], 'answer, meaning, words and open dialog fit');
      assert.equal(sizes.clippedMeaning, false, 'meaning text is not clipped');
    };

    await page.goto(baseURL, { waitUntil: 'networkidle' });
    assert.match(await page.title(), /词屿/);
    assert.equal(await page.locator('.word-row').count(), 6);
    assert.ok(await tileCount() > 0);
    await assertLayout();
    await page.locator('#help-button').click();
    assert.equal(await page.locator('#help-dialog').evaluate(dialog => dialog.open), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#help-dialog').evaluate(dialog => dialog.open), false);
    await page.locator('#sound-button').click();
    assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'), 'true');
    await page.locator('#sound-button').click();

    const original = await tileSnapshot();
    await importWords('apple 苹果\napple 重复');
    assert.equal(await page.locator('#import-dialog').evaluate(dialog => dialog.open), true);
    assert.match(await page.locator('#import-error').textContent(), /重复/);
    assert.deepEqual(await tileSnapshot(), original, 'invalid input preserves the ongoing board');
    await page.locator('#word-input').fill(entries.map(entry => `${entry.word} ${entry.meaning}`).join('\n'));
    await page.locator('#import-form button[type="submit"]').click();
    assert.equal(await page.locator('#import-dialog').evaluate(dialog => dialog.open), false);
    assert.equal(await tileCount(), entries.reduce((count, entry) => count + entry.word.length, 0));
    assert.equal((await tileSnapshot()).map(tile => tile.char).sort().join(''), entries.map(entry => entry.word).join('').split('').sort().join(''));
    await assertLayout();

    // Click an actually exposed corner of a blocked card, through the browser's real pointer path.
    await page.locator('#board').scrollIntoViewIfNeeded();
    const blockedPoint = await page.evaluate(() => {
      for (const tile of document.querySelectorAll('.tile[aria-disabled="true"]')) {
        const rect = tile.getBoundingClientRect();
        for (let y = rect.top + 2; y < rect.bottom - 2; y += 2) {
          for (let x = rect.left + 2; x < rect.right - 2; x += 2) {
            if (document.elementFromPoint(x, y)?.closest('.tile') === tile) return { x, y, id: tile.dataset.tileId };
          }
        }
      }
      return null;
    });
    assert.ok(blockedPoint, 'board includes an exposed part of a blocked card');
    const initialCount = await tileCount();
    await page.mouse.click(blockedPoint.x, blockedPoint.y);
    assert.equal(await filledCount(), 0, 'a partially visible blocked card cannot be selected');
    assert.equal(await tileCount(), initialCount);
    assert.match(await page.locator('#feedback').textContent(), /被压住/);

    const target = await activeWord();
    const available = (await tileSnapshot()).filter(tile => !tile.blocked).sort((a, b) => b.z - a.z);
    const wrong = available.slice(0, target.length);
    if (wrong.map(tile => tile.char).join('') === target) {
      const different = wrong.findIndex(tile => tile.char !== wrong[0].char);
      assert.ok(different > 0);
      [wrong[0], wrong[different]] = [wrong[different], wrong[0]];
    }
    assert.equal(wrong.length, target.length);
    for (const tile of wrong) await clickTile(tile.id);
    assert.equal(await tileCount(), initialCount, 'wrong complete spelling removes no card');
    assert.equal(await filledCount(), target.length);
    assert.match(await page.locator('#feedback').textContent(), /还不是这个单词/);
    await page.locator('#clear-button').click();
    assert.equal(await filledCount(), 0);

    const beforePartial = await tileSnapshot();
    await clickTile(available[0].id);
    await clickTile(available[1].id);
    assert.equal(await tileCount(), initialCount, 'partial selection remains on the board');
    assert.deepEqual((await tileSnapshot()).map(({ selected, ...tile }) => tile), beforePartial.map(({ selected, ...tile }) => tile), 'partial selection preserves positions and blocking');
    await page.locator('#undo-button').click();
    assert.equal(await filledCount(), 1);
    await page.locator('#clear-button').click();
    assert.equal(await filledCount(), 0);
    await clickTile(available[0].id);
    await page.locator('.word-row:not(.active):not(.done)').first().click();
    assert.equal(await filledCount(), 0, 'meaning switch rolls partial selection back');
    assert.equal(await tileCount(), initialCount);

    let solved = 0;
    let shuffles = 0;
    while (solved < entries.length) {
      const rows = await page.locator('.word-row:not(.done)').evaluateAll(items => items.map(row => ({ id: row.dataset.wordId })));
      let tiles = (await tileSnapshot()).filter(tile => !tile.blocked).sort((a, b) => b.z - a.z);
      const canSpell = word => {
        const pool = tiles.map(tile => tile.char);
        return [...word].every(char => {
          const index = pool.indexOf(char);
          if (index < 0) return false;
          pool.splice(index, 1);
          return true;
        });
      };
      const row = rows.find(row => canSpell(entries[Number(row.id.slice(5))].word));
      if (!row) {
        assert.ok(shuffles++ < 8, 'shuffle provides a route forward');
        const beforeShuffle = await tileCount();
        await page.locator('#shuffle-button').click();
        assert.equal(await tileCount(), beforeShuffle);
        assert.equal(await page.locator('.word-row.done').count(), solved);
        continue;
      }
      await page.locator(`[data-word-id="${row.id}"]`).click();
      const word = entries[Number(row.id.slice(5))].word;
      const beforeWord = await tileCount();
      await page.locator('#hint-button').click();
      assert.equal(await page.locator('.tile.is-hinted').count(), 1);
      assert.equal(await page.locator('.tile.is-hinted').getAttribute('data-char'), word[0]);
      await page.locator('.tile.is-hinted').click();
      for (const char of word.slice(1)) {
        tiles = (await tileSnapshot()).filter(tile => !tile.blocked && !tile.selected && tile.char === char).sort((a, b) => b.z - a.z);
        assert.ok(tiles.length, `available letter ${char} for ${word}`);
        await clickTile(tiles[0].id);
      }
      solved++;
      await page.waitForFunction(count => document.querySelectorAll('.word-row.done').length === count, solved);
      assert.equal(await tileCount(), beforeWord - word.length);
      assert.equal(await page.locator('#completed-count').textContent(), String(solved));
      if (solved < entries.length) {
        // Exercise a midgame shuffle and verify that already consumed words stay consumed.
        const beforeShuffle = await tileCount();
        await page.locator('#shuffle-button').click();
        assert.equal(await tileCount(), beforeShuffle);
        assert.equal(await page.locator('.word-row.done').count(), solved);
      }
    }
    assert.equal(await tileCount(), 0);
    assert.equal(await page.locator('#win-dialog').evaluate(dialog => dialog.open), true);
    assert.equal(await page.locator('#win-words span').count(), entries.length);
    await assertLayout();
    await page.locator('#play-again-button').click();
    assert.equal(await page.locator('#win-dialog').evaluate(dialog => dialog.open), false);
    assert.equal(await page.locator('.word-row').count(), 6);
    assert.equal(await page.locator('.word-row.done').count(), 0);
    assert.ok(await tileCount() > 0);
    const theme = await page.locator('#theme-name').textContent();
    await page.locator('#new-button').click();
    assert.notEqual(await page.locator('#theme-name').textContent(), theme);

    await importWords('abcdefghijklmnop 十六个字符的测试单词\ntea 茶');
    await page.locator('[data-word-id="word-0"]').click();
    assert.equal(await page.locator('.answer-slot').count(), 16);
    await assertLayout();
    assert.deepEqual(errors, [], `no runtime or local network errors at ${viewport.width}px`);
    console.log(`Browser ${viewport.width}×${viewport.height}: blocked click, wrong spelling, undo/clear/switch, hint, punctuation/repetition, full clear/replay, import validation and layout passed.`);
    await context.close();
  }
} finally {
  await browser.close();
}
