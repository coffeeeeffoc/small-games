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
  axes,
} from './index.ts';
import { createSearchSweep } from './search-sweep.ts';
import type { GameState, Level } from './types.ts';
import type { Vec3 } from './types.ts';

function finish(level: Level, initial: GameState): GameState {
  let state = initial;
  for (let move = 0; move < 160 && !getProgress(level, state).complete; move++) {
    const hint = getHint(level, state);
    assert.ok(hint, `${level.id} has a continuation from ${JSON.stringify(state.offsets)}`);
    const result = tryMove(level, state, hint.pieceIds, hint.targetOffset, hint.axis);
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

test('cached interval sweeps match all-axis and group collision at fractional reachable poses', () => {
  let seed = 19473;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (const level of levels) {
    const searchSweep = createSearchSweep(level);
    let state = createGame(level);
    for (let sample = 0; sample < 40; sample++) {
      const ids = level.pieces.filter(() => random() > 0.5).map((piece) => piece.id);
      if (!ids.length) ids.push(level.pieces[0]!.id);
      const target = (random() - 0.5) * 30;
      state = tryMove(level, state, ids, target, axes[Math.floor(random() * 3)]!).state;
      for (const selection of [...level.pieces.map((piece) => [piece.id]), ids]) {
        for (const axis of axes) for (const destination of [0, -20, 20, (random() - 0.5) * 30]) {
          const expected = sweepMove(level, state.offsets, selection, destination, axis).actualOffset;
          const actual = searchSweep(state.offsets, selection, destination, axis);
          assert.ok(Math.abs(actual - expected) < 1e-8,
            `${level.id}/${selection.join('+')}/${axis} at ${JSON.stringify(state.offsets)} toward ${destination}: ${actual} vs ${expected}`);
        }
      }
    }
  }
});

test('reverse assembly hints retain short reversible routes for every multi-axis campaign puzzle', () => {
  for (const level of levels) {
    const removed = finish(level, createGame(level));
    const restored = finish(level, switchToReassembly(level, removed));
    assert.ok(restored.moves <= removed.moves, `${level.id}: no parking detour is needed for a reversible known layout`);
  }
});

test('touch-drag floating-point tails preserve short reverse routes instead of parking detours', () => {
  for (const source of levels.slice(-3)) {
    // Isolate the cache so this exercises both reverse search and later hits.
    const level = { ...source };
    const removed = finish(level, createGame(level));
    let coordinate = 0;
    const perturbed: GameState = {
      ...switchToReassembly(level, removed),
      offsets: Object.fromEntries(Object.entries(removed.offsets).map(([id, position]) => [
        id,
        position.map((value) => value + (++coordinate % 2 ? 1 : -1) * 1e-14) as unknown as Vec3,
      ])),
    };
    const restored = finish(level, perturbed);
    assert.ok(restored.moves <= removed.moves,
      `${level.id}: tiny drag roundoff must not trigger a long parking route`);
  }
});

test('assembly hints recover after players depart from the recommended route in every level', () => {
  let seed = 20261004;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (const level of levels) {
    const removed = finish(level, createGame(level));
    for (let sample = 0; sample < 2; sample++) {
      let state = switchToReassembly(level, removed);
      for (let move = 0; move < 12; move++) {
        const ids = level.pieces.filter(() => random() > 0.6).map((piece) => piece.id);
        if (!ids.length) ids.push(level.pieces[0]!.id);
        const targets = [0, -9, 9, Math.round((random() - 0.5) * 28) / 2];
        state = tryMove(
          level,
          state,
          ids,
          targets[Math.floor(random() * targets.length)]!,
          axes[Math.floor(random() * 3)]!,
        ).state;
      }
      finish(level, state);
    }
  }
});
