import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WORD_SETS,
  randomWords,
  parseWords,
  letters,
  createGame,
  available,
  pick,
  undo,
  clearDraft,
  checkAnswer,
  selectTarget,
  hint,
} from "./game.mjs";

test("parse a word list, preserve symbols, reject malformed or duplicate entries", () => {
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
    "a1 数字",
    "🍎 苹果",
    `${"a".repeat(21)} 过长`,
    `a ${"字".repeat(41)}`,
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

test("draft reservations, repeated letters, undo, target switching and hints conserve inventory", () => {
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
  assert.equal(selectTarget(game, 1), true);
  assert.deepEqual(game.draft, []);
  assert.equal(selectTarget(game, 2), false);
  assert.equal(selectTarget(game, -1), false);
  assert.equal(selectTarget(game, 0.5), false);
  for (const char of "chepa") assert.equal(pick(game, char), true);
  assert.equal(pick(game, "a"), false);
  assert.equal(checkAnswer(game), "incorrect");
  assert.deepEqual([...game.remaining], inventory);
  assert.deepEqual(game.draft, [..."chepa"]);
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
    for (let index = game.entries.length - 1; index >= 0; index -= 1) {
      assert.equal(selectTarget(game, index), true);
      for (const char of letters(game.entries[index].word))
        assert.equal(pick(game, char), true);
      assert.equal(checkAnswer(game), index === 0 ? "finished" : "correct");
      assert.equal(selectTarget(game, index), false);
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
