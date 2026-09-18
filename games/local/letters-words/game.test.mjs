import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WORD_SETS,
  randomWords,
  parseWords,
  formatWords,
  letters,
  createGame,
  available,
  pick,
  undo,
  clearDraft,
  checkAnswer,
  hint,
  removeDraft,
  isBlocked,
  reshuffle,
  canSpell,
} from "./game.mjs";

test("parse a word list, preserve symbols, reject malformed or duplicate entries", () => {
  assert.deepEqual(parseWords(formatWords([
    { word: 'apple', meaning: 'n. 苹果\n苹果树\t果实' },
    { word: 'ice cream', meaning: '冰淇淋\r\n冷饮' },
  ])), [
    { word: 'apple', meaning: 'n. 苹果 苹果树 果实' },
    { word: 'ice cream', meaning: '冰淇淋 冷饮' },
  ]);
  assert.deepEqual(
    parseWords(
      " Apple 苹果\r\n\nLET'S\t让我们\nT-shirt, 短袖\nice cream  冰淇淋\nthank you 谢谢\nbanana，香蕉",
    ),
    [
      { word: "apple", meaning: "苹果" },
      { word: "let's", meaning: "让我们" },
      { word: "t-shirt", meaning: "短袖" },
      { word: "ice cream", meaning: "冰淇淋" },
      { word: "thank you", meaning: "谢谢" },
      { word: "banana", meaning: "香蕉" },
    ],
  );
  assert.deepEqual(letters("Let's go-go"), [
    "l",
    "e",
    "t",
    "'",
    "s",
    "g",
    "o",
    "-",
    "g",
    "o",
  ]);
  assert.deepEqual(
    parseWords(
      "apple 苹果，水果\nhello 你好,您好\na.m. 上午\ndon’t 不要\nICE CREAM\t冰淇淋，冷饮",
    ),
    [
      { word: "apple", meaning: "苹果，水果" },
      { word: "hello", meaning: "你好,您好" },
      { word: "a.m.", meaning: "上午" },
      { word: "don't", meaning: "不要" },
      { word: "ice cream", meaning: "冰淇淋，冷饮" },
    ],
  );
  assert.deepEqual(letters("DON’T"), [..."don't"]);
  const symbols = createGame(parseWords("a.m. 上午\ndon’t 不要"));
  assert.equal(symbols.remaining.get("."), 2);
  for (const char of "a.m.") assert.equal(pick(symbols, char), true);
  assert.equal(checkAnswer(symbols), "correct");
  for (const char of "don't") assert.equal(pick(symbols, char), true);
  assert.equal(checkAnswer(symbols), "finished");
  assert.ok([...symbols.remaining.values()].every((count) => count === 0));
  for (const text of [
    "",
    "apple",
    "apple 苹果\nAPPLE 苹果",
    "123 只有数字",
    "🍎 苹果",
    `${"a".repeat(81)} 过长`,
    `a ${"字".repeat(513)}`,
    "a,",
  ]) {
    assert.throws(() => parseWords(text), Error, text);
  }
  assert.throws(
    () =>
      parseWords(
        Array.from(
          { length: 13 },
          (_, i) => `${String.fromCharCode(97 + i)} 释义`,
        ).join("\n"),
      ),
    /1–12/,
  );
  assert.throws(() => createGame([]), /1–12/);
  assert.throws(() => parseWords("don’t 不要\ndon't 不要"), /重复/);
});

test("draft reservations, repeated letters, undo, fixed targets and hints conserve inventory", () => {
  const game = createGame([
    { word: "apple", meaning: "苹果" },
    { word: "peach", meaning: "桃子" },
  ]);
  const inventory = [...game.remaining];
  assert.equal(game.remaining.get("p"), 3);
  assert.equal(checkAnswer(game), "incomplete");
  assert.equal(pick(game, "p"), true);
  assert.equal(pick(game, "p"), true);
  assert.equal(pick(game, "p"), true);
  assert.equal(pick(game, "p"), false);
  assert.equal(pick(game, "?"), false);
  assert.equal(available(game, "p"), 0);
  assert.equal(undo(game), true);
  assert.equal(available(game, "p"), 1);
  assert.equal(hint(game), "a");
  assert.deepEqual(game.draft, []);
  assert.equal(game.hints, 1);
  pick(game, "a");
  assert.equal(hint(game), "p");
  assert.equal(checkAnswer(game, 1), 'incorrect');
  assert.equal(game.target, 0);
  clearDraft(game);
  assert.deepEqual(game.draft, []);
  assert.equal(checkAnswer(game, 2), 'incorrect');
  assert.equal(checkAnswer(game, -1), 'incorrect');
  assert.equal(checkAnswer(game, 0.5), 'incorrect');
  for (const char of "elppa") assert.equal(pick(game, char), true);
  assert.equal(pick(game, "a"), false);
  assert.equal(checkAnswer(game), "incorrect");
  assert.deepEqual([...game.remaining], inventory);
  assert.deepEqual(game.draft, [..."elppa"]);
  clearDraft(game);
  assert.equal(undo(game), false);
  assert.equal(game.moves, 9);
});

