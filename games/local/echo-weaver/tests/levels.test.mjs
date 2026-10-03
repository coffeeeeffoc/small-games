import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../levels.mjs';
import { createState, simulate, validateLevel, placePiece, removePiece } from '../engine.mjs';

function solvedState(level) {
  const state = createState(level);
  return {
    ...state,
    pieces: state.pieces.map((piece) => ({
      ...piece,
      ...level.solution.find((pose) => pose.id === piece.id),
    })),
  };
}
const ticks = (report) => report.arrivals.map((arrival) => arrival.tick);
const byId = (id) => LEVELS.find((level) => level.id === id);

for (const level of LEVELS) {
  test(`${level.id}: valid, initially unsolved, and constructible with its finite inventory`, () => {
    assert.deepEqual(validateLevel(level), []);
    assert.equal(simulate(level, createState(level)).won, false);
    const report = simulate(level, solvedState(level));
    assert.equal(report.won, true, JSON.stringify(report.failures));
    assert.deepEqual(ticks(report), level.targets);
    assert.deepEqual(report.failures, []);
    assert.equal(report.emittedBranches, level.targets.length);
    assert.ok(report.arrivals.every((arrival) => arrival.energy >= level.minEnergy));
  });
}

test('first lesson has a connected path that fails specifically because it arrives early', () => {
  const level = byId('grid-detour');
  const direct = simulate(level, createState(level));
  assert.deepEqual(ticks(direct), [6]);
  assert.deepEqual(direct.failures, []);
  assert.equal(direct.arrivals[0].matched, false);
  const detour = simulate(level, solvedState(level));
  assert.deepEqual(ticks(detour), [12]);
  assert.equal(detour.won, true);
});

test('shared-wait starts with three complete paths but two wrong arrival times', () => {
  const level = byId('grid-shared-wait');
  const report = simulate(level, createState(level));
  assert.deepEqual(ticks(report), [8, 12, 20]);
  assert.deepEqual(report.failures, []);
  assert.equal(report.emittedBranches, 3);
  assert.equal(report.won, false);
});

test('a delay before, between, or after forks changes three, two, or one arrival respectively', () => {
  const level = byId('grid-shared-wait');
  const withoutDelay = removePiece(level, solvedState(level), 'shared-delay');
  assert.deepEqual(ticks(simulate(level, withoutDelay)), [8, 14, 22]);

  const beforeFirst = placePiece(level, withoutDelay, 'shared-delay', 2, 4);
  assert.deepEqual(ticks(simulate(level, beforeFirst)), [10, 16, 24]);
  assert.equal(simulate(level, beforeFirst).won, false);

  const betweenForks = placePiece(level, withoutDelay, 'shared-delay', 4, 3);
  assert.deepEqual(ticks(simulate(level, betweenForks)), [8, 16, 24]);
  assert.equal(simulate(level, betweenForks).won, true);

  const oneBranch = placePiece(level, withoutDelay, 'shared-delay', 5, 0);
  assert.deepEqual(ticks(simulate(level, oneBranch)), [8, 16, 22]);
  assert.equal(simulate(level, oneBranch).won, false);
});

test('the shared-delay puzzle also requires rebuilding paths, not merely finding one delay slot', () => {
  const level = byId('grid-shared-wait');
  const initial = createState(level);
  for (let y = 0; y < level.rows; y += 1) {
    for (let x = 0; x < level.cols; x += 1) {
      const candidate = placePiece(level, initial, 'shared-delay', x, y);
      assert.equal(
        simulate(level, candidate).won,
        false,
        `Single placement unexpectedly solves at ${x},${y}`,
      );
    }
  }
});

for (const id of ['grid-shared-wait', 'grid-first-share']) {
  test(`${id}: rotating the starting pieces cannot replace rebuilding the circuit`, () => {
    const level = byId(id);
    const initial = createState(level);
    const rotatable = initial.pieces.filter(
      (piece) => piece.type !== 'delay' && piece.x !== null && piece.y !== null,
    );
    assert.ok(rotatable.length >= 4, 'The circuit must retain several movable decisions.');

    for (let mask = 0; mask < 2 ** rotatable.length; mask += 1) {
      const candidate = {
        ...initial,
        pieces: initial.pieces.map((piece) => {
          const index = rotatable.findIndex((item) => item.id === piece.id);
          return index < 0
            ? { ...piece }
            : {
                ...piece,
                orientation: mask & (1 << index) ? '\\' : '/',
              };
        }),
      };
      assert.equal(
        simulate(level, candidate).won,
        false,
        `Rotation combination ${mask} unexpectedly solves without moving a piece`,
      );
    }
  });
}

test('the last puzzle starts with correct timing and fails only from the long branch energy', () => {
  const level = byId('grid-first-share');
  const original = simulate(level, createState(level));
  assert.deepEqual(
    original.failures.map((failure) => failure.reason),
    ['weak'],
  );
  assert.ok(Number.isFinite(original.failures[0].energy));
  assert.ok(original.failures[0].energy < level.minEnergy);
  assert.deepEqual(ticks(original), [8, 12]);

  const withoutAbsorber = { ...level, absorbers: [] };
  const timed = simulate(withoutAbsorber, createState(withoutAbsorber));
  assert.deepEqual(ticks(timed), [8, 12, 20]);
  assert.equal(timed.won, true);

  const rebuilt = simulate(level, solvedState(level));
  assert.equal(rebuilt.won, true);
  assert.deepEqual(ticks(rebuilt), [8, 12, 20]);
  assert.ok(rebuilt.arrivals[2].energy > timed.arrivals[2].energy);
});

test('authored solutions are fixtures and cannot influence the runtime result', () => {
  for (const level of LEVELS) {
    const state = solvedState(level);
    const { solution, ...unassistedLevel } = level;
    assert.ok(solution.length > 0);
    assert.deepEqual(simulate(unassistedLevel, state), simulate(level, state));
  }
});
