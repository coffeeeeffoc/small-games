import test from 'node:test';
import assert from 'node:assert/strict';
import { levels } from './fixtures/legacy-levels.ts';
import { axisIndex, isCollisionFree } from './collision.ts';
import { createGame, switchToReassembly, tryMove, undo } from './game.ts';
import { restoreGame, serializeGame } from './persistence.ts';
import type { GameState, Level, Offsets, Snapshot } from './types.ts';

const level = levels[0]!;
const barrierLevel: Level = {
  ...level,
  id: 'persistence-barrier',
  pieces: [
    { ...level.pieces[0]!, id: 'a', axis: 'x', boxes: [{ min: [0, 0, 0], max: [1, 1, 1] }] },
    { ...level.pieces[1]!, id: 'b', axis: 'y', boxes: [{ min: [0, 2, 0], max: [1, 3, 1] }] },
    { ...level.pieces[2]!, id: 'wall', axis: 'z', boxes: [{ min: [2, 0, 0], max: [3, 3, 1] }] },
  ],
};

function legacySave(state: GameState): string {
  const scalarSnapshot = (snapshot: Snapshot) => ({
    moves: snapshot.moves,
    offsets: Object.fromEntries(
      level.pieces.map((piece) => [piece.id, snapshot.offsets[piece.id]![axisIndex(piece.axis)]]),
    ),
  });
  return JSON.stringify({
    version: 1,
    state: {
      ...state,
      ...scalarSnapshot(state),
      history: state.history.map(scalarSnapshot),
      future: state.future.map(scalarSnapshot),
    },
  });
}

function removedState(): GameState {
  let state = createGame(level);
  for (const piece of level.pieces) state = tryMove(level, state, piece.id, -6).state;
  return state;
}

function step(offsets: Offsets): GameState {
  const initial = createGame(barrierLevel);
  return {
    ...initial,
    offsets,
    moves: 1,
    history: [{ offsets: initial.offsets, orientations: initial.orientations, moves: 0 }],
  };
}

test('version 1 saves migrate each scalar to its original piece axis, including undo and redo', () => {
  for (const state of [createGame(level), removedState(), undo(removedState())]) {
    assert.deepEqual(restoreGame(level, legacySave(state)), state);
  }
});

test('version 1 reassembly saves retain their phase and reverse movement timeline', () => {
  let state = switchToReassembly(level, removedState());
  assert.equal(state.phase, 'reassemble');
  for (const piece of level.pieces.slice().reverse())
    state = tryMove(level, state, piece.id, 0).state;
  for (const saved of [state, undo(state)]) {
    const restored = restoreGame(level, legacySave(saved));
    assert.deepEqual(restored, saved);
    assert.equal(JSON.parse(serializeGame(restored!)).version, 3);
  }
});

test('version 1 rejects out-of-range scalars and histories impossible under the legacy rules', () => {
  const initial = JSON.parse(legacySave(createGame(level)));
  for (const value of [6.1, -6.1, null, '0', [0, 0, 0]]) {
    const bad = structuredClone(initial);
    bad.state.offsets.key = value;
    assert.equal(restoreGame(level, JSON.stringify(bad)), null);
  }
  const jumped = structuredClone(initial);
  jumped.state.history = [{ offsets: initial.state.offsets, moves: 0 }];
  jumped.state.offsets = { key: 0, cross: -6, upright: 0 };
  jumped.state.moves = 1;
  assert.equal(restoreGame(level, JSON.stringify(jumped)), null);
  const simultaneous = structuredClone(jumped);
  simultaneous.state.offsets = { key: -6, cross: -6, upright: 0 };
  assert.equal(restoreGame(level, JSON.stringify(simultaneous)), null);
});

test('version 2 round-trips sideways rigid groups with undo and redo', () => {
  let state = tryMove(level, createGame(level), ['key', 'cross'], -4, 'x').state;
  assert.equal(state.moves, 1);
  state = tryMove(level, state, ['key', 'cross'], -3, 'y').state;
  assert.equal(state.moves, 2);
  for (const saved of [state, undo(state), undo(undo(state))]) {
    assert.deepEqual(restoreGame(level, serializeGame(saved)), saved);
  }
});

test('restored snapshots own separate vector copies', () => {
  const state = tryMove(level, createGame(level), 'key', -2).state;
  const restored = restoreGame(level, serializeGame(state))!;
  assert.notEqual(restored.offsets.cross, restored.history[0]!.offsets.cross);
  assert.notEqual(restored.offsets.key, state.offsets.key);
  (restored.offsets.cross as number[])[0] = 99;
  assert.deepEqual(restored.history[0]!.offsets.cross, [0, 0, 0]);
  assert.deepEqual(state.offsets.cross, [0, 0, 0]);
});

