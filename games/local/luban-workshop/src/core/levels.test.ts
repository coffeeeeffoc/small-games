import test from 'node:test';
import assert from 'node:assert/strict';
import { levels } from '../levels/index.ts';
import { axisIndex, worldBox } from './collision.ts';
import { createGame, getProgress, tryMove } from './game.ts';
import { sweepMove } from './collision.ts';
import { getHint } from './hints.ts';
import type { GameState, Level } from './types.ts';

const levelById = (id: string): Level => levels.find((level) => level.id === id)!;
const canExtract = (level: Level, state: GameState, id: string): boolean => {
  const piece = level.pieces.find((candidate) => candidate.id === id)!;
  return piece.range.some(
    (target) =>
      Math.abs(sweepMove(level, state.offsets, id, target).actualOffset) >= piece.removedAt,
  );
};
const extractable = (level: Level, state: GameState) =>
  level.pieces.filter((piece) => canExtract(level, state, piece.id)).map((piece) => piece.id);

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
        ...piece.boxes.map((part) => worldBox(part, piece, piece.range[0]).max[axis]),
      );
      const positiveMin = Math.min(
        ...piece.boxes.map((part) => worldBox(part, piece, piece.range[1]).min[axis]),
      );
      assert.ok(negativeMax <= assemblyMin, `${level.id}/${piece.id} negative exit`);
      assert.ok(positiveMin >= assemblyMax, `${level.id}/${piece.id} positive exit`);
    }
  }
});

test('one key physically releases two independent branches', () => {
  const level = levelById('twin-forks');
  let state = createGame(level);
  assert.deepEqual(extractable(level, state), ['key']);
  state = tryMove(level, state, 'key', level.pieces[0]!.range[1]).state;
  assert.ok(canExtract(level, state, 'cross'));
  assert.ok(canExtract(level, state, 'upright'));
});

test('the shared gate requires both independent keys to clear its slots', () => {
  const level = levelById('twin-keys');
  const initial = createGame(level);
  assert.deepEqual(extractable(level, initial), ['key', 'cross']);
  for (const keyId of ['key', 'cross']) {
    const key = level.pieces.find((piece) => piece.id === keyId)!;
    const oneKeyOut = tryMove(level, initial, keyId, key.range[1]).state;
    assert.equal(canExtract(level, oneKeyOut, 'upright'), false);
  }
  const first = tryMove(level, initial, 'key', level.pieces[0]!.range[1]).state;
  const both = tryMove(level, first, 'cross', level.pieces[1]!.range[1]).state;
  assert.equal(canExtract(level, both, 'upright'), true);
});

test('the relay branch has a physical preferred exit direction', () => {
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
  test(`${id}: no full extraction is possible before a genuine clearing move`, () => {
    const level = levelById(id);
    const initial = createGame(level);
    assert.deepEqual(extractable(level, initial), []);
    const hint = getHint(level, initial);
    assert.ok(hint);
    const piece = level.pieces.find((candidate) => candidate.id === hint.pieceId)!;
    assert.ok(Math.abs(hint.targetOffset) > 0);
    assert.ok(Math.abs(hint.targetOffset) < piece.removedAt);
  });
}

test('the passing bridge must stop midway to open a different piece', () => {
  const level = levelById('passing-bridge');
  let state = tryMove(level, createGame(level), 'key', -2).state;
  const frame = tryMove(level, state, 'cross', level.pieces[1]!.range[1]);
  assert.equal(frame.actualOffset, 1);
  assert.equal(getProgress(level, frame.state).removed, 0);
  state = frame.state;
  assert.ok(canExtract(level, state, 'bridge'));
  assert.ok(canExtract(level, state, 'key'));
});

for (const id of ['opposing-frames', 'staggered-frames', 'master-workshop']) {
  test(`${id}: a complete solution uses both sides of the captive key`, () => {
    const level = levelById(id);
    let state = createGame(level);
    const keyPositions: number[] = [];
    for (let step = 0; step < 48 && !getProgress(level, state).complete; step++) {
      const hint = getHint(level, state);
      assert.ok(hint);
      state = tryMove(level, state, hint.pieceId, hint.targetOffset).state;
      keyPositions.push(state.offsets.key!);
    }
    assert.ok(getProgress(level, state).complete);
    assert.ok(state.moves > level.pieces.length);
    assert.ok(keyPositions.some((position) => position < 0));
    assert.ok(keyPositions.some((position) => position > 0));
  });
}
