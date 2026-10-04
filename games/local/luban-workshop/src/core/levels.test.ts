import test from 'node:test';
import assert from 'node:assert/strict';
import { levels } from '../levels/index.ts';
import { axisIndex, boxesOverlap, isCollisionFree } from './collision.ts';
import { createGame, getProgress, switchToReassembly, tryMove } from './game.ts';
import { applyHint, getHint } from './hints.ts';
import type { Axis, Box, Level } from './types.ts';

const volumes: Record<string, readonly number[]> = {
  'first-lift-v1': [3.5, 3.5],
  'burr-interlocking-6-v1': [6, 5, 5, 4.75, 4.75, 5.5],
  'burr-solid-6-v1': [6, 5, 5.25, 4.75, 5, 5],
  'burr-short-6-v1': [24, 18, 15, 17, 16, 14],
  'knoxli-three-piece-2009-v1': [31, 31, 38],
  'crystal-ball-2017-v1': [19, 18, 17],
  'min-333-2008-v1': [9, 9, 9],
  'three-easy-pieces-2011-v1': [10, 10, 7],
  'beginner-cube-levonen-v1': [8, 9, 8, 2],
  'toms-little-box-2009-v1': [11, 8, 7],
  // Source voxel counts 214 + 124 + 70, at half-unit edge length.
  'intricate-puzzle-mochalov-v1': [26.75, 15.5, 8.75],
};
const volume = (box: Box) =>
  box.min.reduce((result, value, axis) => result * (box.max[axis]! - value), 1);
const faceContact = (a: Box, b: Box): boolean =>
  [0, 1, 2].some(
    (normal) =>
      (Math.abs(a.max[normal]! - b.min[normal]!) < 1e-8 ||
        Math.abs(b.max[normal]! - a.min[normal]!) < 1e-8) &&
      [0, 1, 2].every(
        (axis) =>
          axis === normal ||
          Math.min(a.max[axis]!, b.max[axis]!) - Math.max(a.min[axis]!, b.min[axis]!) > 1e-8,
      ),
  );

function assertConnected(boxes: readonly Box[], label: string): void {
  const found = new Set([0]);
  const queue = [0];
  for (const index of queue) {
    boxes.forEach((box, other) => {
      if (!found.has(other) && faceContact(boxes[index]!, box)) {
        found.add(other);
        queue.push(other);
      }
    });
  }
  assert.equal(found.size, boxes.length, `${label} contains floating material`);
}

test('one original beginner joint precedes ten sourced puzzles with their existing save IDs', () => {
  assert.equal(levels.length, 11);
  assert.equal(levels[0]!.id, 'first-lift-v1');
  assert.equal(levels[0]!.tutorial, true);
  assert.equal(levels.filter((level) => level.source).length, 10);
  assert.deepEqual(
    levels.map((level) => level.id),
    Object.keys(volumes),
  );
  assert.equal(new Set(levels.map((level) => level.id)).size, levels.length);
  assert.deepEqual(
    levels.map((level) => level.pieces.length),
    [2, 6, 6, 6, 3, 3, 3, 3, 4, 3, 3],
  );
  const signatures = new Set<string>();
  for (const level of levels) {
    assert.ok(level.id.endsWith('-v1'));
    if (level.tutorial) {
      assert.equal(
        level.source,
        undefined,
        'the original teaching joint does not claim a historical source',
      );
    } else {
      assert.ok(level.source?.title && level.source.note);
      assert.equal(new URL(level.source.url).protocol, 'https:');
    }
    assert.ok(level.chapter && level.mechanic && level.clue);
    const signature = JSON.stringify(level.pieces.map((piece) => piece.boxes));
    assert.ok(!signatures.has(signature), `${level.id} repeats another puzzle`);
    signatures.add(signature);
  }
});

test('every piece and complete assembly is face connected, disjoint and has its verified material volume', () => {
  levels.forEach((level) => {
    const initial = createGame(level);
    assert.ok(isCollisionFree(level, initial.offsets, initial.orientations), level.id);
    assert.equal(getProgress(level, initial).assembled, level.pieces.length);
    assert.equal(getProgress(level, initial).removed, 0);
    assertConnected(
      level.pieces.flatMap((piece) => piece.boxes),
      level.id,
    );
    for (const piece of level.pieces) {
      assertConnected(piece.boxes, `${level.id}/${piece.id}`);
      for (let first = 0; first < piece.boxes.length; first++) {
        assert.ok(volume(piece.boxes[first]!) > 0);
        for (let second = first + 1; second < piece.boxes.length; second++) {
          assert.equal(
            boxesOverlap(piece.boxes[first]!, piece.boxes[second]!),
            false,
            `${level.id}/${piece.id} duplicates material`,
          );
        }
      }
    }
    assert.deepEqual(
      level.pieces.map((piece) => piece.boxes.reduce((total, box) => total + volume(box), 0)),
      volumes[level.id],
    );
  });
});

