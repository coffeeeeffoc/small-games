import assert from 'node:assert/strict';
import rule from '../../../../services/runtime-api/rules/letters.mjs';
import { findSpelling } from '../engine.js';

const state = rule.initial('fixed-check');
assert.deepEqual(state, rule.initial('fixed-check'));
assert.equal(JSON.stringify(rule.view(state)).includes('"word":'), false, 'public view contains no answers');
const publicTiles = rule.view(state).tiles;
assert.equal(new Set(publicTiles.map(tile => tile.z)).size < publicTiles.length, true, 'public depth does not expose engine spelling insertion order');
for (const tile of publicTiles) for (const other of publicTiles) {
  if (tile === other || tile.x >= other.x + other.size || tile.x + tile.size <= other.x || tile.y >= other.y + other.size || tile.y + tile.size <= other.y) continue;
  assert.equal(Math.sign(tile.z - other.z), Math.sign(state.game.tiles.find(t => t.id === tile.id).z - state.game.tiles.find(t => t.id === other.id).z), 'public drawing preserves all overlapping card order');
}
const blocked = rule.view(state).tiles.find(tile => tile.blocked);
assert.throws(() => rule.action(state, { type: 'select', tileId: blocked.id }, 10));
assert.throws(() => rule.action(state, { type: 'score', score: 9999999 }, 20));
let elapsed = 100;
while (!state.finished) {
  const word = state.game.words.find(word => word.id === state.game.activeWordId);
  if (state.correct === 0) rule.action(state, { type: 'hint' }, elapsed += 100);
  for (const tileId of findSpelling(state.game, word.id)) rule.action(state, { type: 'select', tileId }, elapsed += 100);
  rule.action(state, { type: 'submit' }, elapsed += 100);
}
assert.equal(state.correct, 18);
assert.equal(rule.result(state).correct, 17, 'hinted words never count as unaided correct words');
assert.equal(rule.result(state).accuracy, Math.floor(17 / 18 * 10000));
assert.equal(rule.result(state).secondary, elapsed);
assert.throws(() => rule.action(state, { type: 'submit' }, elapsed + 1), /结算/);
const timed = rule.initial('timeout');
rule.action(timed, { type: 'finish' }, 120001);
assert.deepEqual({ finished: rule.result(timed).finished, eligible: rule.result(timed).eligible }, { finished: true, eligible: false });
console.log('Competition rule: deterministic shared conditions, hidden answers, legal actions, 18-word completion, hint exclusion, server timing and single settlement passed.');
