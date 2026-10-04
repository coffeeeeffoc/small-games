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
  tryRotate,
  quarterTurnOrientation,
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
    if (hint.kind === 'rotate') {
      const result = tryRotate(level, state, hint.pieceIds, hint.axis, hint.direction);
      assert.equal(result.blocked, false, 'rotation hints check the entire swept rotation');
      state = result.state;
      continue;
    }
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
      if (sample % 4 === 0)
        state = tryRotate(
          level,
          state,
          ids,
          axes[Math.floor(random() * 3)]!,
          random() < 0.5 ? -1 : 1,
        ).state;
      for (const selection of [...level.pieces.map((piece) => [piece.id]), ids]) {
        for (const axis of axes)
          for (const destination of [0, -20, 20, (random() - 0.5) * 30]) {
            const expected = sweepMove(
              level,
              state.offsets,
              selection,
              destination,
              axis,
              state.orientations,
            ).actualOffset;
            const actual = searchSweep(
              state.offsets,
              selection,
              destination,
              axis,
              state.orientations,
            );
            assert.ok(
              Math.abs(actual - expected) < 1e-8,
              `${level.id}/${selection.join('+')}/${axis} at ${JSON.stringify(state.offsets)} toward ${destination}: ${actual} vs ${expected}`,
            );
          }
      }
    }
  }
});

test('reassembly hints restore every piece orientation before seating rotated pieces', () => {
  for (const source of levels) {
    const level = { ...source };
    let state = createGame(level);
    state = {
      ...state,
      offsets: Object.fromEntries(
        level.pieces.map((piece, i) => [piece.id, [30 + i * 20, 30, 30]]),
      ),
    };
    for (const [index, piece] of level.pieces.entries()) {
      const result = tryRotate(level, state, [piece.id], axes[index % axes.length]!, 1);
      assert.equal(result.blocked, false);
      state = result.state;
    }
    const assembling = switchToReassembly(level, state);
    const first = getHint(level, assembling);
    assert.equal(first?.kind, 'rotate', 'a separated rotated piece is corrected first');
    finish(level, assembling);
  }
});

test('reassembly makes room before correcting an orientation trapped between nearby pieces', () => {
  const level: Level = {
    id: 'rotation-clearance',
    title: '',
    subtitle: '',
    description: '',
    difficulty: '',
    estimatedMinutes: '',
    pieces: [
      { id: 'bar', min: [-2, -0.5, -0.5], max: [2, 0.5, 0.5] },
      { id: 'left', min: [-0.8, -3, 9], max: [-0.6, 3, 11] },
      { id: 'right', min: [0.6, -3, 9], max: [0.8, 3, 11] },
    ].map(({ id, min, max }) => ({
      id,
      name: id,
      color: '#fff',
      axis: 'x',
      range: [-20, 20],
      removedAt: 20,
      boxes: [{ min: min as unknown as Vec3, max: max as unknown as Vec3 }],
    })),
  };
  const initial = createGame(level);
  const state: GameState = {
    ...initial,
    phase: 'reassemble',
    moves: 1,
    offsets: { ...initial.offsets, bar: [0, 0, 10] },
    orientations: { ...initial.orientations, bar: quarterTurnOrientation('z', 1) },
  };
  assert.equal(tryRotate(level, state, 'bar', 'z', -1).blocked, true);
  const first = getHint(level, state);
  assert.ok(
    first && first.kind !== 'rotate',
    'the planner first finds room for the blocked rotation',
  );
  finish(level, state);
});

test('reverse assembly hints retain short reversible routes for every multi-axis campaign puzzle', () => {
  for (const level of levels) {
    const removed = finish(level, createGame(level));
    const restored = finish(level, switchToReassembly(level, removed));
    assert.ok(
      restored.moves - removed.moves <= removed.moves,
      `${level.id}: no parking detour is needed for a reversible known layout`,
    );
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
      offsets: Object.fromEntries(
        Object.entries(removed.offsets).map(([id, position]) => [
          id,
          position.map((value) => value + (++coordinate % 2 ? 1 : -1) * 1e-14) as unknown as Vec3,
        ]),
      ),
    };
    const restored = finish(level, perturbed);
    assert.ok(
      restored.moves - perturbed.moves <= removed.moves,
      `${level.id}: tiny drag roundoff must not trigger a long parking route`,
    );
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

test('each sourced puzzle can reverse a partial dismantling and then resume dismantling', () => {
  for (const level of levels) {
    let state = createGame(level);
    const initialHint = getHint(level, state);
    assert.ok(initialHint && initialHint.kind !== 'rotate');
    state = tryMove(
      level,
      state,
      initialHint.pieceIds,
      initialHint.targetOffset,
      initialHint.axis,
    ).state;
    assert.equal(
      getProgress(level, state).complete,
      false,
      `${level.id}: one move does not finish the puzzle`,
    );
    const restored = finish(level, switchToReassembly(level, state));
    assert.equal(getProgress(level, restored).assembled, level.pieces.length);
    finish(level, { ...restored, phase: 'disassemble' });
  }
});
