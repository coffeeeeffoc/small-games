import test from 'node:test';
import assert from 'node:assert/strict';
import { levels } from '../levels/index.ts';
import { createGame, EPSILON, getHint, getProgress, isCollisionFree, tryMove } from './index.ts';
import type { Offsets } from './types.ts';

test('short six-piece restoration retains its short route after actual drag roundoff', () => {
  const source = levels.find((level) => level.id === 'burr-short-6-v1')!;
  // Actual touch-drag endpoints from the browser regression, including a
  // nearly seated coordinate on the other side of the cache rounding bucket.
  const samples: Offsets[] = [
    {
      key: [7, 0, 0],
      cross: [0, 7, -7.000000053869927],
      upright: [0, 0, -12.000000823157963],
      bridge: [0, 0, -7.000000053869927],
      fork: [0, 0, 0],
      crown: [0, -5.00000034301204, 0],
    },
    {
      key: [7, 0, 0],
      cross: [0, 7, -7.000000053869927],
      upright: [0, 0, -7.154181513868707e-7],
      bridge: [0, 0, -7.000000053869927],
      fork: [0, 0, 0],
      crown: [0, -5.00000034301204, 0],
    },
  ];
  for (const offsets of samples) {
    // Separate cache identity ensures each actual pose independently finds a
    // short legal route rather than relying on an exact-pose route cached first.
    const level = { ...source };
    let state = { ...createGame(level), phase: 'reassemble' as const, moves: 31, offsets };
    for (let action = 0; action < 6 && !getProgress(level, state).complete; action++) {
      const hint = getHint(level, state);
      assert.ok(hint, 'the perturbed pose retains a restoration route');
      assert.notEqual(hint.kind, 'rotate');
      assert.ok(Math.abs(hint.targetOffset) <= 12.000001, 'no distant parking detour');
      const moved = tryMove(level, state, hint.pieceIds, hint.targetOffset, hint.axis);
      assert.ok(Math.abs(moved.actualOffset - hint.targetOffset) <= EPSILON);
      assert.notEqual(moved.state, state);
      assert.ok(isCollisionFree(level, moved.state.offsets, moved.state.orientations));
      state = moved.state as typeof state;
    }
    assert.ok(
      getProgress(level, state).complete,
      'restoration completes in at most six legal actions',
    );
  }
});
