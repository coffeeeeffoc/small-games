import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const moduleName = process.env.PLAYWRIGHT_MODULE || '@playwright/test';
const { chromium } = await import(isAbsolute(moduleName) ? pathToFileURL(moduleName).href : moduleName);
const url = process.env.GAME_URL || 'http://127.0.0.1:4186';
const artifacts = fileURLToPath(new URL('./artifacts/', import.meta.url));
await mkdir(artifacts, { recursive: true });
const entries = [
  ['apple', '苹果'], ['pear', '梨'], ["let's", '让我们'],
  ['t-shirt', 'T恤'], ['ice cream', '冰淇淋'],
];
const corpus = entries.map((entry) => entry.join(' ')).join('\n');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });

try {
  for (const mobile of [false, true]) {
    const name = mobile ? 'mobile' : 'desktop';
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const activate = (locator) => mobile ? locator.tap() : locator.click();
    const tile = (char) => page.locator(`button[data-char=${JSON.stringify(char)}]`);
    const draft = () => page.locator('#answer .filled').allTextContents();
    const stocks = () => page.locator('#board button').evaluateAll((nodes) =>
      Object.fromEntries(nodes.map((node) => [node.dataset.char, Number(node.dataset.stock)])));
    const noOverflow = async () => assert.ok(await page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth), `${name}: horizontal overflow`);
    const submit = async (text) => {
      await page.locator('#words-input').fill(text);
      await activate(page.locator('#words-form button[type="submit"]'));
    };

    try {
      await page.goto(url);
      await page.locator('#board button').first().waitFor();
      assert.equal(await page.title(), '词了个词 · 单词消消乐');
      assert.equal(await page.locator('.word-item').count(), 6);
      await noOverflow();
      await activate(page.locator('#edit-words'));
      await submit(corpus);
      await page.locator('#words-dialog').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#meaning').textContent(), '苹果');
      assert.equal(await page.locator('.word-item').count(), entries.length);
      const original = await stocks();
      assert.equal(original.p, 3);
      assert.equal(Object.values(original).reduce((sum, count) => sum + count, 0), 29);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true });
      await noOverflow();

      // Repeated taps reserve stock; undo and clear must return every tile.
      await activate(tile('p'));
      await activate(tile('p'));
      assert.deepEqual(await draft(), ['p', 'p']);
      assert.equal(await tile('p').getAttribute('data-count'), '1');
      assert.deepEqual(await stocks(), original);
      await activate(page.locator('#undo-button'));
      assert.equal(await tile('p').getAttribute('data-count'), '2');
      await activate(page.locator('#clear-button'));
      assert.equal(await tile('p').getAttribute('data-count'), '3');
      assert.deepEqual(await draft(), []);

      // Wrong full answers never consume inventory; hints repair a wrong prefix.
      for (const char of 'elppa') await activate(tile(char));
      assert.equal(await page.locator('#challenge.is-incorrect').count(), 1);
      assert.deepEqual(await stocks(), original);
      assert.equal(await draft().then((value) => value.join('')), 'elppa');
      await activate(page.locator('#hint-button'));
      assert.deepEqual(await draft(), []);
      assert.equal(await tile('a').evaluate((node) => node.classList.contains('hinted')), true);
      assert.deepEqual(await stocks(), original);
      await activate(tile('a'));
      await activate(page.locator('.word-item[data-index="1"]'));
      assert.equal(await page.locator('#meaning').textContent(), '梨');
      assert.deepEqual(await draft(), []);
      assert.deepEqual(await stocks(), original);
      assert.equal(await tile('a').getAttribute('data-count'), String(original.a));
      await activate(page.locator('.word-item[data-index="0"]'));

      if (!mobile) {
        await page.keyboard.press('a');
        assert.deepEqual(await draft(), ['a']);
        await page.keyboard.press('Backspace');
        assert.deepEqual(await draft(), []);
        await page.keyboard.press('e');
        await page.keyboard.press('Escape');
        assert.deepEqual(await draft(), []);
        assert.deepEqual(await stocks(), original);
      }

      // Invalid edits leave the current round intact and cannot create HTML nodes.
      await activate(page.locator('#edit-words'));
      for (const invalid of ['', ', 苹果', 'apple 苹果\napple 苹果', '<img src=x onerror=alert(1)> 苹果']) {
        await submit(invalid);
        assert.equal(await page.locator('#words-dialog').isVisible(), true);
        assert.ok((await page.locator('#words-error').textContent()).trim());
        assert.equal(await page.locator('#meaning').textContent(), '苹果');
        assert.deepEqual(await stocks(), original);
        assert.equal(await page.locator('#word-list img, #words-dialog img').count(), 0);
      }
      await noOverflow();
      await activate(page.locator('#words-dialog .close-dialog'));

      const expected = { ...original };
      for (const [index, [word, meaning]] of entries.entries()) {
        assert.equal(await page.locator('#meaning').textContent(), meaning);
        if (word.includes(' ')) assert.equal(await page.locator('.answer-space').count(), 1);
        for (const char of word.replaceAll(' ', '')) {
          await activate(tile(char));
          expected[char]--;
        }
        await page.waitForFunction((count) => Number(document.querySelector('#progress').value) === count, index + 1);
        assert.deepEqual(await stocks(), expected);
        if (index < entries.length - 1) {
          await page.waitForFunction((next) => document.querySelector('#meaning').textContent === next, entries[index + 1][1]);
        } else {
          await page.locator('#win-dialog').waitFor({ state: 'visible' });
        }
      }
      assert.equal(await page.locator('#board button').count(), 0);
      assert.equal(await page.locator('.word-item.completed').count(), entries.length);
      assert.equal(await page.locator('#board .empty-board').count(), 1);
      assert.ok((await page.locator('#board-summary').textContent()).includes('还剩 0 块'));
      await noOverflow();
      await page.screenshot({ path: `${artifacts}/${name}-win.png`, fullPage: true });
      await activate(page.locator('#play-again'));
      assert.equal(await page.locator('#win-dialog').isVisible(), false);
      assert.equal(await page.locator('.word-item').count(), 6);
      assert.equal(await page.locator('#progress').getAttribute('value'), '0');
      assert.ok(await page.locator('#board button').count() > 0);
      assert.deepEqual(await draft(), []);
      await noOverflow();

      // Commas belong to meanings; periods are playable and curly apostrophes normalize.
      await activate(page.locator('#edit-words'));
      await submit('a.m. 上午,早上\nlet’s 让我们');
      await page.locator('#words-dialog').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#meaning').textContent(), '上午,早上');
      assert.equal(await tile('.').getAttribute('data-stock'), '2');
      for (const char of 'a.m.') {
        if (mobile) await activate(tile(char));
        else await page.keyboard.press(char);
      }
      await page.waitForFunction(() => document.querySelector('#meaning').textContent === '让我们');
      assert.equal(await tile("'").getAttribute('data-stock'), '1');
      for (const char of "let's") await activate(tile(char));
      await page.locator('#win-dialog').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#board button').count(), 0);

      // Reopening the editor must preserve English abbreviations in the meaning.
      await activate(page.locator('#play-again'));
      await activate(page.locator('#edit-words'));
      await submit('apple, n. 苹果');
      await page.locator('#words-dialog').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#meaning').textContent(), 'n. 苹果');
      await activate(page.locator('#edit-words'));
      await activate(page.locator('#words-form button[type="submit"]'));
      await page.locator('#words-dialog').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#meaning').textContent(), 'n. 苹果');
      assert.equal(await page.locator('#answer .answer-slot').count(), 5);
      assert.equal(await tile('n').count(), 0);
      for (const char of 'apple') await activate(tile(char));
      await page.locator('#win-dialog').waitFor({ state: 'visible' });
      assert.deepEqual(errors, [], `${name}: page errors`);
      console.log(`${name}: import, inventory, undo/clear, wrong answer, hint, switching, validation, full round, restart, layout, punctuation, editor round-trip passed`);
    } catch (error) {
      await page.screenshot({ path: `${artifacts}/${name}-failure.png`, fullPage: true }).catch(() => {});
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
