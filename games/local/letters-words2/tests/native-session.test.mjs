import assert from 'node:assert/strict';
import { createNativeSession } from '../native-session.js';
import { findSpelling, getAvailableTiles, letters } from '../engine.js';
import { miniIslands, miniIsland, dailyIsland, seededRandom } from '../challenge.js';
import { practiceBatches } from '../library.js';

function setup(records = new Map()) {
  let now = 1000;
  const storage = { getItem: key => records.get(key), setItem: (key, value) => records.set(key, value) };
  return { records, storage, advance: ms => { now += ms; }, make: () => createNativeSession(storage, { now: () => now, random: seededRandom('native-session-tests') }) };
}
const clone = value => JSON.parse(JSON.stringify(value));
function finishWord(session) {
  session.clear();
  const path = findSpelling(session.state.game, session.activeWord.id);
  assert.ok(path?.length, 'real engine exposes a selectable spelling');
  const before = session.state.game.completed;
  let result;
  for (const id of path) result = session.pick(id);
  assert.equal(result.status, 'correct', 'native pick automatically checks the full spelling');
  assert.equal(session.state.game.completed, before + 1);
  return result;
}
function finish(session) { while (!session.completed) finishWord(session); }

// Native saves preserve the actual physical board and unfinished spelling, not only word count.
{
  const fixture = setup(), session = fixture.make();
  session.startTheme(2);
  finishWord(session);
  const selected = findSpelling(session.state.game, session.activeWord.id)[0];
  session.pick(selected);
  const game = clone(session.state.game);
  fixture.advance(3000);
  session.pause();
  const restored = fixture.make();
  assert.deepEqual(restored.state.game, game);
  assert.equal(restored.state.game.selected[0], selected);
  assert.equal(restored.state.elapsedMs, 3000);
  assert.equal(restored.state.paused, true);
  restored.resume(); fixture.advance(250); restored.pause(); fixture.advance(60000);
  assert.equal(restored.state.elapsedMs, 3250, 'background time never enters the learning timer');
  restored.resume(); fixture.advance(50);
  assert.equal(restored.state.elapsedMs, 3300, 'foreground resumes from the retained clock');
}

// All three mini islands have deterministic replay and cycle directly into the next playable theme.
{
  const fixture = setup(), session = fixture.make();
  session.startTheme(0);
  session.pick(findSpelling(session.state.game, session.activeWord.id)[0]);
  session.pause();
  const ordinary = fixture.records.get('ciyu-progress');
  session.startDaily('2026-10-01'); session.pause();
  const daily = fixture.records.get('ciyu-daily-v1');
  session.leaveIsland();
  for (const [index, island] of miniIslands.entries()) {
    session.startMini(island.id, true);
    const initial = clone(session.state.game);
    assert.deepEqual(session.state.game.words.map(word => ({ word: word.word, meaning: word.meaning })), miniIsland(island.id).entries);
    session.pick(findSpelling(session.state.game, session.activeWord.id)[0]);
    const partial = clone(session.state.game);
    const restored = fixture.make();
    assert.equal(restored.state.mini, island.id);
    assert.deepEqual(restored.state.game, partial, 'shared mini progress restores tile positions and current selection');
    finish(session);
    assert.equal(session.state.game.completed, 3);
    assert.equal(session.state.paused, true, 'a result freezes the timer');
    session.replay();
    assert.deepEqual(session.state.game, initial, `${island.id} replay restores the exact initial board`);
    assert.deepEqual(session.state.stats, { hints: 0, shuffles: 0, mistakes: 0 });
    session.nextMini();
    assert.equal(session.state.mini, miniIslands[(index + 1) % miniIslands.length].id);
    assert.equal(session.state.game.completed, 0);
    assert.ok(findSpelling(session.state.game, session.activeWord.id));
    assert.equal(fixture.records.get('ciyu-progress'), ordinary, 'mini actions never overwrite normal learning');
    assert.equal(fixture.records.get('ciyu-daily-v1'), daily, 'mini actions never overwrite the daily board');
    session.leaveIsland();
    assert.deepEqual(session.state.game.selected, JSON.parse(ordinary).board.selected);
    assert.equal(session.state.mini, null);
  }
}

// Daily links use the existing fixed vocabulary/seed, keep day-local statistics, and protect normal saves.
{
  const fixture = setup(), session = fixture.make();
  session.startTheme(3); session.pause();
  const ordinary = fixture.records.get('ciyu-progress');
  session.startDaily('2026-10-01', true);
  const initial = clone(session.state.game);
  assert.deepEqual(session.state.game.words.map(word => ({ word: word.word, meaning: word.meaning })), dailyIsland('2026-10-01').entries);
  assert.ok(session.hint()); session.shuffle(); finishWord(session);
  session.pause();
  const partial = clone(session.state.game), stats = clone(session.state.stats);
  const restored = fixture.make();
  assert.equal(restored.state.daily, '2026-10-01');
  assert.deepEqual(restored.state.game, partial);
  assert.deepEqual(restored.state.stats, stats);
  session.replay();
  assert.deepEqual(session.state.game, initial);
  assert.deepEqual(session.state.stats, { hints: 0, shuffles: 0, mistakes: 0 });
  session.startDaily('2026-10-02');
  assert.equal(session.state.game.completed, 0);
  assert.equal(session.state.daily, '2026-10-02');
  assert.notDeepEqual(session.state.game, initial);
  assert.equal(fixture.records.get('ciyu-progress'), ordinary);
  session.leaveIsland();
  assert.equal(session.state.daily, null);
  assert.deepEqual(session.state.game, fixture.make().state.game);
}

