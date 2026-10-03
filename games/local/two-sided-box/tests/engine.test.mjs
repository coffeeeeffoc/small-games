import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../levels.mjs';
import {
  createState,
  moveShaft,
  toggleLatch,
  flipView,
  releaseBall,
  advanceBall,
  getGateStatus,
  getBlockingReason,
  getSnapshot,
  validateLevel,
} from '../engine.mjs';

const clone = (value) => structuredClone(value);
const apply = (level, state, action) => {
  switch (action.type) {
    case 'flip':
      return flipView(state);
    case 'shaft':
      return moveShaft(level, state, action.id, action.value);
    case 'latch':
      return toggleLatch(
        level,
        state,
        action.id,
        level.latches.find((latch) => latch.id === action.id)?.side,
      );
    case 'release':
      return releaseBall(level, state);
    case 'advance':
      return advanceBall(level, state);
    default:
      throw new Error(`Unknown action: ${action.type}`);
  }
};

/**
 * An independent finite-state search: it evaluates data conditions itself and
 * never calls the engine under test to generate transitions. Counters are not
 * part of physical state, so flip loops cannot grow the search indefinitely.
 */
function solveIndependently(level, { freezeAfterRelease = false } = {}) {
  const initial = {
    side: 'front',
    positions: level.shafts.map((shaft) => shaft.initial),
    locks: level.latches.map((latch) => latch.initial),
    released: false,
    checkpoint: 0,
  };
  const shaftIndex = new Map(level.shafts.map((shaft, index) => [shaft.id, index]));
  const gateMap = new Map(level.gates.map((gate) => [gate.id, gate]));
  const key = (state) =>
    [
      state.side,
      state.positions.join(','),
      state.locks.map(Number).join(''),
      Number(state.released),
      state.checkpoint,
    ].join('|');
  const nodes = [{ state: initial, parent: -1, action: null }];
  const seen = new Set([key(initial)]);
  for (let cursor = 0; cursor < nodes.length; cursor += 1) {
    const { state } = nodes[cursor];
    if (state.checkpoint === level.checkpoints.length) {
      const actions = [];
      for (let index = cursor; nodes[index].parent !== -1; index = nodes[index].parent)
        actions.unshift(nodes[index].action);
      return { solvable: true, actions, explored: nodes.length };
    }
    const candidates = [];
    const flipped = clone(state);
    flipped.side = state.side === 'front' ? 'back' : 'front';
    candidates.push([flipped, { type: 'flip' }]);

    if (!freezeAfterRelease || !state.released) {
      for (const [index, shaft] of level.shafts.entries()) {
        const locked = level.latches.some(
          (latch, lockIndex) => latch.shaft === shaft.id && state.locks[lockIndex],
        );
        if (locked) continue;
        for (let value = shaft.min; value <= shaft.max; value += 1) {
          if (value === state.positions[index]) continue;
          const next = clone(state);
          next.positions[index] = value;
          candidates.push([next, { type: 'shaft', id: shaft.id, value }]);
        }
      }
    }
    for (const [index, latch] of level.latches.entries()) {
      if (latch.side !== state.side) continue;
      const aligned = (latch.releaseWhen ?? []).every((condition) =>
        condition.positions.includes(state.positions[shaftIndex.get(condition.shaft)]),
      );
      if (state.locks[index] && !aligned) continue;
      const next = clone(state);
      next.locks[index] = !next.locks[index];
      candidates.push([next, { type: 'latch', id: latch.id }]);
    }
    if (!state.released && state.side === 'front') {
      const next = clone(state);
      next.released = true;
      candidates.push([next, { type: 'release' }]);
    }
    if (state.released) {
      const checkpoint = level.checkpoints[state.checkpoint];
      const allOpen = checkpoint.gateIds.every((id) => {
        const gate = gateMap.get(id);
        return gate.positions.includes(state.positions[shaftIndex.get(gate.shaft)]);
      });
      if (allOpen) {
        const next = clone(state);
        next.checkpoint += 1;
        candidates.push([next, { type: 'advance' }]);
      }
    }
    for (const [next, action] of candidates) {
      const nextKey = key(next);
      if (seen.has(nextKey)) continue;
      seen.add(nextKey);
      nodes.push({ state: next, parent: cursor, action });
    }
  }
  return { solvable: false, actions: [], explored: nodes.length };
}

