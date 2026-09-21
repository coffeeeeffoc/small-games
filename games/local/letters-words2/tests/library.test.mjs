import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { practiceBatches, validateBook } from '../library.js';
import { letters, createGame, restoreProgress, validateEntries, findSpelling, selectTile, submitWord } from '../engine.js';

const root = new URL('../assets/english-dict/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('catalog.json', root)));
let verified = 0, units = 0;
for (const book of catalog.books) {
  const bytes = await readFile(new URL(book.url, root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), book.revision, book.id);
  const data = validateBook(JSON.parse(bytes), book);
  const batches = practiceBatches(data.entries);
  assert.ok(batches.every(batch => batch.length <= 6 && batch.reduce((sum, entry) => sum + letters(entry.word).length, 0) <= 80));
  assert.equal(new Set(batches.flat().map(entry => entry.word)).size, batches.flat().length);
  for (const unit of book.units) {
    const selected = data.entries.filter(entry => entry.unit === unit);
    assert.ok(selected.length, `${book.id}/${unit} must have words`);
    const practice = practiceBatches(selected).flat();
    assert.ok(practice.every(entry => selected.some(source => source.word.toLowerCase().replace(/[’‘]/g, "'") === entry.word)), 'a unit never includes another unit');
  }
  if (book.verification) {
    verified++; units += book.units.length;
    assert.ok(['source-reviewed', 'pdf-reviewed'].includes(book.verification.status));
    assert.ok(book.verification.evidence.length);
    assert.ok(data.entries.every(entry => book.units.includes(entry.unit)), 'verified books have complete unit mapping');
    const shared = new URL(`../../../../assets/english-dict/完整素材/reviewed-units/${book.url}`, import.meta.url);
    assert.deepEqual(bytes, await readFile(shared), 'game data is an exact copy of the reviewed source');
  }
}
assert.throws(() => validateBook({ id: 'x', entries: [] }, { id: 'x', count: 1 }));
assert.throws(() => practiceBatches([]));
assert.deepEqual(practiceBatches([{ word: 'a', meaning: '一个' }, { word: 'a', meaning: '字母甲' }]), [[{ word: 'a', meaning: '一个；字母甲' }]]);
// Display the textbook's capitalization through practice, saving and review; tiles remain interchangeable.
for (const word of ['Ms', 'I', 'China', 'Monday']) {
  const batches = practiceBatches([{ word, meaning: '教材词' }]);
  const game = createGame(batches[0]);
  findSpelling(game, game.activeWordId).forEach(id => selectTile(game, id));
  assert.equal(submitWord(game).word.displayWord, word);
  const saved = JSON.parse(JSON.stringify({ entries: validateEntries(game.words), completed: [word.toLowerCase()] }));
  assert.deepEqual(saved.entries, batches[0]);
  assert.equal(restoreProgress(saved.entries, saved.completed).words[0].displayWord, word);
  assert.equal(practiceBatches(saved.entries)[0][0].displayWord, word);
}
assert.throws(() => createGame([{ word: 'china', displayWord: 'Japan', meaning: '中国' }]));
console.log(`Library checks passed: ${catalog.books.length} books, ${verified} reviewed books / ${units} units, checksums, exact source bytes, deduplication, complete bounded batches and unit isolation.`);
