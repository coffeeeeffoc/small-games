import test from 'node:test';
import assert from 'node:assert/strict';
import { levels } from '../levels/index.ts';
import {
  axes,
  axisIndex,
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
import type { GameState, Level, PieceDefinition, Vec3 } from './types.ts';

function solve(level: Level, initial: GameState): GameState {
  let state = initial;
  for (let i = 0; i < 120 && !getProgress(level, state).complete; i++) {
    const hint = getHint(level, state);
    assert.ok(
      hint,
      `a valid next action exists in ${level.id} (${state.phase}): ${JSON.stringify(state.offsets)}`,
    );
    const result = tryMove(level, state, hint.pieceIds, hint.targetOffset, hint.axis);
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
  for (const box of piece.boxes)
    for (let x = box.min[0] + 0.5; x < box.max[0]; x++)
      for (let y = box.min[1] + 0.5; y < box.max[1]; y++)
        for (let z = box.min[2] + 0.5; z < box.max[2]; z++) {
          const key = [x, y, z].join(',');
          assert.ok(!voxels.has(key), `${piece.id} contains duplicate volume`);
          voxels.add(key);
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

  test(`${level.id}: every piece supports all three axes when there is physical clearance`, () => {
    const state = createGame(level);
    for (let i = 0; i < level.pieces.length; i++) {
      state.offsets[level.pieces[i]!.id] = [i * 30, i * 30, i * 30];
    }
    assert.ok(isCollisionFree(level, state.offsets));
    for (const piece of level.pieces)
      for (const axis of axes)
        for (const direction of [-1, 1]) {
          const target = state.offsets[piece.id]![axisIndex(axis)] + direction * 2;
          const result = tryMove(level, state, piece.id, target, axis);
          assert.equal(result.actualOffset, target);
          assert.equal(result.blocked, false);
          assert.ok(isCollisionFree(level, result.state.offsets));
        }
  });

  test(`${level.id}: hints disassemble and reassemble with actual vector/group collision checks`, () => {
    const removed = solve(level, createGame(level));
    const reassembling = switchToReassembly(level, removed);
    assert.deepEqual(reassembling.offsets, removed.offsets);
    assert.equal(reassembling.moves, 0);
    const assembled = solve(level, reassembling);
    assert.deepEqual(assembled.offsets, createGame(level).offsets);
  });

  test(`${level.id}: hints adapt after alternative sideways and group moves`, () => {
    let state = tryMove(level, createGame(level), 'key', -3.5, 'z').state;
    state = tryMove(level, state, ['cross', 'upright'], 1.5, 'x').state;
    const removed = solve(level, state);
    solve(level, switchToReassembly(level, removed));
  });

  test(`${level.id}: arbitrary long 3D and group sweeps never tunnel, and hints recover`, () => {
    let state = createGame(level);
    let seed = 20261004;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    for (let i = 0; i < 350; i++) {
      const piece = level.pieces[Math.floor(random() * level.pieces.length)]!;
      const target = (random() - 0.5) * 100;
      const axis = axes[Math.floor(random() * 3)]!;
      const ids =
        i % 5 === 0
          ? [piece.id, level.pieces[(level.pieces.indexOf(piece) + 1) % level.pieces.length]!.id]
          : [piece.id];
      const index = axisIndex(axis);
      const result = tryMove(level, state, ids, target, axis);
      for (const fraction of [0.1, 0.5, 0.9, 1]) {
        const offsets = { ...state.offsets };
        const delta = (result.actualOffset - state.offsets[piece.id]![index]) * fraction;
        for (const id of ids)
          offsets[id] = offsets[id]!.map(
            (coordinate, j) => coordinate + (j === index ? delta : 0),
          ) as unknown as Vec3;
        assert.ok(isCollisionFree(level, offsets));
      }
      state = result.state;
    }
    assert.deepEqual(restoreGame(level, serializeGame(state)), state);
    const removed = solve(level, state);
    const assembled = solve(level, switchToReassembly(level, removed));
    assert.deepEqual(assembled.offsets, createGame(level).offsets);
  });
}

const level = levels[0]!;

test('C can lift straight up while A and B remain assembled', () => {
  const initial = createGame(level);
  const result = tryMove(level, initial, 'upright', 6, 'y');
  assert.equal(result.blocked, false);
  assert.deepEqual(result.state.offsets.upright, [0, 6, 0]);
  assert.deepEqual(result.state.offsets.key, initial.offsets.key);
  assert.deepEqual(result.state.offsets.cross, initial.offsets.cross);
});

test('A can slide laterally out of B as well as along its length', () => {
  const initial = createGame(level);
  for (const axis of ['x', 'z'] as const) {
    const result = tryMove(level, initial, 'key', -6, axis);
    assert.equal(result.blocked, false);
    assert.equal(result.actualOffset, -6);
    assert.ok(isCollisionFree(level, result.state.offsets));
  }
  const blocked = tryMove(level, initial, 'key', 3, 'y');
  assert.equal(blocked.actualOffset, 0);
  assert.ok(blocked.blockedBy.includes('cross'));
});

test('A and B can leave C together, then separate as independent pieces', () => {
  const initial = createGame(level);
  const group = tryMove(level, initial, ['key', 'cross'], -6, 'y');
  assert.equal(group.blocked, false);
  assert.deepEqual(group.state.offsets.key, [0, -6, 0]);
  assert.deepEqual(group.state.offsets.cross, [0, -6, 0]);
  assert.deepEqual(group.state.offsets.upright, [0, 0, 0]);
  assert.equal(getProgress(level, group.state).complete, false);
  const split = tryMove(level, group.state, 'key', -6, 'z');
  assert.ok(getProgress(level, split.state).complete);
  assert.deepEqual(undo(group.state).offsets, initial.offsets);
  assert.equal(undo(group.state).moves, 0);
});

test('rigid group movement stops at the earliest member collision without tunnelling', () => {
  const fixture: Level = {
    ...level,
    id: 'group-sweep',
    pieces: [0, 2, 4].map((x, i) => ({
      id: String(i),
      name: String(i),
      color: '#000',
      axis: 'x',
      range: [-6, 6],
      removedAt: 6,
      boxes: [{ min: [x - 0.5, -0.5, -0.5], max: [x + 0.5, 0.5, 0.5] }],
    })),
  };
  const initial = createGame(fixture);
  const result = tryMove(fixture, initial, ['0', '1'], 100, 'x');
  assert.equal(result.actualOffset, 1);
  assert.deepEqual(result.blockedBy, ['2']);
  assert.deepEqual(result.state.offsets['0'], [1, 0, 0]);
  assert.deepEqual(result.state.offsets['1'], [1, 0, 0]);
  assert.ok(isCollisionFree(fixture, result.state.offsets));
  assert.equal(result.state.history.length, 1);
  assert.deepEqual(restoreGame(fixture, serializeGame(result.state)), result.state);
});

test('moving an entire assembly cannot count as disassembly', () => {
  const initial = createGame(level);
  let shifted = initial;
  for (const axis of axes)
    shifted = tryMove(
      level,
      shifted,
      level.pieces.map((piece) => piece.id),
      20,
      axis,
    ).state;
  assert.equal(getProgress(level, shifted).removed, getProgress(level, initial).removed);
  assert.equal(getProgress(level, shifted).complete, false);
  assert.equal(getProgress(level, shifted).assembled, 0);
});

test('free-space movement is not limited by the legacy extraction range', () => {
  const result = tryMove(level, createGame(level), 'key', -100, 'x');
  assert.equal(result.actualOffset, -100);
  assert.equal(result.blocked, false);
});

test('blocked gestures leave history and move counts unchanged', () => {
  const state = createGame(level);
  const result = updateTransaction(level, beginTransaction(state, 'cross', 'y'), 1000);
  assert.equal(result.blocked, true);
  assert.equal(result.actualOffset, 0);
  assert.equal(commitTransaction(result.transaction), state);
});

test('continuous group drag snaps one shared delta and commits one undo step', () => {
  const state = tryMove(level, createGame(level), 'key', -0.25).state;
  let transaction = beginTransaction(state, ['key', 'cross'], 'x');
  for (const offset of [-0.4, -0.9, -1.8, -2.2, -2.7])
    transaction = updateTransaction(level, transaction, offset).transaction;
  assert.deepEqual(transaction.state.offsets.key, [-2.7, 0, 0]);
  assert.deepEqual(transaction.state.offsets.cross, [-2.45, 0, 0]);
  assert.equal(transaction.state.moves, 1);
  const committed = commitTransaction(transaction);
  assert.deepEqual(committed.offsets.key, [-2.5, 0, 0]);
  assert.deepEqual(committed.offsets.cross, [-2.25, 0, 0]);
  assert.equal(committed.moves, 2);
  assert.equal(committed.history.length, 2);
  assert.deepEqual(undo(committed).offsets, state.offsets);
  assert.deepEqual(redo(undo(committed)), committed);
  assert.deepEqual(restoreGame(level, serializeGame(committed)), committed);
});

test('switching half-grid nudges to tiny drag preserves seat and history', () => {
  const initial = createGame(level);
  const nudged = tryMove(level, initial, 'key', 0.5).state;
  assert.equal(commitTransaction(beginTransaction(nudged, 'key')), nudged);
  for (const offset of [0.49, 0.51]) {
    const preview = updateTransaction(level, beginTransaction(nudged, 'key'), offset);
    assert.equal(preview.state.offsets.key![0], offset);
    const released = commitTransaction(preview.transaction);
    assert.equal(released, nudged);
    assert.equal(released.moves, 1);
    assert.deepEqual(undo(released).offsets, initial.offsets);
  }
});

test('pointer cancellation restores all group members with no undo entry', () => {
  const state = tryMove(level, createGame(level), 'key', -1).state;
  const transaction = updateTransaction(
    level,
    beginTransaction(state, ['key', 'cross'], 'y'),
    -5.7,
  ).transaction;
  assert.equal(cancelTransaction(transaction), state);
});

test('a new action clears redo history', () => {
  const once = tryMove(level, createGame(level), 'key', 2).state;
  const reverted = undo(once);
  assert.equal(reverted.future.length, 1);
  const alternate = tryMove(level, reverted, 'key', -1).state;
  assert.equal(alternate.future.length, 0);
  assert.equal(redo(alternate), alternate);
});

test('reassembly requires all coordinates to return to exact original seats', () => {
  const initial = createGame(level);
  assert.equal(switchToReassembly(level, initial), initial);
  const moved = tryMove(level, { ...initial, phase: 'reassemble' }, 'key', -6, 'z').state;
  assert.equal(getProgress(level, moved).assembled, 2);
  assert.equal(getProgress(level, moved).complete, false);
  const restored = tryMove(level, moved, 'key', 0, 'z').state;
  assert.equal(getProgress(level, restored).complete, true);
});

test('save/load preserves legal vector/group undo and redo timelines', () => {
  const removed = solve(level, createGame(level));
  const state = undo(removed);
  assert.deepEqual(restoreGame(level, serializeGame(state)), state);
  const assembled = solve(level, switchToReassembly(level, removed));
  assert.deepEqual(restoreGame(level, serializeGame(assembled)), assembled);
});

test('invalid input cannot introduce NaN, unknown pieces or partial groups', () => {
  const state = createGame(level);
  for (const ids of ['unknown', [], ['key', 'unknown']])
    assert.deepEqual(tryMove(level, state, ids, 6).state, state);
  assert.deepEqual(tryMove(level, state, 'key', NaN).state, state);
  assert.deepEqual(tryMove(level, state, 'key', Infinity).state, state);
});

test('five-piece reassembly can detour from arbitrary separate XYZ positions', () => {
  const level = levels[2]!;
  let state = createGame(level);
  let seed = 20261004;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (let i = 0; i < 350; i++) {
    const piece = level.pieces[Math.floor(random() * level.pieces.length)]!;
    const target = (random() - 0.5) * 100;
    const axis = axes[Math.floor(random() * 3)]!;
    state = tryMove(level, state, piece.id, target, axis).state;
  }
  const removed = solve(level, state);
  const assembled = solve(level, switchToReassembly(level, removed));
  assert.deepEqual(assembled.offsets, createGame(level).offsets);
});

test('half-grid reassembly hints remain reachable through real drag release snapping', () => {
  const level = levels[2]!;
  let state = createGame(level);
  let seed = 20261004;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (let i = 0; i < 350; i++) {
    const piece = level.pieces[Math.floor(random() * level.pieces.length)]!;
    const target = Math.round((random() - 0.5) * 200) / 2;
    const axis = axes[Math.floor(random() * 3)]!;
    state = tryMove(level, state, piece.id, target, axis).state;
  }
  state = switchToReassembly(level, solve(level, state));
  let hintCount = 0;
  while (!getProgress(level, state).complete && hintCount++ < 120) {
    const hint = getHint(level, state);
    assert.ok(hint);
    assert.equal(hint.targetOffset * 2, Math.round(hint.targetOffset * 2));
    const result = updateTransaction(
      level,
      beginTransaction(state, hint.pieceIds, hint.axis),
      hint.targetOffset,
    );
    const released = commitTransaction(result.transaction);
    assert.equal(released.offsets[hint.pieceId]![axisIndex(hint.axis)], hint.targetOffset);
    assert.ok(isCollisionFree(level, released.offsets));
    state = released;
  }
  assert.ok(getProgress(level, state).complete);
});