// Native input retains punctuation and supports extended boards without truncating long custom spellings.
{
  const fixture = setup(), session = fixture.make();
  const text = "can't 不能\nc++ 编程语言\nx=y 等式\n" + 'a'.repeat(60) + ' 很长的单词';
  session.importWords(text);
  assert.equal(session.savedCustom, text);
  assert.equal(session.state.game.tiles.length, 71);
  assert.ok(session.state.game.boardHeight > 1000, 'long words use a real extended board');
  assert.deepEqual(session.state.game.words.map(word => word.word), ["can't", 'c++', 'x=y', 'a'.repeat(60)]);
  finish(session);
  assert.equal(session.state.game.completed, 4);
  assert.equal(session.state.game.tiles.filter(tile => !tile.removed).length, 0);
  assert.equal(fixture.make().completed, true, 'custom completion survives relaunch');
}

// Full wrong spellings keep their selected cards and add the actual target to native review.
{
  const fixture = setup(), session = fixture.make();
  session.startMini('dawn', true);
  const target = session.activeWord, correct = findSpelling(session.state.game, target.id);
  const wrong = getAvailableTiles(session.state.game).find(tile => !correct.includes(tile.id) && tile.char !== letters(target.word)[0]);
  assert.ok(wrong, 'fixed mini fixture provides a genuinely incorrect leading card');
  const path = [wrong.id, ...correct.slice(1)];
  let result;
  for (const id of path) result = session.pick(id);
  assert.equal(result.status, 'incorrect');
  assert.deepEqual(session.state.game.selected, path, 'incorrect spelling can be corrected in place');
  assert.equal(session.state.game.completed, 0);
  assert.equal(session.state.stats.mistakes, 1);
  assert.equal(session.state.review[0].word, target.word);
  const hint = session.hint();
  assert.ok(hint);
  assert.deepEqual(session.state.game.selected, [], 'hint clears a prefix that cannot lead to the target spelling');
  finishWord(session);
  assert.equal(session.state.hint, null, 'correct feedback clears stale tile highlights');
}

// Textbook tail batches finish, restart from a valid first batch, and lead into real hinted-word review.
{
  const fixture = setup(), session = fixture.make();
  const entries = ['Apple', 'China', 'Monday', 'Ms', 'I', 'Book', 'Sun'].map(word => ({ word, meaning: '教材词' }));
  const batches = practiceBatches(entries);
  assert.deepEqual(batches.map(batch => batch.length), [6, 1]);
  session.startPractice({ batches, index: 0, learned: 0, name: '教材 Unit 1', review: [] });
  assert.ok(session.hint());
  const reviewWord = session.activeWord.displayWord || session.activeWord.word;
  finish(session);
  session.replay();
  assert.equal(session.state.practice.index, 1);
  assert.equal(session.state.practice.learned, 6);
  assert.equal(session.state.game.words.length, 1);
  assert.equal(session.state.review.length, 1, 'review survives moving into the final batch');
  const restored = fixture.make();
  assert.equal(restored.state.practice.index, 1);
  assert.equal(restored.state.practice.learned, 6);
  assert.equal(restored.state.review.length, 1);
  finish(session);
  assert.equal(session.startReview(), true);
  assert.equal(session.state.game.words.length, 1);
  assert.equal(session.activeWord.displayWord || session.activeWord.word, reviewWord, 'textbook capitalization survives review');
  finish(session);
  session.replay();
  assert.equal(session.state.practice.index, 0);
  assert.equal(session.state.game.words.length, 1, 'review replay stays in its actual batch');
  session.startPractice({ batches, index: 1, learned: 6, name: '教材 Unit 1', review: [] });
  finish(session); session.replay();
  assert.equal(session.state.practice.index, 0);
  assert.equal(session.state.practice.learned, 0);
  assert.equal(session.state.game.words.length, 6, 'end-of-book replay starts at the first full batch');
}

// A corrupt board falls back while retaining legitimately completed words; unavailable storage stays playable.
{
  const fixture = setup(), session = fixture.make();
  session.startTheme(0); finishWord(session); session.pause();
  const record = JSON.parse(fixture.records.get('ciyu-progress'));
  record.board.tiles[0].x = -900;
  fixture.records.set('ciyu-progress', JSON.stringify(record));
  const restored = fixture.make();
  assert.equal(restored.state.game.completed, 1);
  assert.ok(getAvailableTiles(restored.state.game).length);
  assert.ok(findSpelling(restored.state.game, restored.activeWord.id));
  const unavailable = createNativeSession({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } }, { random: seededRandom('unavailable') });
  unavailable.startMini('dawn'); finish(unavailable);
  assert.equal(unavailable.completed, true);
  assert.match(unavailable.state.storageNotice, /本次仍可继续/);
  unavailable.importWords('ice-cream 冰淇淋\nc++ 编程语言'); finish(unavailable);
  assert.equal(unavailable.state.game.tiles.length, letters('ice-cream').length + letters('c++').length);
}

console.log('Native session: real spelling wins, exact mini/daily replay, independent saves, selected-board restore, clock pause, punctuation/long words, textbook tail/review and storage fallback passed.');
