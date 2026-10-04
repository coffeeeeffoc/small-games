import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  EPSILON,
  getHint,
  getProgress,
  IDENTITY_ORIENTATION,
  isCollisionFree,
  isPieceAssembled,
  pieceBounds,
  quarterTurnOrientation,
  rotationOrientation,
  relativeAxisRotation,
  validOrientation,
  sweepRotation,
  redo,
  restoreGame,
  serializeGame,
  switchPhase,
  tryMove,
  tryRotate,
  undo,
} from './index.ts';
import type { Box, Level, Vec3 } from './types.ts';

function fixture(boxes: Box[]): Level {
  return {
    id: 'rotation-fixture',
    title: 'Rotation',
    subtitle: '',
    description: '',
    difficulty: '',
    estimatedMinutes: '',
    pieces: boxes.map((box, i) => ({
      id: String(i),
      name: String(i),
      color: '#eee',
      axis: 'x',
      boxes: [box],
      range: [-6, 6],
      removedAt: 6,
    })),
  };
}
const rod: Box = { min: [-2, -0.25, -0.25], max: [2, 0.25, 0.25] };

test('quarter turns update real geometry and four turns close exactly without drift', () => {
  const level = fixture([rod]);
  const initial = createGame(level);
  let state = initial;
  for (const axis of ['x', 'y', 'z'] as const) {
    for (let i = 0; i < 4; i++) {
      const result = tryRotate(level, state, '0', axis, 1);
      assert.equal(result.blocked, false);
      state = result.state;
    }
    assert.deepEqual(state.offsets, initial.offsets);
    assert.deepEqual(state.orientations, initial.orientations);
  }
  const vertical = tryRotate(level, initial, '0', 'z', 1).state;
  assert.deepEqual(
    pieceBounds(level.pieces[0]!, vertical.offsets['0']!, vertical.orientations['0']),
    {
      min: [-0.25, -2, -0.25],
      max: [0.25, 2, 0.25],
    },
  );
  assert.equal(state.moves, 12);
});

test('rigid selected pieces rotate around their shared center with one undo step', () => {
  const level = fixture([
    { min: [-3, -0.5, -0.5], max: [-2, 0.5, 0.5] },
    { min: [2, -0.5, -0.5], max: [3, 0.5, 0.5] },
  ]);
  const initial = createGame(level);
  const result = tryRotate(level, initial, ['0', '1'], 'z', 1);
  assert.equal(result.blocked, false);
  assert.deepEqual(result.pivot, [0, 0, 0]);
  assert.deepEqual(result.state.offsets, { '0': [2.5, -2.5, 0], '1': [-2.5, 2.5, 0] });
  assert.equal(result.state.moves, 1);
  assert.deepEqual(undo(result.state), {
    ...initial,
    future: [{ offsets: result.state.offsets, orientations: result.state.orientations, moves: 1 }],
  });
  assert.deepEqual(redo(undo(result.state)), result.state);
  assert.deepEqual(restoreGame(level, serializeGame(result.state)), result.state);
  const reversed = tryRotate(level, result.state, ['0', '1'], 'z', -1).state;
  assert.deepEqual(reversed.offsets, initial.offsets);
  assert.deepEqual(reversed.orientations, initial.orientations);
});

test('continuous rotation cannot tunnel through a thin obstacle between legal endpoints', () => {
  const level = fixture([rod, { min: [1.11, 1.11, -0.1], max: [1.12, 1.12, 0.1] }]);
  const initial = createGame(level);
  const finalOrientations = { ...initial.orientations, '0': quarterTurnOrientation('z', 1) };
  assert.ok(isCollisionFree(level, initial.offsets, initial.orientations));
  assert.ok(isCollisionFree(level, initial.offsets, finalOrientations));
  const result = tryRotate(level, initial, '0', 'z', 1);
  assert.equal(result.state, initial);
  assert.equal(result.blocked, true);
  assert.deepEqual(result.blockedBy, ['1']);
  assert.equal(
    restoreGame(
      level,
      serializeGame({
        ...initial,
        orientations: finalOrientations,
        moves: 1,
        history: [{ offsets: initial.offsets, orientations: initial.orientations, moves: 0 }],
      }),
    ),
    null,
  );
});

