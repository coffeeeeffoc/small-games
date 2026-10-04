import test from 'node:test';
import assert from 'node:assert/strict';
import { levels } from '../levels/index.ts';
import { axisIndex, boxesOverlap, isCollisionFree } from './collision.ts';
import { createGame, getProgress, switchToReassembly, tryMove } from './game.ts';
import type { Axis, Box, Level } from './types.ts';

const volumes = [31, 31, 104, 100, 54];
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

test('the catalog contains five distinct sourced complete mechanical puzzles with new save IDs', () => {
  assert.equal(levels.length, 5);
  assert.equal(new Set(levels.map((level) => level.id)).size, levels.length);
  assert.deepEqual(
    levels.map((level) => level.pieces.length),
    [6, 6, 6, 3, 3],
  );
  const signatures = new Set<string>();
  for (const level of levels) {
    assert.ok(level.id.endsWith('-v1'));
    assert.ok(level.source?.title && level.source.note);
    assert.equal(new URL(level.source.url).protocol, 'https:');
    assert.ok(level.chapter && level.mechanic && level.clue);
    const signature = JSON.stringify(level.pieces.map((piece) => piece.boxes));
    assert.ok(!signatures.has(signature), `${level.id} repeats another puzzle`);
    signatures.add(signature);
  }
});

test('every manufactured piece and complete assembly is face connected, disjoint and has the sourced material volume', () => {
  levels.forEach((level, index) => {
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
    assert.equal(
      level.pieces.flatMap((piece) => piece.boxes).reduce((total, box) => total + volume(box), 0),
      volumes[index],
    );
  });
});

// Independent, fixed witnesses exercise small clearing moves and rigid groups.
// They are proofs of playability, not a prescribed gameplay order or hint script.
type Step = readonly [readonly string[], Axis, number];
const routes: Record<string, readonly Step[]> = {
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
  const solid = occupiedCells(levels[2]!);
  const threePiece = occupiedCells(levels[3]!);
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
