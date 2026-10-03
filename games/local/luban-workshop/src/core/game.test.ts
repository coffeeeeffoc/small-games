import test from 'node:test';
import assert from 'node:assert/strict';
import { levels } from '../levels/index.ts';
import {
  beginTransaction,
  cancelTransaction,
  commitTransaction,
  createGame,
  getHint,
  getProgress,
  isCollisionFree,
  redo,
  restoreGame,
  serializeGame,
  sweepMove,
  switchToReassembly,
  tryMove,
  undo,
  updateTransaction,
} from './index.ts';
import type { GameState, Level, PieceDefinition } from './types.ts';

function solve(level: Level, initial: GameState): GameState {
  let state = initial;
  for (let i = 0; i < 24 && !getProgress(level, state).complete; i++) {
    const hint = getHint(level, state);
    assert.ok(hint, `a valid next action exists in ${level.id} (${state.phase})`);
    const result = tryMove(level, state, hint.pieceId, hint.targetOffset);
    assert.equal(result.actualOffset, hint.targetOffset);
    assert.ok(isCollisionFree(level, result.state.offsets));
    state = result.state;
  }
  assert.ok(getProgress(level, state).complete);
  assert.equal(getHint(level, state), null);
  return state;
}

function assertConnected(piece: PieceDefinition): void {
  const voxels = new Set<string>();
  for (const box of piece.boxes) {
    for (let x = box.min[0] + 0.5; x < box.max[0]; x++) {
      for (let y = box.min[1] + 0.5; y < box.max[1]; y++) {
        for (let z = box.min[2] + 0.5; z < box.max[2]; z++) {
          const key = [x, y, z].join(',');
          assert.ok(!voxels.has(key), `${piece.id} contains duplicate volume`);
          voxels.add(key);
        }
      }
    }
  }
  const stack = [[...voxels][0]!];
  voxels.delete(stack[0]!);
  while (stack.length) {
    const cell = stack.pop()!.split(',').map(Number);
    for (let axis = 0; axis < 3; axis++)
      for (const direction of [-1, 1]) {
        const neighbor = [...cell];
        neighbor[axis] = neighbor[axis]! + direction;
        const key = neighbor.join(',');
        if (voxels.delete(key)) stack.push(key);
      }
  }
  assert.equal(voxels.size, 0, `${piece.id} must be a single solid connected at faces`);
}

for (const level of levels) {
  test(`${level.id}: every piece is connected and the initial assembly has no overlap`, () => {
    level.pieces.forEach(assertConnected);
    assert.ok(isCollisionFree(level, createGame(level).offsets));
    assert.equal(new Set(level.pieces.map((piece) => piece.id)).size, level.pieces.length);
  });

  test(`${level.id}: only the physical key can initially be extracted`, () => {
    const state = createGame(level);
    for (const piece of level.pieces) {
      const distances = [-6, 6].map((target) =>
        Math.abs(sweepMove(level, state.offsets, piece.id, target).actualOffset),
      );
      assert.equal(
        distances.some((distance) => distance >= piece.removedAt),
        piece.id === 'key',
      );
    }
    assert.ok(sweepMove(level, state.offsets, 'cross', 6).blockedBy.includes('key'));
  });

  test(`${level.id}: current-state hints disassemble and reassemble with real collision checks`, () => {
    const removed = solve(level, createGame(level));
    assert.equal(removed.moves, level.pieces.length);
    const reassembling = switchToReassembly(level, removed);
    assert.deepEqual(reassembling.offsets, removed.offsets);
    assert.equal(reassembling.moves, 0);
    const assembled = solve(level, reassembling);
    assert.deepEqual(assembled.offsets, createGame(level).offsets);
    assert.equal(assembled.moves, level.pieces.length);
  });

  test(`${level.id}: hints adapt when the player chooses the other key direction`, () => {
    const state = tryMove(level, createGame(level), 'key', -6).state;
    const removed = solve(level, state);
    solve(level, switchToReassembly(level, removed));
  });

  test(`${level.id}: hundreds of arbitrary long sweeps cannot tunnel through another piece`, () => {
    let state = createGame(level);
    let seed = 20261004;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    for (let i = 0; i < 350; i++) {
      const piece = level.pieces[Math.floor(random() * level.pieces.length)]!;
      const target = (random() - 0.5) * 100;
      const result = tryMove(level, state, piece.id, target);
      // Inspect interior sweep positions as well as endpoints.
      for (const fraction of [0.1, 0.5, 0.9, 1]) {
        const offsets = {
          ...state.offsets,
          [piece.id]:
            state.offsets[piece.id]! + (result.actualOffset - state.offsets[piece.id]!) * fraction,
        };
        assert.ok(isCollisionFree(level, offsets));
      }
      state = result.state;
    }
    solve(level, state);
  });
}