test('translation and save validation use rotated material rather than original boxes', () => {
  const level = fixture([rod, { min: [4, 1, -1], max: [5, 2, 1] }]);
  const initial = createGame(level);
  assert.equal(tryMove(level, initial, '0', 10, 'x').blocked, false);
  const rotated = tryRotate(level, initial, '0', 'z', 1).state;
  const moved = tryMove(level, rotated, '0', 10, 'x');
  assert.equal(moved.blocked, true);
  assert.equal(moved.actualOffset, 3.75);
  assert.deepEqual(moved.blockedBy, ['1']);
  assert.ok(isCollisionFree(level, moved.state.offsets, moved.state.orientations));
  for (const saved of [rotated, moved.state, undo(moved.state)])
    assert.deepEqual(restoreGame(level, serializeGame(saved)), saved);
});

test('reassembly checks orientation while accepting a symmetric equivalent seat', () => {
  const level = fixture([rod]);
  const initial = createGame(level);
  assert.equal(getProgress(level, switchPhase(level, initial, 'reassemble')).complete, false);
  const upright = tryRotate(level, initial, '0', 'z', 1).state;
  const reassembling = switchPhase(level, upright, 'reassemble');
  assert.equal(reassembling.moves, 1);
  assert.equal(reassembling.history.length, 1);
  assert.equal(getProgress(level, reassembling).assembled, 0);
  assert.equal(getProgress(level, reassembling).complete, false);
  const reversed = tryRotate(level, reassembling, '0', 'z', -1).state;
  assert.ok(getProgress(level, reversed).complete);
  assert.ok(isPieceAssembled(level.pieces[0]!, [0, 0, 0], quarterTurnOrientation('x', 1)));
  assert.equal(switchPhase(level, upright, 'reassemble').offsets, upright.offsets);
});

test('drag roundoff within positional tolerance does not amplify into a volume mismatch', () => {
  const level = fixture([{ min: [-4, -1, -1], max: [4, 1, 1] }]);
  const initial = createGame(level);
  const offset: Vec3 = [9.098539770491243e-7, 3.3e-7, -1.5e-7];
  const symmetry = quarterTurnOrientation('x', 1);
  assert.ok(isPieceAssembled(level.pieces[0]!, offset, IDENTITY_ORIENTATION));
  assert.ok(isPieceAssembled(level.pieces[0]!, offset, symmetry));
  assert.ok(isPieceAssembled(level.pieces[0]!, [EPSILON, 0, 0], symmetry));
  assert.equal(isPieceAssembled(level.pieces[0]!, [EPSILON * 1.1, 0, 0], symmetry), false);
  const seated = {
    ...initial,
    phase: 'reassemble' as const,
    moves: 1,
    offsets: { '0': offset },
    orientations: { '0': symmetry },
  };
  assert.equal(getProgress(level, seated).assembled, 1);
  assert.equal(getProgress(level, seated).complete, true);
  assert.equal(
    getHint(level, seated),
    null,
    'equivalent seated geometry never gets a corrective rotation or detour',
  );
});

test('rotation saves reject reflections, malformed orientations and forged combined translation/rotation', () => {
  const level = fixture([rod]);
  const initial = createGame(level);
  for (const value of [null, [], [1, 0, 0, 0, 1, 0, 0, 0, -1], [1, 1, 0, 0, 1, 0, 0, 0, 1]]) {
    const save = JSON.parse(serializeGame(initial));
    save.state.orientations['0'] = value;
    assert.equal(restoreGame(level, JSON.stringify(save)), null);
  }
  const forged = {
    ...initial,
    offsets: { '0': [1, 0, 0] as Vec3 },
    orientations: { '0': quarterTurnOrientation('z', 1) },
    moves: 1,
    history: [{ offsets: initial.offsets, orientations: initial.orientations, moves: 0 }],
  };
  assert.equal(restoreGame(level, serializeGame(forged)), null);
});

test('version 2 positions migrate to identity orientations throughout undo history', () => {
  const level = fixture([rod]);
  const moved = tryMove(level, createGame(level), '0', 5, 'y').state;
  const payload = JSON.parse(serializeGame(moved));
  payload.version = 2;
  delete payload.state.orientations;
  for (const previous of payload.state.history) delete previous.orientations;
  const restored = restoreGame(level, JSON.stringify(payload));
  assert.deepEqual(restored, moved);
  assert.deepEqual(restored!.history[0]!.orientations['0'], IDENTITY_ORIENTATION);
});