test('six data-defined levels have valid schemas and stable unique ids', () => {
  assert.equal(LEVELS.length, 6);
  assert.equal(new Set(LEVELS.map((level) => level.id)).size, LEVELS.length);
  for (const level of LEVELS) {
    assert.deepEqual(validateLevel(level), { valid: true, errors: [] }, level.id);
    assert.deepEqual(level.path[0], [70, 120]);
    assert.deepEqual(level.path.at(-1), [625, 515]);
    assert.deepEqual(level.checkpoints.at(-1), { pathIndex: level.path.length - 1, gateIds: [] });
  }
});

for (const level of LEVELS) {
  test(`independent search solves box ${level.number} and replays through the real engine`, () => {
    const result = solveIndependently(level);
    assert.equal(result.solvable, true, level.id);
    assert.ok(result.explored < 10000, 'Search stays finite without relying on action counters.');
    const state = createState(level);
    for (const action of result.actions) {
      assert.equal(apply(level, state, action).ok, true, `${level.id}: ${JSON.stringify(action)}`);
    }
    assert.equal(state.completed, true);
    assert.equal(state.checkpoint, level.checkpoints.length);
  });

  test(`authored walkthrough for box ${level.number} succeeds with its advertised move count`, () => {
    const state = createState(level);
    for (const action of level.solution) {
      const result = apply(level, state, action);
      assert.equal(result.ok, true, `${level.id}: ${JSON.stringify(action)}: ${result.message}`);
    }
    assert.equal(state.completed, true);
    assert.equal(state.moves, level.estimatedMoves);
    assert.equal(state.flips, 0, 'Both faces can be operated without switching views.');
    assert.equal(state.side, 'front', 'Operating a rear latch keeps the front ball accessible.');
    assert.equal(getSnapshot(level, state).ballPathIndex, level.path.length - 1);
  });
}

test('boxes 1–3 permit preparation; boxes 4–6 require repositioning while the ball is on the route', () => {
  for (const level of LEVELS) {
    const result = solveIndependently(level, { freezeAfterRelease: true });
    assert.equal(result.solvable, level.number <= 3, level.id);
  }
});

test('conditional lock cycle with no aligned entry point is genuinely unwinnable', () => {
  const deadlocked = clone(LEVELS[5]);
  deadlocked.latches.find((latch) => latch.id === 'lock-C').releaseWhen = [
    { shaft: 'A', positions: [2] },
  ];
  assert.equal(validateLevel(deadlocked).valid, true);
  const result = solveIndependently(deadlocked);
  assert.equal(result.solvable, false);
  assert.ok(result.explored < 10);
});

test('flipping changes visibility and counters, never mechanisms, barrier states, or ball progress', () => {
  const level = LEVELS[5];
  const state = createState(level);
  const physical = (candidate) => ({
    shafts: clone(candidate.shafts),
    latches: clone(candidate.latches),
    released: candidate.released,
    checkpoint: candidate.checkpoint,
    completed: candidate.completed,
    gates: level.gates.map((gate) => getGateStatus(level, candidate, gate.id).open),
  });
  const before = physical(state);
  flipView(state);
  assert.equal(state.side, 'back');
  assert.deepEqual(physical(state), before);
  flipView(state);
  assert.equal(state.side, 'front');
  assert.deepEqual(physical(state), before);
  assert.equal(state.flips, 2);
});

test('a locked shaft cannot move on either side, and a wrong-side latch cannot be operated', () => {
  const level = LEVELS[0];
  const state = createState(level);
  const before = clone(state);
  assert.equal(moveShaft(level, state, 'A', 2).ok, false);
  assert.equal(toggleLatch(level, state, 'lock-A').ok, false);
  assert.deepEqual(state, before);
  flipView(state);
  const backBefore = clone(state);
  assert.equal(moveShaft(level, state, 'A', 2).ok, false);
  assert.deepEqual(state, backBefore);
  assert.equal(toggleLatch(level, state, 'lock-A').ok, true);
  assert.equal(moveShaft(level, state, 'A', 2).ok, true);
});