test('version 2 rejects malformed, missing, extra, non-finite, and colliding vectors', () => {
  const initial = createGame(level);
  for (const value of [
    0,
    '0',
    null,
    [],
    [0, 0],
    [0, 0, 0, 0],
    [0, '0', 0],
    [NaN, 0, 0],
    [Infinity, 0, 0],
  ]) {
    const payload = {
      version: 2,
      state: { ...initial, offsets: { ...initial.offsets, key: value } },
    };
    assert.equal(restoreGame(level, JSON.stringify(payload)), null);
  }
  const { key: _key, ...missing } = initial.offsets;
  for (const offsets of [missing, { ...initial.offsets, surprise: [0, 0, 0] }]) {
    assert.equal(restoreGame(level, serializeGame({ ...initial, offsets })), null);
  }
  assert.equal(
    restoreGame(
      level,
      serializeGame({ ...initial, offsets: { ...initial.offsets, cross: [0, 0.25, 0] } }),
    ),
    null,
  );
});

test('version 2 accepts finite free-space coordinates beyond the legacy ranges', () => {
  const state = tryMove(level, createGame(level), ['key', 'cross', 'upright'], 10000, 'x').state;
  assert.deepEqual(restoreGame(level, serializeGame(state)), state);
  const distant = {
    ...createGame(level),
    offsets: { key: [0, 1e40, 0], cross: [0, 0, 0], upright: [0, 0, 0] },
  } as GameState;
  assert.deepEqual(restoreGame(level, serializeGame(distant)), distant);
});

test('group history cannot tunnel through an obstacle despite collision-free endpoints', () => {
  const state = step({ a: [4, 0, 0], b: [4, 0, 0], wall: [0, 0, 0] });
  assert.ok(isCollisionFree(barrierLevel, state.offsets));
  assert.equal(restoreGame(barrierLevel, serializeGame(state)), null);
  const legal = step({ a: [1, 0, 0], b: [1, 0, 0], wall: [0, 0, 0] });
  assert.deepEqual(restoreGame(barrierLevel, serializeGame(legal)), legal);
});

test('history requires one rigid delta on exactly one axis', () => {
  const malformed: Offsets[] = [
    { a: [-2, 0, 0], b: [-3, 0, 0], wall: [0, 0, 0] },
    { a: [-1, -1, 0], b: [0, 0, 0], wall: [0, 0, 0] },
    { a: [-1, 0, 0], b: [0, 1, 0], wall: [0, 0, 0] },
    { a: [0, 0, 0], b: [0, 0, 0], wall: [0, 0, 0] },
  ];
  for (const offsets of malformed) {
    assert.ok(isCollisionFree(barrierLevel, offsets));
    assert.equal(restoreGame(barrierLevel, serializeGame(step(offsets))), null);
  }
});

test('finite coordinates cannot conceal an overflowing movement delta', () => {
  const solo = { ...barrierLevel, pieces: barrierLevel.pieces.slice(0, 1) };
  const initial = createGame(solo);
  const state: GameState = {
    ...initial,
    offsets: { a: [Number.MAX_VALUE, 0, 0] },
    moves: 1,
    history: [
      { offsets: { a: [-Number.MAX_VALUE, 0, 0] }, orientations: initial.orientations, moves: 0 },
    ],
  };
  assert.equal(restoreGame(solo, serializeGame(state)), null);
});

test('malformed versions, metadata, oversized payloads and broken move counts are rejected', () => {
  const initial = createGame(level);
  for (const raw of ['not json', '{}', ' '.repeat(400001)])
    assert.equal(restoreGame(level, raw), null);
  for (const version of [0, 4, '2', null]) {
    assert.equal(restoreGame(level, JSON.stringify({ version, state: initial })), null);
  }
  for (const metadata of [
    { levelId: 'other' },
    { phase: 'other' },
    { moves: -1 },
    { moves: 0.5 },
    { moves: '0' },
    { moves: Number.MAX_SAFE_INTEGER + 1 },
    { history: {} },
    { future: null },
    {
      history: Array.from({ length: 2001 }, () => ({
        offsets: initial.offsets,
        orientations: initial.orientations,
        moves: 0,
      })),
    },
  ]) {
    assert.equal(
      restoreGame(level, JSON.stringify({ version: 2, state: { ...initial, ...metadata } })),
      null,
    );
  }
  const moved = tryMove(level, initial, 'key', -2).state;
  assert.equal(restoreGame(level, serializeGame({ ...moved, moves: 3 })), null);
  const badFuture = {
    ...initial,
    future: [{ offsets: moved.offsets, orientations: moved.orientations, moves: 4 }],
  };
  assert.equal(restoreGame(level, serializeGame(badFuture)), null);
});