test('integer-matrix saves retain the full 2,000-action allowance with six-piece orientation snapshots', () => {
  const level = fixture(
    Array.from({ length: 6 }, (_, i) => ({
      min: [i * 3, 0, 0] as Vec3,
      max: [i * 3 + 1, 1, 1] as Vec3,
    })),
  );
  const ids = level.pieces.map((piece) => piece.id);
  let state = createGame(level);
  for (let action = 0; action < 2_000; action++) {
    state =
      action % 4 === 0
        ? tryRotate(level, state, ids, 'z', 1).state
        : tryMove(level, state, ids, state.offsets['0']![0] + (action % 2 ? 1 : -1), 'x').state;
  }
  const raw = serializeGame(state);
  assert.equal(state.history.length, 2_000);
  assert.ok(raw.length > 400_000, 'a supported v3 timeline exceeds the obsolete v2 byte allowance');
  assert.ok(raw.length < 2_000_000);
  assert.deepEqual(restoreGame(level, raw), state);
  assert.equal(restoreGame(level, ' '.repeat(2_000_001)), null);
});

test('invalid rotation requests cannot mutate game state', () => {
  const level = fixture([rod]);
  const state = createGame(level);
  for (const ids of [[], ['missing'], ['0', 'missing']])
    assert.equal(tryRotate(level, state, ids, 'x', 1).state, state);
  assert.equal(tryRotate(level, state, '0', 'x', 0 as 1).state, state);
});

test('partial turns use all eight corners for bounds and close after a full revolution', () => {
  const level = fixture([rod]);
  const initial = createGame(level);
  const turned = tryRotate(level, initial, '0', 'z', 1, 45);
  assert.equal(turned.blocked, false);
  const bounds = pieceBounds(
    level.pieces[0]!,
    turned.state.offsets['0']!,
    turned.state.orientations['0'],
  );
  const extent = 2.25 / Math.sqrt(2);
  assert.ok(Math.abs(bounds.max[0] - extent) < EPSILON);
  assert.ok(Math.abs(bounds.max[1] - extent) < EPSILON);
  assert.equal(
    isPieceAssembled(level.pieces[0]!, [0, 0, 0], turned.state.orientations['0']),
    false,
  );
  let state = initial;
  for (let i = 0; i < 24; i++) state = tryRotate(level, state, '0', 'z', 1, 15).state;
  assert.deepEqual(state.offsets, initial.offsets);
  assert.deepEqual(state.orientations, initial.orientations);
  assert.equal(state.moves, 24);
});

test('oblique material can clear overlapping bounds and translates to exact oriented contact', () => {
  const level = fixture([
    { min: [-2, -0.1, -0.1], max: [2, 0.1, 0.1] },
    { min: [0.7, -0.8, -0.05], max: [0.8, -0.7, 0.05] },
  ]);
  const initial = createGame(level);
  const turned = tryRotate(level, initial, '0', 'z', 1, 45);
  assert.equal(turned.blocked, false, 'AABB overlap alone must not forbid a legal oblique pose');
  assert.ok(isCollisionFree(level, turned.state.offsets, turned.state.orientations));
  const moved = tryMove(level, turned.state, '0', 3, 'x');
  assert.equal(moved.blocked, true);
  assert.ok(Math.abs(moved.actualOffset - (1.4 - 0.1 * Math.sqrt(2))) < EPSILON);
  assert.ok(isCollisionFree(level, moved.state.offsets, moved.state.orientations));
  assert.deepEqual(restoreGame(level, serializeGame(moved.state)), moved.state);
});

test('partial-turn swept collision catches a thin obstacle between clear endpoints', () => {
  const level = fixture([
    { min: [-2, -0.01, -0.05], max: [2, 0.01, 0.05] },
    { min: [1.4, 0.12, -0.01], max: [1.42, 0.13, 0.01] },
  ]);
  const initial = createGame(level);
  const finalOrientations = { ...initial.orientations, '0': rotationOrientation('z', 1, 15) };
  assert.ok(isCollisionFree(level, initial.offsets, finalOrientations));
  const turn = tryRotate(level, initial, '0', 'z', 1, 15);
  assert.equal(turn.blocked, true);
  assert.deepEqual(turn.blockedBy, ['1']);
  const forged = {
    ...initial,
    orientations: finalOrientations,
    moves: 1,
    history: [{ offsets: initial.offsets, orientations: initial.orientations, moves: 0 }],
  };
  assert.equal(restoreGame(level, serializeGame(forged)), null);
});

