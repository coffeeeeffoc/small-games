import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { matchingBooks, validateBook, practiceEntries, practiceBatches, practiceCount } from './library.mjs';
import { createGame, letters, pick, checkAnswer, canSpell } from './game.mjs';

const catalog = JSON.parse(await readFile(new URL('./assets/english-dict/catalog.json', import.meta.url)));
const downloads = [];
for (const book of catalog.books) {
  const bytes = await readFile(new URL(`./assets/english-dict/${book.url}`, import.meta.url));
  assert.equal(bytes.length, book.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), book.revision);
  downloads.push(validateBook(JSON.parse(bytes), book));
}

test('publisher and grade batches include both semesters and exclude all other publishers', () => {
  assert.equal(catalog.books.length, 22);
  assert.equal(downloads.reduce((sum, b) => sum + b.entries.length, 0), 9974);
  assert.equal(matchingBooks(catalog.books, 'pep').length, 13);
  assert.deepEqual(matchingBooks(catalog.books, 'pep', ['7']).map(b => b.id), ['PEPChuZhong7_1', 'PEPChuZhong7_2']);
  assert.deepEqual(matchingBooks(catalog.books, 'pep', ['7', '8']).map(b => b.id), ['PEPChuZhong7_1', 'PEPChuZhong7_2', 'PEPChuZhong8_1', 'PEPChuZhong8_2']);
  assert.deepEqual(matchingBooks(catalog.books, 'pep', []), []);
  assert.equal(matchingBooks(catalog.books, 'fltrp', ['7']).length, 2);
  assert.equal(matchingBooks(catalog.books, 'exam', ['']).length, 3);
  assert.deepEqual(matchingBooks(catalog.books, 'missing'), []);
  for (const book of catalog.books) {
    const source = downloads.find(saved => saved.id === book.id);
    assert.equal(book.unitCount, source.entries.filter(entry => entry.unit).length);
    assert.deepEqual(book.units, [...new Set(source.entries.map(entry => entry.unit).filter(Boolean))]);
  }
  assert.throws(() => validateBook({ id: 'bad', entries: [] }, catalog.books[0]));
});

test('loaded selections support units, books, deduplication, and reject unavailable scopes', () => {
  const fixture = [{ id: 'unit-book', entries: [
    { word: 'Apple', meaning: '苹果', unit: '第5单元' },
    { word: 'pear', meaning: '梨', unit: '第6单元' },
    { word: 'apple', meaning: '苹果', unit: '第6单元' },
  ] }];
  assert.deepEqual(practiceEntries(fixture, [{ bookId: 'unit-book', unit: '第5单元' }]), [{ word: 'apple', meaning: '苹果' }]);
  assert.equal(practiceEntries(fixture, [{ bookId: 'unit-book' }]).length, 2);
  assert.throws(() => practiceEntries(fixture, []));
  assert.throws(() => practiceEntries(fixture, [{ bookId: 'missing' }]));
  assert.throws(() => practiceEntries(fixture, [{ bookId: 'unit-book', unit: '第7单元' }]));
});

test('every exported book is fully playable in bounded random batches without omitted words', () => {
  for (const book of downloads) {
    const entries = practiceEntries(downloads, [{ bookId: book.id }]);
    const batches = practiceBatches(entries, () => 0.31);
    assert.equal(batches.flat().length, entries.length);
    assert.equal(new Set(batches.flat().map(e => e.word)).size, entries.length);
    assert.notDeepEqual(batches.flat().map(e => e.word), entries.map(e => e.word));
    for (const batch of batches) {
      assert.ok(batch.length <= 6);
      assert.ok(batch.flatMap(e => letters(e.word)).length <= 80);
      const game = createGame(batch, { overlap: true, ordered: true }, () => 0.31);
      for (let i = 0; i < batch.length; i++) {
        assert.ok(canSpell(game, game.target));
        for (const char of letters(game.entries[game.target].word)) assert.ok(pick(game, char));
        assert.match(checkAnswer(game), /^(correct|finished)$/);
      }
      assert.ok(game.tiles.every(tile => tile.removed));
    }
  }
  const all = practiceEntries(downloads, downloads.map(b => ({ bookId: b.id })));
  for (const batch of practiceBatches(all)) assert.doesNotThrow(() => createGame(batch));
});

test('random N and random all preserve the source pool and validate the requested size', () => {
  const entries = practiceEntries(downloads, [{ bookId: 'PEPChuZhong7_1' }]);
  const original = structuredClone(entries);
  for (const size of [1, 7, 10, entries.length, null]) {
    const chosen = practiceBatches(entries, () => 0.27, size).flat();
    assert.equal(chosen.length, size ?? entries.length);
    assert.equal(new Set(chosen.map(entry => entry.word)).size, chosen.length);
    assert.ok(chosen.every(entry => entries.includes(entry)));
    assert.deepEqual(entries, original);
    if (size !== null && size < entries.length) assert.notDeepEqual(chosen, entries.slice(0, size));
  }
  assert.notDeepEqual(practiceBatches(entries, () => 0.1, 10).flat(), practiceBatches(entries, () => 0.9, 10).flat());
  for (const invalid of [0, -1, 1.5, NaN, Infinity, '10', entries.length + 1]) {
    assert.throws(() => practiceCount(invalid, entries.length), /整数/);
    assert.throws(() => practiceBatches(entries, Math.random, invalid), /整数/);
  }
  assert.throws(() => practiceBatches([]), /整数/);
});
