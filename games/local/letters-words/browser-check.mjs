import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(isAbsolute(moduleName) ? pathToFileURL(moduleName).href : moduleName);
const url = process.env.GAME_URL || 'http://127.0.0.1:4186';
const artifacts = fileURLToPath(new URL('./artifacts/', import.meta.url));
await mkdir(artifacts, { recursive: true });
const entries = [
  ['apple', '苹果'], ["can't", '不能'], ['ice cream', '冰淇淋'], ['a.m.', '上午'],
];
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });

try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }, { width: 844, height: 390 }]) {
    const mobile = viewport.width !== 1440;
    const name = `${viewport.width}x${viewport.height}`;
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/books/')) requests.push(request.url().split('/').at(-1)); });
    const activate = locator => mobile ? locator.tap() : locator.click();
    const draft = () => page.locator('#answer .filled').allTextContents();
    const tile = char => page.locator(`#board button[data-char=${JSON.stringify(char)}]:not(:disabled):not([hidden]):not([aria-pressed="true"])`).first();
    const noOverflow = async () => {
      const overflow = await page.evaluate(() => {
        const elements = [document.documentElement, ...document.querySelectorAll('dialog[open], .play-card, .word-item, .practice-bar, .loaded-book')];
        return elements.filter(node => node.scrollWidth > node.clientWidth + 2).map(node => `${node.tagName}.${node.className}`);
      });
      assert.deepEqual(overflow, [], `${name}: overflow`);
    };
    const custom = async list => {
      await activate(page.locator('#edit-words'));
      await page.locator('#words-input').fill(list.map(row => row.join('\t')).join('\n'));
      await activate(page.locator('#words-form button[type="submit"]'));
      await page.locator('#words-dialog').waitFor({ state: 'hidden' });
    };
    const solve = async (list, ordered, overlap, inPracticeOrder = false) => {
      let done = 0;
      while (done < list.length) {
        let word, meaning, index;
        if (ordered) {
          meaning = await page.locator('#meaning').textContent();
          const entry = inPracticeOrder ? list[done] : list.find(row => row[1] === meaning);
          assert.equal(entry?.[1].replace(/\s+/g, ' ').trim(), meaning.replace(/\s+/g, ' ').trim());
          [word] = entry || [];
          assert.ok(word, `known meaning ${meaning}`);
        } else {
          const visible = await page.locator('#board button:not(:disabled):not([hidden]):not([aria-pressed="true"])').evaluateAll(nodes =>
            nodes.flatMap(node => Array(Number(node.dataset.count || 1)).fill(node.dataset.char)));
          const clues = await page.locator('.word-item').evaluateAll(nodes => nodes.map(node => ({ meaning: node.querySelector('.word-copy > span').textContent, index: Number(node.dataset.index) })));
          const candidate = clues.find(clue => {
            const spelling = list.find(row => row[1] === clue.meaning)[0].replaceAll(' ', '');
            const pool = [...visible];
            return [...spelling].every(char => { const i = pool.indexOf(char); if (i < 0) return false; pool.splice(i, 1); return true; });
          });
          if (!candidate) { assert.ok(overlap); await activate(page.locator('#shuffle-button')); continue; }
          ({ meaning, index } = candidate);
          [word] = list.find(row => row[1] === meaning);
        }
        for (const char of word.replaceAll(' ', '')) await activate(tile(char));
        if (!ordered) await activate(page.locator(`.word-item[data-index="${index}"]`));
        await page.locator('#challenge.is-correct').waitFor();
        done++;
        assert.equal(await page.locator('#progress').getAttribute('max'), String(list.length));
        assert.equal(await page.locator('#progress').getAttribute('value'), String(done), 'total progress continues across batches');
        await page.waitForFunction(() => !document.querySelector('#challenge').classList.contains('is-correct'));
      }
      await page.locator('#win-dialog').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#win-stats strong').first().textContent(), String(list.length));
      assert.equal(await page.locator('#board button').count(), 0);
    };
    try {
      await page.goto(url);
      assert.equal(await page.title(), '词了个词 · 单词消消乐');
      await page.locator('#board button').first().waitFor();
      assert.deepEqual(requests, [], 'no vocabulary books are prefetched');
      await activate(page.locator('#sound-button'));
      assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'), 'false');
      for (const overlap of [false, true]) for (const ordered of [true, false]) {
        await page.locator('#overlap-mode').setChecked(overlap);
        await page.locator('#ordered-mode').setChecked(ordered);
        await custom(entries);
        await noOverflow();
        assert.equal(await page.locator('#board.overlap-board').count(), Number(overlap));
        if (ordered) {
          const meaning = await page.locator('#meaning').textContent();
          const [word] = entries.find(row => row[1] === meaning);
          const wrong = [...word.replaceAll(' ', '')].reverse();
          for (const char of wrong) await activate(tile(char));
          assert.deepEqual(await draft(), wrong);
          assert.equal(await page.locator('#challenge.is-incorrect').count(), 1);
          await activate(page.locator('#hint-button'));
          assert.deepEqual(await draft(), []);
        } else {
          assert.equal(await page.locator('#answer .empty').count(), 0);
          assert.equal(await page.locator('#hint-button').isVisible(), false);
          const first = page.locator('#board button:not(:disabled):not([hidden])').first();
          const char = await first.getAttribute('data-char');
          await activate(first);
          await activate(page.locator('.word-item').first());
          assert.deepEqual(await draft(), [char]);
          assert.equal(await page.locator('#challenge.is-incorrect').count(), 1);
          await activate(page.locator('#answer .filled').first());
          assert.deepEqual(await draft(), []);
          if (overlap) await activate(page.locator('#shuffle-button'));
        }
        // Clicking a middle selected letter returns only that letter.
        const chars = await page.locator('#board button:not(:disabled):not([hidden])').evaluateAll(nodes => nodes.flatMap(node => Array(Number(node.dataset.count || 1)).fill(node.dataset.char)).slice(0, 3));
        for (const char of chars) await activate(tile(char));
        await activate(page.locator('#answer .filled').nth(1));
        assert.deepEqual(await draft(), [chars[0], chars[2]]);
        await activate(page.locator('#clear-button'));
        assert.deepEqual(await draft(), []);
        if (overlap) {
          assert.ok(await page.locator('#board .blocked').count() > 0);
          await activate(page.locator('#shuffle-button'));
        }
        await noOverflow();
        if (!ordered && overlap) await page.screenshot({ path: `${artifacts}/${name}-overlap.png`, fullPage: true });
        await solve(entries, ordered, overlap);
        await noOverflow();
        await activate(page.locator('#play-again'));
        assert.equal(await page.locator('.word-item').count(), 4, 'replay retains selected vocabulary');
      }
      // Real downloads: only the chosen publisher and grade, retry without re-fetching saved books.
      await page.locator('#ordered-mode').check();
      await activate(page.locator('#open-library'));
      await page.locator('#download-publisher option').first().waitFor({ state: 'attached' });
      await page.locator('#download-publisher').selectOption('pep');
      await page.locator('#download-all-grades').uncheck();
      assert.equal(await page.locator('#download-button').isDisabled(), true);
      await page.locator('input[data-download-grade="7"]').check();
      await page.locator('input[data-download-grade="8"]').check();
      assert.equal(await page.locator('#download-all-grades').evaluate(node => node.indeterminate), true);
      assert.equal(await page.locator('#download-books li').count(), 4);
      if (!mobile) await page.route('**/books/PEPChuZhong7_2.json', route => route.fulfill({ status: 503, body: 'temporary failure' }), { times: 1 });
      await activate(page.locator('#download-button'));
      if (!mobile) {
        await page.waitForFunction(() => document.querySelector('#library-status').textContent.includes('503'));
        assert.equal(await page.locator('.loaded-book').count(), 1);
        await page.waitForFunction(() => !document.querySelector('#download-button').disabled);
        await activate(page.locator('#download-button'));
      }
      await page.waitForFunction(() => document.querySelector('#library-status').textContent.includes('下载完成'));
      assert.deepEqual([...new Set(requests)].sort(), ['PEPChuZhong7_1.json', 'PEPChuZhong7_2.json', 'PEPChuZhong8_1.json', 'PEPChuZhong8_2.json']);
      assert.equal(requests.filter(name => name === 'PEPChuZhong7_1.json').length, 1);
      assert.equal(await page.locator('.loaded-book').count(), 4);
      assert.equal(await page.locator('input[data-practice-grade]').count(), 2);
      assert.ok((await page.locator('#loaded-books').textContent()).includes('暂缺单元标注'));
      await page.locator('input[data-practice-grade="7"]').check();
      assert.equal(await page.locator('.loaded-book input:checked').count(), 2);
      assert.equal(await page.locator('input[data-practice-grade="8"]').isChecked(), false);
      await page.locator('input[data-book-id="PEPChuZhong7_2"]').uncheck();
      assert.equal(await page.locator('input[data-practice-grade="7"]').evaluate(node => node.indeterminate), true);
      // Switching publishers removes hidden selections and never lists the other publisher's loaded books.
      await page.locator('#download-publisher').selectOption('fltrp');
      assert.equal(await page.locator('#practice-publisher').count(), 0);
      assert.equal(await page.locator('.loaded-book').count(), 0);
      assert.equal(await page.locator('#start-practice').isDisabled(), true);
      await page.locator('#download-all-grades').uncheck();
      await page.locator('input[data-download-grade="7"]').check();
      await activate(page.locator('#download-button'));
      await page.waitForFunction(() => document.querySelector('#library-status').textContent.includes('下载完成'));
      assert.deepEqual(await page.locator('.loaded-book input').evaluateAll(nodes => nodes.map(node => node.dataset.bookId)), ['WaiYanSheChuZhong_1', 'WaiYanSheChuZhong_2']);
      await page.locator('input[data-practice-grade="7"]').check();
      await page.locator('#download-publisher').selectOption('pep');
      assert.equal(await page.locator('.loaded-book').count(), 4);
      assert.equal(await page.locator('.loaded-book input:checked').count(), 0);
      await page.locator('#download-all-grades').uncheck();
      await page.locator('input[data-download-grade="7"]').check();
      await page.locator('input[data-download-grade="8"]').check();
      await page.locator('input[data-practice-grade="7"]').check();
      await page.locator('input[data-book-id="PEPChuZhong7_2"]').uncheck();
      await noOverflow();
      await page.screenshot({ path: `${artifacts}/${name}-library.png`, fullPage: true });
      const source = await page.request.get(`${url}/assets/english-dict/books/PEPChuZhong7_1.json`).then(r => r.json());
      const distinct = new Set(source.entries.map(entry => entry.word.toLowerCase())).size;
      assert.equal(await page.locator('#practice-random').isChecked(), true);
      assert.ok((await page.locator('#start-practice').textContent()).includes('10'));
      assert.equal(await page.locator('#practice-count').getAttribute('inputmode'), 'numeric');
      for (const invalid of ['', '0', '-1', '1.5', String(distinct + 1)]) {
        await page.locator('#practice-count').fill(invalid);
        assert.equal(await page.locator('#start-practice').isDisabled(), true);
        assert.equal(await page.locator('#practice-size-error').isVisible(), true);
      }
      await page.locator('#practice-count').fill('7');
      assert.equal(await page.locator('#start-practice').isDisabled(), false);
      assert.ok((await page.locator('#practice-summary').textContent()).includes('本次随机 7 个'));
      if (viewport.width <= 600) {
        assert.ok(await page.locator('#practice-count').evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize) >= 16));
        assert.ok((await page.locator('#start-practice').boundingBox()).height >= 44);
        assert.ok((await page.locator('#library-dialog').boundingBox()).width >= viewport.width - 2);
      }
      await noOverflow();
      await page.locator('#start-practice').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${artifacts}/${name}-practice-size.png` });
      await activate(page.locator('#start-practice'));
      assert.ok((await page.locator('#practice-progress').textContent()).includes('0/7'));
      const beforeRestart = await page.locator('.word-item .word-copy > span').allTextContents();
      await activate(page.locator('#new-game'));
      assert.ok((await page.locator('#practice-progress').textContent()).includes('0/7'));
      assert.notDeepEqual(await page.locator('.word-item .word-copy > span').allTextContents(), beforeRestart, 'restart draws from the whole selected book');
      await activate(page.locator('#edit-words'));
      const sampled = (await page.locator('#words-input').inputValue()).split('\n').map(line => line.split('\t'));
      assert.equal(sampled.length, 7);
      assert.equal(new Set(sampled.map(([word]) => word)).size, 7);
      await activate(page.locator('#words-dialog .close-dialog'));
      await solve(sampled, true, true, true);
      await activate(page.locator('#play-again'));
      assert.ok((await page.locator('#practice-progress').textContent()).includes('0/7'));
      await activate(page.locator('#open-library'));
      await page.locator('#practice-count').fill('');
      await activate(page.locator('#practice-all'));
      assert.equal(await page.locator('#practice-count').isVisible(), false);
      assert.equal(await page.locator('#practice-size-error').isVisible(), false);
      assert.ok((await page.locator('#practice-summary').textContent()).includes(`本次随机全部 ${distinct} 个`));
      await activate(page.locator('#start-practice'));
      assert.ok((await page.locator('#practice-progress').textContent()).includes(`0/${distinct}`));
      assert.ok((await page.locator('#practice-progress').textContent()).includes('第 1/'));
      assert.ok((await page.locator('#practice-progress').textContent()).includes('拼完自动继续下一批'));
      assert.equal(await page.locator('#word-list-title').textContent(), '本批词单');
      assert.equal((await page.locator('#progress-count').textContent()).replace(/\s/g, ''), `0/${distinct}`);
      assert.equal(await page.locator('#progress').getAttribute('max'), String(distinct));
      assert.ok(await page.locator('.word-item').count() <= 6, 'only the current batch is shown');
      await noOverflow();
      // A fresh page can reuse downloaded books and cached metadata even if catalog requests fail.
      await page.reload();
      await page.route('**/assets/english-dict/catalog.json', route => route.fulfill({ status: 503, body: '' }));
      await page.route('**/assets/english-dict/publishers.json', route => route.fulfill({ status: 503, body: '' }));
      await activate(page.locator('#open-library'));
      await page.waitForFunction(() => document.querySelectorAll('.loaded-book').length === 4);
      assert.equal(await page.locator('#download-publisher').inputValue(), 'pep');
      assert.deepEqual(await page.locator('#download-grade-options input:checked').evaluateAll(nodes => nodes.map(node => node.value)), ['7', '8']);
      assert.ok((await page.locator('#library-status').textContent()).includes('已保存的目录'));
      await activate(page.locator('#select-loaded'));
      assert.equal(await page.locator('.loaded-book input:checked').count(), 4);
      assert.equal(await page.locator('input[data-practice-grade]:checked').count(), 2);
      await activate(page.locator('#clear-loaded-selection'));
      assert.equal(await page.locator('#start-practice').isDisabled(), true);
      await activate(page.locator('.loaded-book .text-button').first());
      await page.waitForFunction(() => document.querySelectorAll('.loaded-book').length === 3);
      assert.ok((await page.locator('.practice-grade').first().textContent()).includes('已加载 1/2 本'));
      await activate(page.locator('#library-dialog .close-dialog'));
      // Entire selected corpus continues across batches, not just the first random six.
      await page.locator('#ordered-mode').check();
      await page.locator('#overlap-mode').uncheck();
      const batchEntries = [...'abcdefgh'].map((word, i) => [word, `测试词${i + 1}`]);
      await custom(batchEntries);
      await solve(batchEntries, true, false);
      assert.ok((await page.locator('#practice-progress').textContent()).includes('8/8'));
      await activate(page.locator('#play-again'));
      await activate(page.locator('#edit-words'));
      for (const invalid of ['', 'apple 苹果\napple 苹果', '<img src=x onerror=alert(1)> 苹果']) {
        await page.locator('#words-input').fill(invalid);
        await activate(page.locator('#words-form button[type="submit"]'));
        assert.equal(await page.locator('#words-dialog').isVisible(), true);
        assert.ok((await page.locator('#words-error').textContent()).trim());
        assert.equal(await page.locator('#words-dialog img').count(), 0);
      }
      await noOverflow();
      assert.deepEqual(errors, []);
      console.log(`${name}: four modes, wrong answers, arbitrary undo, full completion, download isolation/retry, persistence, deletion, full-corpus batches, layout passed`);
    } catch (error) {
      await page.screenshot({ path: `${artifacts}/${name}-failure.png`, fullPage: true }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