// Independent, fixed witnesses exercise small clearing moves and rigid groups.
// They are proofs of playability, not a prescribed gameplay order or hint script.
type Step = readonly [readonly string[], Axis, number];
const routes: Record<string, readonly Step[]> = {
  'first-lift-v1': [[['key'], 'y', 2]],
  'burr-interlocking-6-v1': [
    [['key'], 'x', 7],
    [['bridge', 'fork'], 'y', -4.5],
    [['cross', 'bridge'], 'x', -4.5],
    [['upright'], 'x', 11.5],
  ],
  'burr-solid-6-v1': [
    [['key'], 'x', 7],
    [['bridge', 'fork'], 'y', 1],
    [['fork', 'crown'], 'x', -4.5],
    [['cross'], 'z', 4],
    [['crown'], 'x', -6],
  ],
  'burr-short-6-v1': [
    [['key'], 'x', 7],
    [['crown'], 'y', -5],
    [['cross', 'bridge'], 'z', -7],
    [['cross'], 'y', 7],
    [['upright'], 'z', -12],
  ],
  'knoxli-three-piece-2009-v1': [
    [['upright'], 'x', -1],
    [['key', 'cross'], 'y', 4],
    [['key'], 'y', 3],
    [['key'], 'z', -4],
  ],
  'crystal-ball-2017-v1': [
    [['cross'], 'x', 1],
    [['upright'], 'y', -5],
    [['key'], 'z', -5],
  ],
  'min-333-2008-v1': [
    [['key'], 'z', 4],
    [['upright'], 'y', 1],
    [['upright'], 'z', -4],
  ],
  'three-easy-pieces-2011-v1': [
    [['upright'], 'y', 4],
    [['cross'], 'z', 1],
    [['cross'], 'y', -1],
    [['cross'], 'x', 1],
    [['cross'], 'y', -4],
  ],
  'beginner-cube-levonen-v1': [
    [['bridge'], 'z', 3],
    [['upright'], 'y', 1],
    [['key', 'cross'], 'z', -4],
    [['key'], 'x', 4],
  ],
  'toms-little-box-2009-v1': [
    [['upright'], 'x', -1],
    [['key', 'cross'], 'y', -3],
    [['cross'], 'y', -4],
    [['key'], 'z', 1],
    [['key'], 'x', -5],
  ],
  'intricate-puzzle-mochalov-v1': [
    [['cross'], 'y', -1.5],
    [['key'], 'x', 5],
    [['upright'], 'y', -2],
    [['cross'], 'z', 4],
  ],
};

for (const level of levels) {
  test(`${level.id}: a continuous collision-free path fully separates the pieces and can be reversed`, () => {
    let state = createGame(level);
    const reverse: Step[] = [];
    for (const [ids, axis, target] of routes[level.id]!) {
      reverse.unshift([ids, axis, state.offsets[ids[0]!]![axisIndex(axis)]]);
      const result = tryMove(level, state, ids, target, axis);
      assert.equal(result.blocked, false, `${level.id}/${ids.join('+')}/${axis}`);
      assert.equal(result.actualOffset, target);
      state = result.state;
      assert.ok(isCollisionFree(level, state.offsets, state.orientations));
    }
    assert.equal(getProgress(level, state).removed, level.pieces.length);
    assert.equal(getProgress(level, state).complete, true);
    state = switchToReassembly(level, state);
    for (const [ids, axis, target] of reverse) {
      const result = tryMove(level, state, ids, target, axis);
      assert.equal(result.blocked, false);
      assert.equal(result.actualOffset, target);
      state = result.state;
    }
    assert.equal(getProgress(level, state).complete, true);
    assert.deepEqual(state.offsets, createGame(level).offsets);
  });
}

