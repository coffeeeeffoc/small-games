import assert from 'node:assert/strict';
import test from 'node:test';
import { findSpelling, isBlocked } from '../engine.js';
import { miniIslands } from '../challenge.js';
import { createLettersReplay, applyLettersReplay, lettersReplayResult } from '../replay.js';

const send = (state, command, args = [], now = 10000) => applyLettersReplay(state,
  [{ input: { command, args }, ticks: 0 }], { now, createdAt: 1000 });
function finish(state) {
  while (state.game.completed < state.game.words.length) {
    const word = state.game.words.find(word => !word.done && findSpelling(state.game, word.id));
    assert.ok(word, 'the authoritative layout remains solvable');
    send(state, 'choose', [word.id]);
    const tiles = findSpelling(state.game, word.id);
    for (const tile of tiles) send(state, 'select', [tile]);
    send(state, 'submit');
    state = JSON.parse(JSON.stringify(state));
  }
  return state;
}

test('all built-in islands finish only through legal tile selection and server time', () => {
  const levels = [...Array.from({ length: 8 }, (_, n) => ['islands', String(n)]),
    ...miniIslands.map(island => ['mini', island.id]), ['daily', '2026-10-21']];
  for (const [board, level] of levels) {
    const state = finish(createLettersReplay(board, 1234, level));
    assert.deepEqual(lettersReplayResult(state), { complete: true, eligible: true,
      score: state.game.tiles.length, secondary: 9000 });
    assert.throws(() => send(state, 'submit'));
  }
});

test('blocked cards, bogus scores, mutated words and time cannot create a verified result', () => {
  const state = createLettersReplay('islands', 19, '0');
  const tile = state.game.tiles.find(tile => isBlocked(tile, state.game.tiles));
  assert.ok(tile); send(state, 'select', [tile.id]);
  assert.deepEqual(state.game.selected, []);
  for (const [command, args] of [['score', [999999]], ['select', ['no-tile']], ['choose', ['no-word']], ['submit', [1]]])
    assert.throws(() => send(state, command, args));
  assert.throws(() => applyLettersReplay(state, [{ input: { command: 'clear', args: [], score: 9 }, ticks: 0 }]));
  assert.throws(() => applyLettersReplay(state, [{ input: { command: 'clear', args: [] }, ticks: 1 }]));
  assert.equal(lettersReplayResult(state).eligible, false);
  assert.throws(() => createLettersReplay('islands', 3, '../0'));
  assert.throws(() => createLettersReplay('daily', 3, '2026-02-30'));
  assert.throws(() => createLettersReplay('mini', 3, 'invented'));
});

test('normal hints and reshuffles remain playable but exclude public ranking', () => {
  for (const command of ['hint', 'shuffle', 'guidance']) {
    const state = createLettersReplay('mini', 19, 'dawn');
    send(state, command);
    const result = lettersReplayResult(finish(state));
    assert.equal(result.complete, true);
    assert.equal(result.eligible, false);
  }
});
