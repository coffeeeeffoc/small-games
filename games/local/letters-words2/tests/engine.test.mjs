import assert from 'node:assert/strict';
import {
  BOARD, letters, parseWordList, createGame, restoreProgress, isBlocked, getAvailableTiles,
  findSpelling, chooseWord, selectTile, submitWord, undoSelection, clearSelection, reshuffle,
} from '../engine.js';

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const entries = parseWordList("Apple 苹果\nletter,信件\ncan't，不能\nice-cream\t冰淇淋\nc++ = 编程语言");
assert.equal(entries[0].word, 'apple');
assert.equal(entries[2].word, "can't");
assert.equal(entries[4].meaning, '编程语言');
assert.deepEqual(parseWordList('x=y 等式\napple = 苹果\npear= 梨'), [
  { word: 'x=y', meaning: '等式' }, { word: 'apple', meaning: '苹果' }, { word: 'pear', meaning: '梨' },
]);
for (const bad of ['', 'apple 苹果', 'apple', 'apple 苹果\nAPPLE 苹果', '<svg> 标签\npear 梨',
  'apple English\npear 梨', `${'a'.repeat(81)} 太长\npear 梨`,
  Array.from({ length: 9 }, (_, i) => `word${i} 中文`).join('\n'),
  Array.from({ length: 6 }, (_, i) => `${'a'.repeat(15)}${i} 中文`).join('\n')]) {
  assert.throws(() => parseWordList(bad), Error);
}

const tile = { id: 'base', char: 'a', x: 0, y: 0, size: 64, z: 0, removed: false };
const touching = { ...tile, id: 'touching', x: 64, z: 1 };
assert.equal(isBlocked(tile, [tile, touching]), false, 'edge contact must remain selectable');
touching.x -= 0.000001;
assert.equal(isBlocked(tile, [tile, touching]), true, 'even a tiny overlap blocks');
const highest = { ...tile, id: 'highest', x: 80, z: 2 };
assert.equal(isBlocked(touching, [tile, touching, highest]), true);
assert.equal(isBlocked(tile, [tile, touching, highest]), true, 'a blocked tile still blocks tiles beneath it');
touching.removed = true;
assert.equal(isBlocked(tile, [tile, touching, highest]), false);

const simple = createGame(parseWordList('aa 两个字母\nba 另一组'), seeded(4));
simple.tiles.forEach((item, index) => Object.assign(item, { x: index * 80, y: 0, z: index }));
chooseWord(simple, 'word-0');
const aTiles = simple.tiles.filter(item => item.char === 'a');
const bTile = simple.tiles.find(item => item.char === 'b');
assert.equal(submitWord(simple).status, 'incomplete');
assert.equal(selectTile(simple, aTiles[0].id).status, 'selected');
assert.equal(selectTile(simple, aTiles[0].id).status, 'deselected');
selectTile(simple, bTile.id);
selectTile(simple, aTiles[0].id);
assert.equal(selectTile(simple, aTiles[1].id).status, 'full');
assert.equal(submitWord(simple).status, 'incorrect');
assert.equal(simple.tiles.filter(item => item.removed).length, 0);
assert.equal(simple.selected.length, 2, 'incorrect spelling retains selection');
undoSelection(simple);
assert.equal(simple.selected.length, 1);
clearSelection(simple);
const spelling = findSpelling(simple, 'word-0');
assert.equal(new Set(spelling).size, 2, 'repeated letters need different tiles');
spelling.forEach(id => selectTile(simple, id));
assert.equal(submitWord(simple).status, 'correct');
assert.equal(simple.completed, 1);
assert.equal(simple.tiles.filter(item => item.removed).length, 2);
assert.equal(selectTile(simple, spelling[0]).status, 'ignored');

const blockers = createGame(parseWordList('aa 两个字母\nbb 两个乙'), seeded(1));
blockers.tiles.forEach((item, index) => Object.assign(item, { x: 0, y: 0, z: index }));
chooseWord(blockers, 'word-1');
assert.equal(selectTile(blockers, blockers.tiles[0].id).status, 'blocked');
const top = blockers.tiles.at(-1);
selectTile(blockers, top.id);
assert.equal(isBlocked(blockers.tiles.at(-2), blockers.tiles), true, 'selected tiles stay on the board and block');
assert.equal(top.removed, false);
blockers.selected = [top.id, top.id];
assert.equal(submitWord(blockers).status, 'incorrect', 'submission rejects duplicate tile IDs');
blockers.selected = [blockers.tiles.at(-2).id, top.id];
assert.equal(submitWord(blockers).status, 'incorrect', 'submission rechecks all blockers');

function assertBounds(game) {
  for (const item of game.tiles.filter(item => !item.removed)) {
    assert.ok(item.x >= 0 && item.y >= 0 && item.x + item.size <= BOARD.width && item.y + item.size <= game.boardHeight);
  }
}

