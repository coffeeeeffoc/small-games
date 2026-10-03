import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState,
  canPlace,
  placePiece,
  rotatePiece,
  removePiece,
  simulate,
  validateLevel,
} from '../engine.mjs';

const mirror = (id, x, y, orientation = '/') => ({ id, type: 'mirror', x, y, orientation });
const splitter = (id, x, y, orientation = '/') => ({ id, type: 'splitter', x, y, orientation });
const delay = (id, x, y, delayTicks = 2) => ({ id, type: 'delay', x, y, delayTicks });
const fixture = (overrides = {}) => ({
  id: 'physics-test',
  cols: 7,
  rows: 5,
  source: { x: 0, y: 2, dir: 'E' },
  receiver: { x: 6, y: 2 },
  targets: [6],
  ticksPerBeat: 4,
  beatMs: 800,
  sourceEnergy: 240,
  minEnergy: 12,
  travelLoss: 1,
  reflectionLoss: 2,
  splitterLoss: 2,
  delayLoss: 1,
  maxTicks: 100,
  walls: [],
  absorbers: [],
  fixed: [],
  inventory: [],
  ...overrides,
});
const twoRoutes = (overrides = {}) =>
  fixture({
    targets: [6, 10],
    fixed: [splitter('split', 2, 2), mirror('top-left', 2, 0), mirror('top-right', 6, 0, '\\')],
    ...overrides,
  });
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test('adjacent travel defines arrival time and consumes energy independently of sound playback', () => {
  const level = fixture();
  const result = simulate(level, createState(level));
  assert.equal(result.won, true);
  assert.deepEqual(
    result.arrivals.map(({ tick, energy }) => ({ tick, energy })),
    [{ tick: 6, energy: 234 }],
  );
  assert.equal(result.segments.length, 6);
  assert.equal(result.targetResults[0].arrival, result.arrivals[0]);
  const fasterAudio = { ...level, beatMs: 320 };
  assert.deepEqual(simulate(fasterAudio, createState(fasterAudio)), result);
});

test('reflectors route one pulse around a corner; rotation changes actual connectivity', () => {
  const level = fixture({ receiver: { x: 3, y: 0 }, targets: [5], inventory: [mirror('m', 3, 2)] });
  const original = freeze(createState(level));
  const correct = simulate(level, original);
  assert.equal(correct.won, true);
  assert.equal(correct.arrivals[0].energy, 233);
  const turned = rotatePiece(level, original, 'm');
  assert.equal(turned.pieces[0].orientation, '\\');
  assert.equal(original.pieces[0].orientation, '/');
  assert.equal(simulate(level, turned).won, false);
  assert.ok(simulate(level, turned).failures.some((failure) => failure.reason === 'escaped'));
});

test('a split uses real route lengths, conserves energy after splitting loss, and arrives chronologically', () => {
  const level = twoRoutes();
  const result = simulate(level, createState(level));
  assert.equal(result.won, true);
  assert.equal(result.emittedBranches, 2);
  assert.deepEqual(
    result.arrivals.map(({ tick, energy }) => ({ tick, energy })),
    [
      { tick: 6, energy: 114 },
      { tick: 10, energy: 106 },
    ],
  );
  assert.deepEqual(
    result.targetResults.map((target) => target.status),
    ['hit', 'hit'],
  );
  const changedTiming = { ...level, targets: [7, 11] };
  const mistimed = simulate(changedTiming, createState(changedTiming));
  assert.equal(mistimed.won, false);
  assert.equal(mistimed.arrivals.length, 2, 'Both physical routes still connect');
  assert.equal(mistimed.failures.length, 0);
  assert.deepEqual(
    mistimed.targetResults.map((target) => target.status),
    ['miss', 'miss'],
  );
});

test('delay chambers wait in place and pay per-tick energy without adding travel distance', () => {
  const level = twoRoutes();
  const without = simulate(level, createState(level));
  const delayed = { ...level, targets: [8, 10], fixed: [...level.fixed, delay('wait', 4, 2)] };
  const result = simulate(delayed, createState(delayed));
  assert.equal(result.won, true);
  assert.equal(result.arrivals[0].tick - without.arrivals[0].tick, 2);
  assert.equal(without.arrivals[0].energy - result.arrivals[0].energy, 2);
  assert.equal(
    result.segments.filter((segment) => segment.kind === 'travel').length,
    without.segments.length,
  );
  const hold = result.segments.find((segment) => segment.kind === 'hold');
  assert.deepEqual(hold.from, hold.to);
  assert.equal(hold.end - hold.start, 2);
  assert.equal(hold.pieceId, 'wait');
});

