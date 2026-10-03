import test from 'node:test';
import assert from 'node:assert/strict';
import { levels } from '../levels/index.ts';
import {
  createGame,
  getHint,
  getProgress,
  sweepMove,
  switchToReassembly,
  tryMove,
} from './index.ts';
import { createSearchSweep } from './search-sweep.ts';
import type { GameState, Level } from './types.ts';

function finish(level: Level, initial: GameState): GameState {
  let state = initial;
  for (let move = 0; move < 50 && !getProgress(level, state).complete; move++) {
    const hint = getHint(level, state);
    assert.ok(hint, `${level.id} has a continuation from ${JSON.stringify(state.offsets)}`);
    const result = tryMove(level, state, hint.pieceId, hint.targetOffset);
    assert.equal(
      result.actualOffset,
      hint.targetOffset,
      'every hint follows the gameplay collision rules',
    );
    state = result.state;
  }
  assert.ok(getProgress(level, state).complete, `${level.id} does not cycle through hints`);
  return state;
}

test('cached interval sweeps match gameplay collision across all levels and fractional reachable states', () => {
  let seed = 19473;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (const level of levels) {
    const searchSweep = createSearchSweep(level);
    let state = createGame(level);
    for (let sample = 0; sample < 100; sample++) {
      const piece = level.pieces[Math.floor(random() * level.pieces.length)]!;
      const target = (random() - 0.5) * 30;
      state = tryMove(level, state, piece.id, target).state;
      for (const candidate of level.pieces) {
        for (const destination of [
          0,
          candidate.range[0],
          candidate.range[1],
          (random() - 0.5) * 30,
        ]) {
          assert.equal(
            searchSweep(state.offsets, candidate.id, destination),
            sweepMove(level, state.offsets, candidate.id, destination).actualOffset,
            `${level.id}/${candidate.id} at ${JSON.stringify(state.offsets)} toward ${destination}`,
          );
        }
      }
    }
  }
});

test('reverse assembly hints recover the temporary clearance seat after its blocking frame has moved away', () => {
  const level = levels.find((item) => item.id === 'captive-key')!;
  const removed = finish(level, createGame(level));
  const restored = finish(level, switchToReassembly(level, removed));
  assert.equal(removed.moves, 4);
  assert.equal(restored.moves, 4);
  assert.ok(restored.history.some((snapshot) => snapshot.offsets.key === -2));
});

test('assembly hints recover after players depart from the recommended route in every level', () => {
  let seed = 20261004;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (const level of levels) {
    const removed = finish(level, createGame(level));
    for (let sample = 0; sample < 4; sample++) {
      let state = switchToReassembly(level, removed);
      for (let move = 0; move < 25; move++) {
        const piece = level.pieces[Math.floor(random() * level.pieces.length)]!;
        const targets = [0, piece.range[0], piece.range[1], Math.round((random() - 0.5) * 28) / 2];
        state = tryMove(
          level,
          state,
          piece.id,
          targets[Math.floor(random() * targets.length)]!,
        ).state;
      }
      finish(level, state);
    }
  }
});