let reshuffles = 0;
for (let seed = 1; seed <= 160; seed++) {
  const rng = seeded(seed);
  const game = createGame(entries, rng);
  while (game.completed < game.words.length) {
    if (!findSpelling(game, game.activeWordId)) {
      reshuffle(game, rng);
      reshuffles++;
    }
    const spelling = findSpelling(game, game.activeWordId);
    assert.ok(spelling, 'reshuffle must recover a playable word');
    spelling.forEach(id => assert.equal(selectTile(game, id).status, 'selected'));
    const result = submitWord(game);
    assert.equal(result.status, 'correct');
    assert.equal(result.won, game.completed === game.words.length);
    assert.ok(result.won || findSpelling(game, game.activeWordId), 'correct spellings always leave a playable word without manual rescue');
  }
  assert.ok(game.tiles.every(tile => tile.removed));
}

for (let seed = 1; seed <= 160; seed++) {
  const rng = seeded(seed);
  const game = createGame(entries, rng);
  assertBounds(game);
  assert.deepEqual(game, createGame(entries, seeded(seed)), 'seeded layouts should reproduce');
  while (game.completed < game.words.length) {
    let candidates = game.words.filter(word => findSpelling(game, word.id));
    if (!candidates.length) {
      reshuffle(game, rng);
      reshuffles++;
      candidates = game.words.filter(word => findSpelling(game, word.id));
    }
    assert.ok(candidates.length, 'a fresh layout must have a playable word');
    const word = candidates[Math.floor(rng() * candidates.length)];
    chooseWord(game, word.id);
    // Deliberately choose arbitrary matching tiles instead of original word ownership.
    const available = getAvailableTiles(game);
    for (const char of word.word) {
      const matches = available.filter(item => item.char === char);
      const picked = matches[Math.floor(rng() * matches.length)];
      available.splice(available.indexOf(picked), 1);
      assert.equal(selectTile(game, picked.id).status, 'selected');
    }
    assert.equal(submitWord(game).status, 'correct');
    if (game.completed < game.words.length) {
      const remaining = game.tiles.filter(item => !item.removed);
      const idsAndChars = remaining.map(item => [item.id, item.char]);
      const done = game.words.filter(item => item.done).map(item => item.id);
      reshuffle(game, rng);
      assert.deepEqual(game.tiles.filter(item => !item.removed).map(item => [item.id, item.char]), idsAndChars);
      assert.ok(remaining.every(item => game.tiles.includes(item)), 'shuffle preserves tile objects');
      assert.deepEqual(game.words.filter(item => item.done).map(item => item.id), done);
      assert.equal(game.selected.length, 0);
      assert.ok(findSpelling(game, game.activeWordId));
      assertBounds(game);
    }
  }
  assert.equal(game.tiles.filter(item => !item.removed).length, 0);
  assert.equal(game.activeWordId, null);
}

const maximum = createGame(parseWordList(Array.from({ length: 5 }, (_, i) => `${'a'.repeat(15)}${i} 中文`).join('\n')), seeded(71));
assert.equal(maximum.tiles.length, 80);
assertBounds(maximum);
assert.ok(findSpelling(maximum, maximum.activeWordId));
const phrases = parseWordList("look at 看\nlet’s go 出发\nthis is a long textbook phrase 一条教材短语");
assert.equal(phrases[0].word, 'look at');
assert.equal(phrases[1].word, "let's go");
const phraseGame = createGame(phrases, seeded(9));
assert.equal(phraseGame.tiles.some(tile => tile.char === ' '), false, 'spaces are separators, punctuation remains playable');
assertBounds(phraseGame);
while (phraseGame.completed < phrases.length) {
  const word = phraseGame.words.find(word => word.id === phraseGame.activeWordId);
  const spelling = findSpelling(phraseGame, word.id);
  assert.equal(spelling.length, letters(word.word).length);
  spelling.forEach(id => selectTile(phraseGame, id));
  assert.equal(submitWord(phraseGame).status, 'correct');
}
const restored = restoreProgress(phrases, ['look at'], seeded(9));
assert.equal(restored.completed, 1);
assert.equal(restored.tiles.filter(tile => !tile.removed).length, letters(phrases[1].word + phrases[2].word).length);
assert.ok(findSpelling(restored, restored.activeWordId));
assert.throws(() => restoreProgress(phrases, ['unknown']));
assert.throws(() => restoreProgress(phrases, ['look at', 'look at']));
const single = createGame([{ word: 'letter', meaning: '信' }]);
findSpelling(single, single.activeWordId).forEach(id => selectTile(single, id));
assert.equal(submitWord(single).won, true, 'a one-word final batch can finish');
console.log(`Engine checks passed: parser, strict overlap, selection, 320 full rounds, 80-tile bounds (${reshuffles} recovery reshuffles).`);