test('crossing paths remain independent, with no collision or false loop detection', () => {
  const level = fixture({
    rows: 6,
    source: { x: 0, y: 3, dir: 'E' },
    receiver: { x: 4, y: 5 },
    targets: [10, 12],
    fixed: [
      splitter('s', 2, 3),
      mirror('a', 6, 3, '\\'),
      mirror('b', 6, 5),
      mirror('c', 2, 1),
      mirror('d', 4, 1, '\\'),
      delay('wait', 3, 1),
    ],
  });
  const result = simulate(level, createState(level));
  assert.equal(result.won, true);
  const crossing = result.segments.filter((segment) => segment.to.x === 4 && segment.to.y === 3);
  assert.equal(crossing.length, 2);
  assert.notEqual(crossing[0].branchId, crossing[1].branchId);
  assert.deepEqual(
    result.arrivals.map((arrival) => arrival.tick),
    [10, 12],
  );
});

test('a too-quiet route cannot be discarded even when every listed target is hit', () => {
  const level = twoRoutes({ targets: [6], absorbers: [{ x: 4, y: 0, loss: 100 }] });
  const result = simulate(level, createState(level));
  assert.equal(result.targetResults[0].status, 'hit');
  assert.equal(result.won, false);
  assert.ok(result.failures.some((failure) => failure.reason === 'weak'));
});

test('extra audible arrivals invalidate a solution instead of being ignored', () => {
  const level = twoRoutes({ targets: [6] });
  const result = simulate(level, createState(level));
  assert.equal(result.arrivals.length, 2);
  assert.equal(result.arrivals[0].matched, true);
  assert.equal(result.arrivals[1].matched, false);
  assert.equal(result.arrivals[1].targetIndex, -1);
  assert.equal(result.won, false);
});

test('reflection, absorption, and splitting all respect the minimum audible energy', () => {
  const reflected = fixture({
    sourceEnergy: 15,
    minEnergy: 12,
    receiver: { x: 1, y: 0 },
    targets: [3],
    fixed: [mirror('m', 1, 2)],
  });
  const reflectedResult = simulate(reflected, createState(reflected));
  assert.equal(reflectedResult.won, false);
  assert.equal(reflectedResult.failures[0].reason, 'weak');
  const split = twoRoutes({ sourceEnergy: 27, minEnergy: 12 });
  const splitResult = simulate(split, createState(split));
  assert.equal(splitResult.arrivals.length, 0);
  assert.equal(splitResult.failures.length, 2);
  assert.ok(splitResult.failures.every((failure) => failure.reason === 'weak'));
  const absorbed = fixture({ absorbers: [{ x: 3, y: 2, loss: 230 }] });
  assert.equal(simulate(absorbed, createState(absorbed)).failures[0].reason, 'weak');
});

test('walls stop propagation while absorber floor can hold a piece', () => {
  const level = fixture({
    walls: [{ x: 3, y: 2 }],
    absorbers: [{ x: 2, y: 1, loss: 30 }],
    inventory: [mirror('m', null, null)],
  });
  const state = createState(level);
  const result = simulate(level, state);
  assert.equal(result.won, false);
  assert.equal(result.failures[0].reason, 'wall');
  assert.equal(result.failures[0].tick, 3);
  assert.equal(canPlace(level, state, 'm', 3, 2), false);
  assert.equal(canPlace(level, state, 'm', 2, 1), true);
});

test('returning pulses cannot trigger the source again', () => {
  // A rectangular route enters the source again from its left.
  const returnLevel = fixture({
    source: { x: 2, y: 2, dir: 'E' },
    receiver: { x: 6, y: 0 },
    targets: [10],
    fixed: [mirror('a', 4, 2, '\\'), mirror('b', 4, 4), mirror('c', 0, 4, '\\'), mirror('d', 0, 2)],
  });
  const returned = simulate(returnLevel, createState(returnLevel));
  assert.ok(returned.failures.some((failure) => failure.reason === 'source'));
  assert.equal(returned.emittedBranches, 1);
});

test('feedback loops terminate deterministically instead of generating endless echoes', () => {
  const level = fixture({
    fixed: [
      splitter('s', 2, 2),
      mirror('a', 4, 2, '\\'),
      mirror('b', 4, 4),
      mirror('c', 2, 4, '\\'),
    ],
    receiver: { x: 6, y: 0 },
    travelLoss: 0,
    reflectionLoss: 0,
    splitterLoss: 0,
  });
  const result = simulate(level, createState(level));
  assert.ok(result.failures.some((failure) => failure.reason === 'loop'));
  assert.ok(result.segments.length < 50);
  assert.deepEqual(simulate(level, createState(level)), result);
});