test('Three Easy Pieces guides unfinished contact moves in both phases from the live pose without history', () => {
  const level = levels.find((candidate) => candidate.id === 'three-easy-pieces-2011-v1')!;
  let state = tryMove(level, createGame(level), 'upright', 4, 'y').state;
  for (const [axis, partial, destination] of [
    ['z', 0.5, 1],
    ['y', -0.5, -1],
    ['x', 0.5, 1],
  ] as const) {
    state = { ...tryMove(level, state, 'cross', partial, axis).state, history: [], moves: 0 };
    const hint = getHint(level, state);
    assert.equal(hint?.axis, axis);
    assert.equal(hint?.targetOffset, destination);
    assert.deepEqual(hint?.pieceIds, ['cross']);
    const result = tryMove(level, state, hint!.pieceIds, destination, axis);
    assert.equal(result.blocked, false);
    state = result.state;
  }
  state = switchToReassembly(level, tryMove(level, state, 'cross', -2.5, 'y').state);
  for (const [axis, partial, destination] of [
    ['y', -2.5, -1],
    ['x', 0.5, 0],
    ['y', -0.5, 0],
    ['z', 0.5, 0],
  ] as const) {
    state = { ...tryMove(level, state, 'cross', partial, axis).state, history: [], moves: 0 };
    const hint = getHint(level, state);
    assert.equal(hint?.axis, axis);
    assert.equal(hint?.targetOffset, destination);
    assert.deepEqual(hint?.pieceIds, ['cross']);
    const result = tryMove(level, state, hint!.pieceIds, destination, axis);
    assert.equal(result.blocked, false);
    state = result.state;
  }
  state = tryMove(level, state, 'upright', 0, 'y').state;
  assert.equal(getProgress(level, state).complete, true);
});

test('Three Easy Pieces contact guidance follows a translated assembly instead of fixed world coordinates', () => {
  const level = levels.find((candidate) => candidate.id === 'three-easy-pieces-2011-v1')!;
  const ids = level.pieces.map((piece) => piece.id);
  let state = createGame(level);
  for (const [axis, destination] of [
    ['x', 3],
    ['y', -2],
    ['z', 1.5],
  ] as const) {
    state = tryMove(level, state, ids, destination, axis).state;
  }
  state = tryMove(level, state, 'upright', 2, 'y').state;
  state = { ...tryMove(level, state, 'cross', 2, 'z').state, history: [], moves: 0 };
  const hint = getHint(level, state);
  assert.equal(hint?.axis, 'z');
  assert.equal(hint?.targetOffset, 2.5);
  assert.deepEqual(hint?.pieceIds, ['cross']);
  assert.equal(
    tryMove(level, state, hint!.pieceIds, hint!.targetOffset, hint!.axis).blocked,
    false,
  );
});

test('the short six-burr and the three-piece six-burr share a complete silhouette with four internal voids in the latter', () => {
  const occupiedCells = (level: Level) => {
    const cells = new Set<string>();
    for (const piece of level.pieces)
      for (const box of piece.boxes) {
        for (let x = box.min[0]; x < box.max[0]; x++)
          for (let y = box.min[1]; y < box.max[1]; y++)
            for (let z = box.min[2]; z < box.max[2]; z++) cells.add([x, y, z].join(','));
      }
    return cells;
  };
  const solid = occupiedCells(levels.find((level) => level.id === 'burr-short-6-v1')!);
  const threePiece = occupiedCells(
    levels.find((level) => level.id === 'knoxli-three-piece-2009-v1')!,
  );
  assert.equal(
    [...threePiece].every((cell) => solid.has(cell)),
    true,
  );
  const voids = [...solid].filter((cell) => !threePiece.has(cell));
  assert.equal(voids.length, 4);
  for (const cell of voids) {
    const position = cell.split(',').map(Number);
    for (let axis = 0; axis < 3; axis++)
      for (const sign of [-1, 1]) {
        const neighbor = position.map((value, index) => value + (index === axis ? sign : 0));
        assert.ok(solid.has(neighbor.join(',')), 'a void must be inside the target silhouette');
      }
  }
});

test('the beginner joint teaches contact, a single straight lift and a single return without groups or rotation', () => {
  const level = levels[0]!;
  const initial = createGame(level);
  const blocked = tryMove(level, initial, 'key', -1, 'y');
  assert.equal(
    blocked.blocked,
    true,
    'the lower bar explains why pushing down cannot separate the joint',
  );
  assert.equal(blocked.state, initial);
  const halfLift = tryMove(level, initial, 'key', 0.5, 'y').state;
  assert.equal(getProgress(level, halfLift).complete, false);
  const hint = getHint(level, halfLift)!;
  assert.deepEqual(hint.pieceIds, ['key']);
  assert.equal(hint.axis, 'y');
  assert.equal(hint.direction, 1);
  assert.notEqual(hint.kind, 'rotate');
  assert.equal(getProgress(level, applyHint(level, halfLift, hint)).complete, true);
  const separated = applyHint(level, initial, getHint(level, initial)!);
  assert.equal(separated.moves, 1);
  assert.equal(getProgress(level, separated).complete, true);
  const restoring = switchToReassembly(level, separated);
  const restored = applyHint(level, restoring, getHint(level, restoring)!);
  assert.equal(restored.moves, 2);
  assert.equal(getProgress(level, restored).complete, true);
  assert.deepEqual(restored.offsets, initial.offsets);
  assert.deepEqual(restored.orientations, initial.orientations);
});