test("every randomized word set can be solved completely, consuming exactly all letters and symbols", () => {
  for (let set = 0; set < DEFAULT_WORD_SETS.length; set += 1) {
    const entries = randomWords(() => set / DEFAULT_WORD_SETS.length);
    const game = createGame(entries);
    const total = [...game.remaining.values()].reduce(
      (sum, count) => sum + count,
      0,
    );
    entries[0].word = "mutated";
    assert.notEqual(DEFAULT_WORD_SETS[set][0].word, "mutated");
    assert.notEqual(game.entries[0].word, "mutated");
    for (let index = 0; index < game.entries.length; index += 1) {
      assert.equal(game.target, index);
      for (const char of letters(game.entries[index].word))
        assert.equal(pick(game, char), true);
      assert.equal(checkAnswer(game), index === game.entries.length - 1 ? "finished" : "correct");
      assert.ok(game.completed.has(index));
      const expected = game.entries
        .filter((_, i) => !game.completed.has(i))
        .flatMap(({ word }) => letters(word));
      assert.equal(
        [...game.remaining.values()].reduce((sum, count) => sum + count, 0),
        expected.length,
      );
      for (const [char, count] of game.remaining) {
        assert.equal(
          count,
          expected.filter((letter) => letter === char).length,
        );
      }
    }
    assert.equal(game.moves, total);
    assert.equal(game.completed.size, game.entries.length);
    assert.equal(checkAnswer(game), "finished");
    assert.equal(pick(game, "a"), false);
    assert.equal(hint(game), undefined);
    assert.deepEqual(game.draft, []);
    assert.ok([...game.remaining.values()].every((count) => count === 0));
  }
});

test('all four modes conserve inventory; free confirmation retains failures and removes any draft tile', () => {
  for (const overlap of [false, true]) for (const ordered of [false, true]) {
    for (let seed = 1; seed <= 30; seed++) {
      let state = seed;
      const rng = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
      const game = createGame(DEFAULT_WORD_SETS[seed % 4], { overlap, ordered }, rng);
      if (!ordered) {
        const tile = overlap ? game.tiles.find(tile => !isBlocked(tile, game.tiles)) : { char: game.entries[0].word[0] };
        assert.ok(pick(game, tile.char, tile.id));
        const inventory = [...game.remaining];
        assert.equal(checkAnswer(game, 0), 'incorrect');
        assert.equal(game.draft.length, 1);
        assert.deepEqual([...game.remaining], inventory);
        assert.equal(removeDraft(game, 0), true);
        assert.equal(game.selected.length, 0);
      }
      while (game.completed.size < game.entries.length) {
        const index = ordered ? game.target : game.entries.findIndex((_, i) => !game.completed.has(i) && (!overlap || canSpell(game, i)));
        assert.ok(index >= 0, 'a fresh arrangement always exposes a complete word');
        for (const char of letters(game.entries[index].word)) assert.ok(pick(game, char));
        if (game.draft.length > 1) {
          const saved = game.draft[game.draft.length - 1];
          const previous = game.draft.slice(0, -1);
          removeDraft(game, game.draft.length - 1);
          assert.deepEqual(game.draft, previous);
          assert.ok(pick(game, saved));
        }
        assert.match(checkAnswer(game, index), /^(correct|finished)$/);
        if (overlap && !ordered && game.completed.size < game.entries.length) reshuffle(game, rng);
      }
      assert.ok([...game.remaining.values()].every(n => n === 0));
      assert.ok(game.tiles.every(tile => tile.removed));
    }
  }
});

test('strict partial overlap blocks until successful removal, including selected upper tiles', () => {
  const lower = { id: 0, char: 'a', x: 0, y: 0, z: 0, size: 60, removed: false };
  const upper = { id: 1, char: 'b', x: 59, y: 59, z: 1, size: 60, removed: false };
  assert.ok(isBlocked(lower, [lower, upper]));
  upper.x = 60;
  assert.equal(isBlocked(lower, [lower, upper]), false);
  upper.x = 59;
  const game = createGame([{ word: 'a', meaning: '甲' }, { word: 'b', meaning: '乙' }], { overlap: true, ordered: false });
  game.tiles = [lower, upper];
  assert.equal(pick(game, 'a', 0), false);
  assert.ok(pick(game, 'b', 1));
  assert.equal(pick(game, 'a', 0), false);
  assert.equal(checkAnswer(game, 0), 'incorrect');
  assert.ok(isBlocked(lower, game.tiles));
  assert.equal(checkAnswer(game, 1), 'correct');
  assert.equal(isBlocked(lower, game.tiles), false);
  assert.ok(pick(game, 'a', 0));
  assert.equal(checkAnswer(game, 0), 'finished');
});