test('branch and clock limits bound pathological layouts', () => {
  const cascade = fixture({
    cols: 35,
    rows: 3,
    source: { x: 0, y: 1, dir: 'E' },
    receiver: { x: 34, y: 1 },
    sourceEnergy: 2 ** 35,
    minEnergy: 0.000001,
    travelLoss: 0,
    reflectionLoss: 0,
    splitterLoss: 0,
    targets: [34],
    fixed: Array.from({ length: 30 }, (_, i) => splitter(`s${i}`, i + 1, 1)),
  });
  const branches = simulate(cascade, createState(cascade));
  assert.equal(branches.emittedBranches, 24);
  assert.ok(branches.failures.some((failure) => failure.reason === 'overload'));
  assert.ok(branches.segments.length < 100);
  const timeout = twoRoutes({ maxTicks: 8, targets: [6, 8] });
  const result = simulate(timeout, createState(timeout));
  assert.ok(result.failures.some((failure) => failure.reason === 'overload' && failure.tick === 8));
  assert.ok(result.segments.every((segment) => segment.end <= 8));
});

test('drag, rotate, and return-to-tray edits are immutable and enforce board occupancy', () => {
  const level = freeze(
    fixture({
      walls: [{ x: 1, y: 0 }],
      fixed: [mirror('fixed', 2, 0)],
      inventory: [mirror('m', null, null), splitter('s', 3, 3), delay('d', null, null)],
    }),
  );
  const state = freeze(createState(level));
  const placed = placePiece(level, state, 'm', 3, 2);
  assert.notEqual(placed, state);
  assert.equal(state.pieces[0].x, null);
  assert.equal(placed.pieces[0].x, 3);
  assert.equal(placePiece(level, placed, 'm', 3, 2), placed);
  for (const [x, y] of [
    [0, 2],
    [6, 2],
    [1, 0],
    [2, 0],
    [3, 3],
    [-1, 0],
    [7, 0],
    [0.5, 1],
  ]) {
    assert.equal(canPlace(level, state, 'm', x, y), false, `${x},${y}`);
    assert.equal(placePiece(level, state, 'm', x, y), state);
  }
  assert.equal(placePiece(level, state, 'fixed', 4, 4), state);
  assert.equal(rotatePiece(level, state, 'fixed'), state);
  assert.equal(removePiece(level, state, 'fixed'), state);
  assert.equal(rotatePiece(level, state, 'd'), state);
  const rotated = rotatePiece(level, placed, 'm');
  assert.equal(rotated.pieces[0].orientation, '\\');
  const removed = removePiece(level, rotated, 'm');
  assert.equal(removed.pieces[0].x, null);
  assert.equal(removed.pieces[0].y, null);
  assert.equal(removed.pieces[0].orientation, '\\');
  assert.equal(removePiece(level, removed, 'm'), removed);
});

test('simulation is pure and never reads an authored solution', () => {
  const level = twoRoutes();
  Object.defineProperty(level, 'solution', {
    get() {
      throw new Error('Solutions are not game logic.');
    },
  });
  const state = freeze(createState(level));
  Object.freeze(level);
  assert.equal(simulate(level, state).won, true);
  assert.equal(state.pieces.length, 0);
});

test('schema errors are diagnostics rather than exceptions for malformed author data', () => {
  for (const level of [
    null,
    {},
    fixture({ walls: {} }),
    fixture({ fixed: {} }),
    fixture({ inventory: [null] }),
  ]) {
    assert.ok(validateLevel(level).length > 0);
  }
  const invalid = fixture({
    targets: [4, 4],
    source: { x: 0, y: 2, dir: 'UP' },
    fixed: [mirror('same', 1, 1)],
    inventory: [mirror('same', 1, 1), delay('bad-delay', null, null, -1)],
    absorbers: [{ x: 99, y: 0, loss: -2 }],
  });
  const errors = validateLevel(invalid);
  assert.ok(errors.some((error) => error.includes('Targets')));
  assert.ok(errors.some((error) => error.includes('direction')));
  assert.ok(errors.some((error) => error.includes('unique')));
  assert.ok(errors.some((error) => error.includes('overlaps')));
  assert.ok(errors.some((error) => error.includes('delayTicks')));
  assert.throws(() => createState(invalid), TypeError);
});

test('forged state cannot overlap pieces or change the inventory budget', () => {
  const level = fixture({ inventory: [mirror('m', null, null)] });
  const state = createState(level);
  assert.throws(() => simulate(level, { pieces: [] }), TypeError);
  assert.throws(() => simulate(level, { pieces: [{ ...state.pieces[0], x: 0, y: 2 }] }), TypeError);
  assert.throws(
    () => simulate(level, { pieces: [{ ...state.pieces[0], type: 'splitter' }] }),
    TypeError,
  );
  assert.throws(
    () => simulate(level, { pieces: [{ ...state.pieces[0], orientation: 'vertical' }] }),
    TypeError,
  );
});
