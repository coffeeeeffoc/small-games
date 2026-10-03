import test from 'node:test';
import assert from 'node:assert/strict';
import { levels } from '../levels/index.ts';
import { axisIndex, isCollisionFree, worldBox } from './collision.ts';
import { createGame, getProgress, tryMove } from './game.ts';
import { sweepMove } from './collision.ts';
import type { Axis, GameState, Level, Vec3 } from './types.ts';

const axisOffset = (axis: Axis, offset: number): Vec3 =>
  [0, 1, 2].map((index) => (index === axisIndex(axis) ? offset : 0)) as unknown as Vec3;

// These probes deliberately choose a presentation axis. They describe one
// geometric route, never the complete set of legal multi-axis/group moves.
const levelById = (id: string): Level => levels.find((level) => level.id === id)!;
const reachesPreferredExit = (level: Level, state: GameState, id: string): boolean => {
  const piece = level.pieces.find((candidate) => candidate.id === id)!;
  return piece.range.some(
    (target) =>
      Math.abs(sweepMove(level, state.offsets, id, target, piece.axis).actualOffset) >=
      piece.removedAt,
  );
};
const preferredExits = (level: Level, state: GameState) =>
  level.pieces
    .filter((piece) => reachesPreferredExit(level, state, piece.id))
    .map((piece) => piece.id);