const level = levels[0]!;

test('blocked gestures leave history and move counts unchanged', () => {
  const state = createGame(level);
  const result = updateTransaction(level, beginTransaction(state, 'cross'), 1000);
  assert.equal(result.blocked, true);
  assert.equal(result.actualOffset, 0);
  assert.equal(commitTransaction(result.transaction), state);
});

test('a continuous drag is one undo step and release snaps to the nearest safe position', () => {
  const state = createGame(level);
  let transaction = beginTransaction(state, 'key');
  for (const offset of [0.2, 0.9, 1.8, 2.2, 2.7])
    transaction = updateTransaction(level, transaction, offset).transaction;
  assert.equal(transaction.state.offsets.key, 2.7);
  assert.equal(transaction.state.moves, 0);
  const committed = commitTransaction(transaction);
  assert.equal(committed.offsets.key, 2.5);
  assert.equal(committed.moves, 1);
  assert.equal(committed.history.length, 1);
  assert.deepEqual(undo(committed).offsets, state.offsets);
  assert.deepEqual(redo(undo(committed)), committed);
});

test('switching from half-grid nudges to a tiny drag preserves the seat and undo history', () => {
  const initial = createGame(level);
  const nudged = tryMove(level, initial, 'key', 0.5).state;
  const tap = commitTransaction(beginTransaction(nudged, 'key'));
  assert.equal(tap, nudged);
  for (const offset of [0.49, 0.51]) {
    const preview = updateTransaction(level, beginTransaction(nudged, 'key'), offset);
    assert.equal(preview.state.offsets.key, offset);
    const released = commitTransaction(preview.transaction);
    assert.equal(released, nudged);
    assert.equal(released.offsets.key, 0.5);
    assert.equal(released.moves, 1);
    assert.equal(released.history.length, 1);
    assert.deepEqual(undo(released).offsets, initial.offsets);
    assert.deepEqual(redo(undo(released)), released);
  }
});

test('pointer cancellation restores the entire pre-gesture state without an undo entry', () => {
  const state = tryMove(level, createGame(level), 'key', -1).state;
  const transaction = updateTransaction(level, beginTransaction(state, 'key'), -5.7).transaction;
  assert.equal(cancelTransaction(transaction), state);
});

test('a new committed action clears redo history', () => {
  const once = tryMove(level, createGame(level), 'key', 2).state;
  const reverted = undo(once);
  assert.equal(reverted.future.length, 1);
  const alternate = tryMove(level, reverted, 'key', -1).state;
  assert.equal(alternate.future.length, 0);
  assert.equal(redo(alternate), alternate);
});

test('cannot switch to reassembly until all pieces have been removed', () => {
  const initial = createGame(level);
  assert.equal(switchToReassembly(level, initial), initial);
});

test('save/load preserves current state plus legal undo and redo timelines', () => {
  const removed = solve(level, createGame(level));
  const state = undo(removed);
  assert.deepEqual(restoreGame(level, serializeGame(state)), state);
  const reassembling = solve(level, switchToReassembly(level, removed));
  assert.deepEqual(restoreGame(level, serializeGame(reassembling)), reassembling);
});

test('save/load rejects malformed, non-finite, colliding, and out-of-range positions', () => {
  const state = createGame(level);
  assert.equal(restoreGame(level, 'not json'), null);
  assert.equal(restoreGame(level, '{}'), null);
  assert.equal(restoreGame(level, serializeGame({ ...state, levelId: 'wrong' })), null);
  for (const offset of [NaN, Infinity, -Infinity, 6.1]) {
    assert.equal(
      restoreGame(level, serializeGame({ ...state, offsets: { ...state.offsets, key: offset } })),
      null,
    );
  }
  assert.equal(
    restoreGame(level, serializeGame({ ...state, offsets: { ...state.offsets, cross: 0.25 } })),
    null,
  );
  assert.equal(
    restoreGame(level, serializeGame({ ...state, offsets: { ...state.offsets, unexpected: 0 } })),
    null,
  );
});

test('save/load rejects an impossible history even when each endpoint is collision-free', () => {
  const state = createGame(level);
  const jumped = {
    ...state,
    offsets: { ...state.offsets, cross: -6 },
    moves: 1,
    history: [{ offsets: state.offsets, moves: 0 }],
  };
  assert.ok(isCollisionFree(level, jumped.offsets));
  assert.equal(restoreGame(level, serializeGame(jumped)), null);
});

test('invalid input cannot introduce NaN or an unknown piece into state', () => {
  const state = createGame(level);
  assert.deepEqual(tryMove(level, state, 'key', NaN).state, state);
  assert.deepEqual(tryMove(level, state, 'unknown', 6).state, state);
});