test('alignment conditions are shared across views and cannot be bypassed by toggling', () => {
  const level = LEVELS[2];
  const state = createState(level);
  flipView(state);
  const before = clone(state);
  assert.equal(toggleLatch(level, state, 'lock-A').ok, false);
  assert.deepEqual(state, before);
  assert.equal(getSnapshot(level, state).latches[0].canRelease, false);
  assert.equal(moveShaft(level, state, 'B', 1).ok, true);
  assert.equal(getSnapshot(level, state).latches[0].canRelease, true);
  assert.equal(toggleLatch(level, state, 'lock-A').ok, true);
  assert.equal(toggleLatch(level, state, 'lock-A').ok, true, 'A released latch can be re-engaged.');
  assert.equal(
    moveShaft(level, state, 'A', 2).ok,
    false,
    'Re-engaging restores the mechanical lock.',
  );
});

test('opposite roles use one shaft: high opens the front but closes the back, middle opens both', () => {
  const level = LEVELS[1];
  const state = createState(level);
  flipView(state);
  toggleLatch(level, state, 'lock-A');
  moveShaft(level, state, 'A', 2);
  assert.equal(getGateStatus(level, state, 'door-A').open, true);
  assert.equal(getGateStatus(level, state, 'panel-A').open, false);
  moveShaft(level, state, 'A', 1);
  assert.equal(getGateStatus(level, state, 'door-A').open, true);
  assert.equal(getGateStatus(level, state, 'panel-A').open, true);
});

test('ball waits at a blocked rear gate, can recover, and completes only on exit arrival', () => {
  const level = LEVELS[3];
  const state = createState(level);
  flipView(state);
  assert.equal(releaseBall(level, state).ok, false);
  toggleLatch(level, state, 'lock-A');
  moveShaft(level, state, 'A', 2);
  flipView(state);
  releaseBall(level, state);
  assert.equal(getSnapshot(level, state).ballPathIndex, 1);
  advanceBall(level, state);
  assert.equal(state.checkpoint, 1);
  assert.equal(getSnapshot(level, state).ballPathIndex, 5);
  const before = clone(state);
  assert.equal(advanceBall(level, state).ok, false);
  assert.deepEqual(state, before);
  assert.match(getBlockingReason(level, state), /背面.*低位/);
  moveShaft(level, state, 'A', 0);
  assert.equal(advanceBall(level, state).ok, true);
  assert.equal(
    state.completed,
    false,
    'Passing the last gate is distinct from arriving at the exit.',
  );
  assert.equal(getSnapshot(level, state).ballPathIndex, level.path.length - 1);
  assert.equal(advanceBall(level, state).ok, true);
  assert.equal(state.completed, true);
});

test('invalid detents, missing mechanisms, and premature advancement do not change state', () => {
  const level = LEVELS[0];
  const state = createState(level);
  const before = clone(state);
  for (const action of [
    { type: 'shaft', id: 'A', value: 0.5 },
    { type: 'shaft', id: 'A', value: 3 },
    { type: 'shaft', id: 'missing', value: 1 },
    { type: 'latch', id: 'missing' },
    { type: 'advance' },
  ]) {
    assert.equal(apply(level, state, action).ok, false);
    assert.deepEqual(state, before);
  }
});

test('a seventh box can extend detents and conditions without changing engine code', () => {
  const extended = clone(LEVELS[0]);
  extended.id = 'extension-fixture';
  extended.shafts[0].max = 3;
  extended.shafts[0].notches = ['低', '中', '高', '顶'];
  extended.gates[0].positions = [3];
  assert.equal(validateLevel(extended).valid, true);
  const result = solveIndependently(extended);
  assert.equal(result.solvable, true);
  const state = createState(extended);
  for (const action of result.actions) assert.equal(apply(extended, state, action).ok, true);
  assert.equal(state.completed, true);
});

test('schema validation identifies bad references and refuses an incomplete exit', () => {
  const broken = clone(LEVELS[0]);
  broken.latches[0].shaft = 'missing';
  broken.gates[0].positions = [5];
  broken.checkpoints.pop();
  const result = validateLevel(broken);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 3);
  assert.throws(() => createState(broken), /无效关卡/);
});