test('the workshop has twenty distinct assemblies in four chapters of five', () => {
  assert.equal(levels.length, 20);
  assert.equal(new Set(levels.map((level) => level.id)).size, 20);
  const chapters = new Map<string, number>();
  const geometry = new Set<string>();
  for (const level of levels) {
    assert.ok(level.chapter && level.mechanic && level.clue);
    chapters.set(level.chapter, (chapters.get(level.chapter) ?? 0) + 1);
    assert.ok(level.pieces.length >= 3 && level.pieces.length <= 6);
    // Ignore titles, colors and IDs: cosmetic changes cannot count as a new assembly.
    const signature = JSON.stringify(
      level.pieces
        .map((piece) => ({
          axis: piece.axis,
          boxes: piece.boxes.map((part) => JSON.stringify(part)).sort(),
        }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    );
    assert.ok(!geometry.has(signature), `${level.id} repeats another assembly`);
    geometry.add(signature);
  }
  assert.equal(chapters.size, 4);
  assert.deepEqual([...chapters.values()], [5, 5, 5, 5]);
});

test('authored endpoint distances clear the entire original assembly in both directions', () => {
  // Preserve the three published geometries, also reused as the six-link chain.
  for (const level of levels.filter(
    (candidate) => !['first-key', 'cross-roads', 'five-links', 'six-links'].includes(candidate.id),
  )) {
    for (const piece of level.pieces) {
      const axis = axisIndex(piece.axis);
      const allBoxes = level.pieces.flatMap((part) => part.boxes);
      const assemblyMin = Math.min(...allBoxes.map((part) => part.min[axis]));
      const assemblyMax = Math.max(...allBoxes.map((part) => part.max[axis]));
      const negativeMax = Math.max(
        ...piece.boxes.map(
          (part) => worldBox(part, piece, axisOffset(piece.axis, piece.range[0])).max[axis],
        ),
      );
      const positiveMin = Math.min(
        ...piece.boxes.map(
          (part) => worldBox(part, piece, axisOffset(piece.axis, piece.range[1])).min[axis],
        ),
      );
      assert.ok(negativeMax <= assemblyMin, `${level.id}/${piece.id} negative exit`);
      assert.ok(positiveMin >= assemblyMax, `${level.id}/${piece.id} positive exit`);
    }
  }
});

test('the preferred-axis route releases two independent branches', () => {
  const level = levelById('twin-forks');
  let state = createGame(level);
  assert.deepEqual(preferredExits(level, state), ['key']);
  state = tryMove(level, state, 'key', level.pieces[0]!.range[1]).state;
  assert.ok(reachesPreferredExit(level, state, 'cross'));
  assert.ok(reachesPreferredExit(level, state, 'upright'));
});

test('straight travel along the gate axis clears after both key slots open', () => {
  const level = levelById('twin-keys');
  const initial = createGame(level);
  assert.deepEqual(preferredExits(level, initial), ['key', 'cross']);
  for (const keyId of ['key', 'cross']) {
    const key = level.pieces.find((piece) => piece.id === keyId)!;
    const oneKeyOut = tryMove(level, initial, keyId, key.range[1]).state;
    assert.equal(reachesPreferredExit(level, oneKeyOut, 'upright'), false);
  }
  const first = tryMove(level, initial, 'key', level.pieces[0]!.range[1]).state;
  const both = tryMove(level, first, 'cross', level.pieces[1]!.range[1]).state;
  assert.equal(reachesPreferredExit(level, both, 'upright'), true);
});

test('the relay branch has different clearance in the two preferred-axis directions', () => {
  const level = levelById('fork-relay');
  const state = tryMove(level, createGame(level), 'key', level.pieces[0]!.range[1]).state;
  const branch = level.pieces.find((piece) => piece.id === 'upright')!;
  const wrongWay = sweepMove(level, state.offsets, branch.id, branch.range[1]);
  assert.equal(wrongWay.actualOffset, 0);
  assert.ok(wrongWay.blockedBy.includes('bridge'));
  assert.equal(
    sweepMove(level, state.offsets, branch.id, branch.range[0]).actualOffset,
    branch.range[0],
  );
});

for (const id of ['captive-key', 'passing-bridge', 'return-before-release']) {
  test(`${id}: the preferred-axis route starts with a local clearing move`, () => {
    const level = levelById(id);
    const initial = createGame(level);
    assert.deepEqual(preferredExits(level, initial), []);
    const result = tryMove(level, initial, 'key', -2, 'x');
    assert.equal(result.actualOffset, -2);
    assert.ok(Math.abs(result.actualOffset) < level.pieces[0]!.removedAt);
    assert.ok(isCollisionFree(level, result.state.offsets));
  });
}

test('moving the passing bridge one unit offers a new preferred-axis opening', () => {
  const level = levelById('passing-bridge');
  let state = tryMove(level, createGame(level), 'key', -2, 'x').state;
  const frame = tryMove(level, state, 'cross', level.pieces[1]!.range[1], 'y');
  assert.equal(frame.actualOffset, 1);
  assert.equal(getProgress(level, frame.state).removed, 0);
  state = frame.state;
  assert.ok(reachesPreferredExit(level, state, 'bridge'));
  assert.ok(reachesPreferredExit(level, state, 'key'));
});

const preferredRoutes: Record<string, readonly (readonly [string, number])[]> = {
  'opposing-frames': [
    ['key', -1],
    ['cross', -2],
    ['bridge', -9],
    ['cross', 7],
    ['key', 2],
    ['upright', 7],
    ['key', 8],
    ['fork', 9],
  ],
  'staggered-frames': [
    ['key', 1],
    ['upright', 1],
    ['fork', 9],
    ['upright', -7],
    ['crown', -9],
    ['key', -1],
    ['cross', -7],
    ['key', 8],
    ['bridge', 9],
  ],
  'master-workshop': [
    ['key', -1],
    ['cross', -2],
    ['bridge', -9],
    ['cross', 8],
    ['crown', 12],
    ['key', 2],
    ['upright', 8],
    ['key', 9],
    ['fork', 9],
  ],
};
for (const [id, route] of Object.entries(preferredRoutes)) {
  test(`${id}: a reversible preferred-axis route can use both sides of the key`, () => {
    const level = levelById(id);
    let state = createGame(level);
    const reverse: { id: string; axis: Axis; offset: number }[] = [];
    const keyPositions: number[] = [];
    for (const [pieceId, target] of route) {
      const piece = level.pieces.find((candidate) => candidate.id === pieceId)!;
      reverse.push({
        id: pieceId,
        axis: piece.axis,
        offset: state.offsets[pieceId]![axisIndex(piece.axis)],
      });
      const result = tryMove(level, state, pieceId, target, piece.axis);
      assert.equal(result.actualOffset, target);
      assert.ok(isCollisionFree(level, result.state.offsets));
      state = result.state;
      keyPositions.push(state.offsets.key![0]);
    }
    assert.ok(keyPositions.some((position) => position < 0));
    assert.ok(keyPositions.some((position) => position > 0));
    for (const piece of level.pieces) {
      assert.ok(Math.abs(state.offsets[piece.id]![axisIndex(piece.axis)]) >= piece.removedAt);
    }
    // Returning along the same legal path is still available. The references
    // above are layout metadata, not the game's relative-separation win rule.
    for (const step of reverse.reverse()) {
      const result = tryMove(level, state, step.id, step.offset, step.axis);
      assert.equal(result.actualOffset, step.offset);
      state = result.state;
    }
    assert.deepEqual(state.offsets, createGame(level).offsets);
  });
}

test('the captive-key lesson also permits a clear sideways route', () => {
  const level = levelById('captive-key');
  const result = tryMove(level, createGame(level), 'key', -6, 'z');
  assert.equal(result.blocked, false);
  assert.deepEqual(result.state.offsets.key, [0, 0, -6]);
  assert.ok(isCollisionFree(level, result.state.offsets));
});

test('the six-piece finale remains freely movable as one rigid group', () => {
  const level = levelById('master-workshop');
  const ids = level.pieces.map((piece) => piece.id);
  let state = createGame(level);
  for (const axis of ['x', 'y', 'z'] as const) {
    const result = tryMove(level, state, ids, 20, axis);
    assert.equal(result.blocked, false);
    assert.equal(result.actualOffset, 20);
    state = result.state;
  }
  assert.ok(isCollisionFree(level, state.offsets));
  assert.equal(getProgress(level, state).complete, false);
  for (const id of ids) assert.deepEqual(state.offsets[id], [20, 20, 20]);
});
