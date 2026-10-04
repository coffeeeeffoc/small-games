import test from 'node:test';
import assert from 'node:assert/strict';
import { levels } from '../levels/index.ts';
import {
  createGame,
  applyHint,
  isIdentityOrientation,
  isCollisionFree,
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

// Mechanism-specific regressions keep their six-piece fixture when tutorials
// are inserted before the existing campaign.
const sixPieceLevel = levels.find((level) => level.id === 'burr-interlocking-6-v1')!;
// Retain the previous campaign's seeded regression poses, then exercise the
// new tutorial with the same sampler instead of shifting every existing case.
const samplingLevels = [
  ...levels.filter((level) => level.id !== 'first-lift-v1'),
  ...levels.filter((level) => level.id === 'first-lift-v1'),
];

function finish(level: Level, initial: GameState): GameState {
  let state = initial;
  for (let move = 0; move < 160 && !getProgress(level, state).complete; move++) {
    const hint = getHint(level, state);
    assert.ok(hint, `${level.id} has a continuation from ${JSON.stringify(state.offsets)}`);
    if (hint.kind === 'rotate') {
      const result = tryRotate(
        level,
        state,
        hint.pieceIds,
        hint.axis,
        hint.direction,
        hint.rotationDegrees,
      );
      assert.equal(result.blocked, false, 'rotation hints check the entire swept rotation');
      state = result.state;
      continue;
    }
    const result = tryMove(level, state, hint.pieceIds, hint.targetOffset, hint.axis);
    assert.ok(
      Math.abs(result.actualOffset - hint.targetOffset) < 1e-8,
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
  for (const level of samplingLevels) {
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
  for (const level of samplingLevels) {
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

test('each puzzle can reverse a partial dismantling and then resume dismantling', () => {
  for (const level of levels) {
    let state = createGame(level);
    const initialHint = getHint(level, state);
    assert.ok(initialHint && initialHint.kind !== 'rotate');
    state = tryMove(
      level,
      state,
      initialHint.pieceIds,
      // The introductory lock finishes in one full move. Stop its first drag
      // midway so it exercises the same unfinished-pose restoration contract.
      level.id === 'first-lift-v1' ? initialHint.targetOffset / 4 : initialHint.targetOffset,
      initialHint.axis,
    ).state;
    assert.equal(
      getProgress(level, state).complete,
      false,
      `${level.id}: this partial dismantling has not finished the puzzle`,
    );
    const restored = finish(level, switchToReassembly(level, state));
    assert.equal(getProgress(level, restored).assembled, level.pieces.length);
    finish(level, { ...restored, phase: 'disassemble' });
  }
});

test('one-click hints are one undoable action and refuse stale or blocked recommendations atomically', () => {
  const level = sixPieceLevel;
  const state = createGame(level);
  const hint = getHint(level, state)!;
  const moved = applyHint(level, state, hint);
  assert.notEqual(moved, state);
  assert.equal(moved.moves, state.moves + 1);
  assert.equal(moved.history.length, state.history.length + 1);
  assert.equal(
    applyHint(level, moved, hint),
    moved,
    'an ad-delayed hint cannot replay after a change',
  );
  const otherPhase = switchToReassembly(level, state);
  assert.equal(applyHint(level, otherPhase, hint), otherPhase);
  assert.equal(applyHint(level, state, { ...hint, pieceIds: ['unknown'] }), state);
  assert.equal(applyHint(level, state, { ...hint, targetOffset: NaN }), state);
  const blockedPiece = level.pieces.find((piece) => piece.id !== hint.pieceId)!;
  let foundBlocked = false;
  for (const axis of axes) {
    const target = 100;
    const attempt = tryMove(level, state, blockedPiece.id, target, axis);
    if (Math.abs(attempt.actualOffset - target) < 1e-5) continue;
    foundBlocked = true;
    assert.equal(
      applyHint(level, state, {
        pieceId: blockedPiece.id,
        pieceIds: [blockedPiece.id],
        axis,
        targetOffset: target,
        direction: 1,
        message: 'unreachable',
      }),
      state,
      'a partially blocked hint cannot commit a partial move',
    );
  }
  assert.ok(foundBlocked);
});

test('level guidance matches current position, phase and orientation with safe generic fallback', () => {
  const source = sixPieceLevel;
  const initial = createGame(source);
  const generic = getHint(source, initial)!;
  const level: Level = {
    ...source,
    hintRules: [
      {
        id: 'key-extraction',
        phase: 'disassemble',
        when: source.pieces.map((piece) => ({
          pieceId: piece.id,
          offset: [0, 0, 0],
          orientation: initial.orientations[piece.id],
        })),
        action: { ...generic, stateKey: undefined, message: '定制：先观察通钥的无缺口表面。' },
      },
    ],
  };
  const guided = getHint(level, initial)!;
  assert.match(guided.message, /^定制/);
  const partial = tryMove(
    level,
    initial,
    generic.pieceIds,
    generic.targetOffset / 2,
    generic.axis,
  ).state;
  assert.notEqual(partial, initial);
  assert.doesNotMatch(
    getHint(level, partial)!.message,
    /^定制/,
    'partial manual drag invalidates the exact pose rule',
  );
  finish(level, partial);
  const assembling = switchToReassembly(level, partial);
  const restore = getHint(level, assembling)!;
  const customRestore: Level = {
    ...level,
    hintRules: [
      {
        id: 'put-key-back',
        phase: 'reassemble',
        when: [{ pieceId: restore.pieceId, offset: assembling.offsets[restore.pieceId] }],
        action: { ...restore, stateKey: undefined, message: '定制：沿已经让出的槽口装回。' },
      },
    ],
  };
  assert.match(getHint(customRestore, assembling)!.message, /^定制/);
  const restored = finish(customRestore, assembling);
  assert.equal(getHint(customRestore, restored), null);
  const illegalRule: Level = {
    ...level,
    hintRules: [
      {
        id: 'invalid-piece',
        action: { ...generic, pieceId: 'missing', pieceIds: ['missing'], message: 'invalid' },
      },
    ],
  };
  assert.notEqual(getHint(illegalRule, initial)?.message, 'invalid');
  const wrongOrientation: Level = {
    ...level,
    hintRules: [
      {
        ...level.hintRules![0]!,
        when: [{ pieceId: generic.pieceId, orientation: quarterTurnOrientation('x', 1) }],
      },
    ],
  };
  assert.doesNotMatch(getHint(wrongOrientation, initial)!.message, /^定制/);
});

test('historyless reassembly recovers non-quarter and compound arbitrary-angle poses', () => {
  const source = sixPieceLevel;
  for (const angles of [[15], [30, 45, 22.5], [20, 90, 35], [-30, -90, 15]]) {
    const level = { ...source };
    let state: GameState = {
      ...createGame(level),
      phase: 'reassemble',
      moves: 1,
      offsets: Object.fromEntries(
        level.pieces.map((piece, i) => [piece.id, [40 + i * 30, 40, 40]]),
      ),
    };
    const id = level.pieces[0]!.id;
    for (const [i, angle] of angles.entries()) {
      const result = tryRotate(level, state, id, axes[i % 3]!, angle > 0 ? 1 : -1, Math.abs(angle));
      assert.equal(result.blocked, false);
      state = result.state;
    }
    state = { ...state, history: [], future: [] };
    for (let move = 0; move < 4 && !isIdentityOrientation(state.orientations[id]); move++) {
      const hint = getHint(level, state);
      assert.equal(hint?.kind, 'rotate');
      const next = applyHint(level, state, hint!);
      assert.notEqual(next, state);
      state = next;
    }
    assert.ok(isIdentityOrientation(state.orientations[id]));
    assert.ok(isCollisionFree(level, state.offsets, state.orientations));
    if (angles.length === 1) finish(level, state);
  }
});

test('oblique search sweeps preserve narrow clearances accepted by gameplay', () => {
  const level: Level = {
    id: 'oblique-search',
    title: '',
    subtitle: '',
    description: '',
    difficulty: '',
    estimatedMinutes: '',
    pieces: [
      { id: 'moving', boxes: [{ min: [-2, -0.2, -0.2], max: [2, 0.2, 0.2] }] },
      { id: 'fixed', boxes: [{ min: [1.2, -1.6, -0.2], max: [1.5, -1.3, 0.2] }] },
    ].map((piece) => ({
      ...piece,
      name: piece.id,
      color: '#fff',
      axis: 'z',
      range: [-10, 10],
      removedAt: 10,
    })),
  };
  const initial = createGame(level);
  const rotated = tryRotate(level, initial, 'moving', 'z', 1, 45);
  assert.equal(rotated.blocked, false);
  const state = rotated.state;
  const sweep = createSearchSweep(level);
  assert.equal(
    tryMove(level, state, 'moving', 4, 'z').actualOffset,
    4,
    'the other corner is clear despite overlapping enclosing boxes',
  );
  for (const ids of [['moving'], ['fixed'], ['moving', 'fixed']]) {
    for (const axis of axes) {
      for (const target of [-4, 0, 4]) {
        assert.equal(
          sweep(state.offsets, ids, target, axis, state.orientations),
          sweepMove(level, state.offsets, ids, target, axis, state.orientations).actualOffset,
        );
      }
    }
  }
});

test('custom rotations require a starting orientation and execute only once from that pose', () => {
  const source = sixPieceLevel;
  let state = createGame(source);
  const move = getHint(source, state)!;
  state = applyHint(source, state, move);
  state = switchToReassembly(source, state);
  const id = move.pieceId;
  const action = {
    kind: 'rotate' as const,
    pieceId: id,
    pieceIds: [id],
    axis: 'x' as const,
    direction: 1 as const,
    rotationDegrees: 15,
    targetOffset: 0,
    message: 'custom turn',
  };
  const unguarded: Level = {
    ...source,
    hintRules: [
      {
        id: 'unsafe-repeat',
        action,
        when: [{ pieceId: id, offset: state.offsets[id] }],
      },
    ],
  };
  assert.notEqual(getHint(unguarded, state)?.message, 'custom turn');
  const guarded: Level = {
    ...source,
    hintRules: [
      {
        id: 'angle-unlock',
        action,
        when: [{ pieceId: id, offset: state.offsets[id], orientation: state.orientations[id] }],
      },
    ],
  };
  const hint = getHint(guarded, state)!;
  assert.equal(hint.message, 'custom turn');
  const turned = applyHint(guarded, state, hint);
  assert.notEqual(turned, state);
  assert.notEqual(getHint(guarded, turned)?.message, 'custom turn');
});

test('a customized unlock waits for both independently angled structures', () => {
  const source: Level = {
    id: 'paired-angle-guidance',
    title: '',
    subtitle: '',
    description: '',
    difficulty: '',
    estimatedMinutes: '',
    pieces: ['a', 'b', 'key'].map((id, index) => ({
      id,
      name: id,
      color: '#fff',
      axis: 'y',
      range: [-10, 10],
      removedAt: 10,
      boxes: [{ min: [index * 10, 0, 0], max: [index * 10 + 2, 1, 1] }],
    })),
  };
  const start = createGame(source);
  const state: GameState = {
    ...start,
    phase: 'reassemble',
    moves: 1,
    offsets: { ...start.offsets, key: [0, 3, 0] },
  };
  const oneReady = tryRotate(source, state, 'a', 'z', 1, 15).state;
  const bothReady = tryRotate(source, oneReady, 'b', 'z', -1, 15).state;
  const level: Level = {
    ...source,
    hintRules: [
      {
        id: 'paired-unlock',
        phase: 'reassemble',
        when: [
          { pieceId: 'a', orientation: bothReady.orientations.a },
          { pieceId: 'b', orientation: bothReady.orientations.b },
          { pieceId: 'key', offset: [0, 3, 0] },
        ],
        action: {
          pieceId: 'key',
          pieceIds: ['key'],
          axis: 'y',
          targetOffset: 0,
          direction: -1,
          message: '两个角度都对齐，现在可以推进锁钥。',
        },
      },
    ],
  };
  assert.doesNotMatch(getHint(level, state)?.message ?? '', /两个角度/);
  assert.doesNotMatch(
    getHint(level, oneReady)?.message ?? '',
    /两个角度/,
    'one aligned structure does not satisfy the combined gate',
  );
  const hint = getHint(level, bothReady)!;
  assert.match(hint.message, /两个角度/);
  const next = applyHint(level, bothReady, hint);
  assert.notEqual(next, bothReady);
  assert.deepEqual(next.offsets.key, [0, 0, 0]);
  assert.ok(isCollisionFree(level, next.offsets, next.orientations));
});