test('asymmetric selected centers give inverse partial turns a stable pivot and exact undo', () => {
  const level = fixture([
    { min: [-4, -0.2, -0.2], max: [-2, 0.2, 0.2] },
    { min: [1, 1, -0.2], max: [1.5, 2, 0.2] },
    { min: [3, -3, -0.2], max: [4, -2, 0.2] },
  ]);
  const initial = createGame(level);
  const ids = level.pieces.map((piece) => piece.id);
  const turned = tryRotate(level, initial, ids, 'z', 1, 15).state;
  const returned = tryRotate(level, turned, ids, 'z', -1, 15).state;
  for (const id of ids) {
    assert.ok(returned.offsets[id]!.every((value) => Math.abs(value) < EPSILON));
    assert.deepEqual(returned.orientations[id], initial.orientations[id]);
  }
  assert.equal(returned.moves, 2);
  assert.deepEqual(redo(undo(turned)), turned);
  assert.deepEqual(restoreGame(level, serializeGame(returned)), returned);
});

test('mixed-axis fractional histories survive v4 undo/redo and infer their inverse turn', () => {
  const level = fixture([rod]);
  const initial = createGame(level);
  let state = tryRotate(level, initial, '0', 'z', 1, 15).state;
  state = tryRotate(level, state, '0', 'y', -1, 30).state;
  state = tryRotate(level, state, '0', 'x', 1, 5).state;
  assert.ok(validOrientation(state.orientations['0']));
  const inverse = relativeAxisRotation(
    state.orientations['0']!,
    state.history.at(-1)!.orientations['0']!,
  );
  assert.equal(inverse?.axis, 'x');
  assert.equal(inverse?.direction, -1);
  assert.ok(Math.abs(inverse!.degrees - 5) < EPSILON);
  for (const saved of [state, undo(state), undo(undo(state))]) {
    assert.equal(JSON.parse(serializeGame(saved)).version, 4);
    assert.deepEqual(restoreGame(level, serializeGame(saved)), saved);
  }
  for (const degrees of [0, -15, NaN, Infinity, 181])
    assert.equal(tryRotate(level, initial, '0', 'x', 1, degrees).state, initial);
});

test('legacy v3 bounding-center group turns retain a valid timeline after v4 migration', () => {
  const level = fixture([
    { min: [-4, 0, 0], max: [-2, 1, 1] },
    { min: [1, 1, 0], max: [2, 3, 1] },
    { min: [4, -2, 0], max: [5, -1, 1] },
  ]);
  const initial = createGame(level);
  const result = sweepRotation(
    level,
    initial.offsets,
    initial.orientations,
    ['0', '1', '2'],
    'z',
    1,
    90,
    [0.5, 0.5, 0.5],
  );
  assert.equal(result.blocked, false);
  const legacy = {
    ...initial,
    offsets: result.offsets,
    orientations: result.orientations,
    moves: 1,
    history: [{ offsets: initial.offsets, orientations: initial.orientations, moves: 0 }],
  };
  const restored = restoreGame(level, JSON.stringify({ version: 3, state: legacy }));
  assert.deepEqual(restored, legacy);
  assert.deepEqual(restoreGame(level, serializeGame(restored!)), legacy);
});

test('v4 preserves the 2,000-action allowance for larger fractional orientation histories', () => {
  const level = fixture(
    Array.from({ length: 6 }, (_, i) => ({
      min: [i * 3, 0, 0] as Vec3,
      max: [i * 3 + 1, 1, 1] as Vec3,
    })),
  );
  const ids = level.pieces.map((piece) => piece.id);
  let state = createGame(level);
  for (let step = 0; step < 2_000; step++)
    state = tryRotate(level, state, ids, (['x', 'y', 'z'] as const)[step % 3]!, 1, 15).state;
  assert.equal(state.moves, 2_000);
  const raw = serializeGame(state);
  assert.ok(
    raw.length > 2_000_000,
    'fractional matrices exceed the previous integer-only byte budget',
  );
  assert.deepEqual(restoreGame(level, raw), state);
  assert.equal(restoreGame(level, ' '.repeat(8_000_001)), null);
});
