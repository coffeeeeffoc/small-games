import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, CHAPTERS } from '../levels.mjs';
import {
  createState,
  viewFace,
  revealFace,
  moveShaft,
  toggleLatch,
  releaseBall,
  advanceBall,
  validateLevel,
  getSnapshot,
} from '../engine.mjs';
import { getGateGeometry } from '../geometry.mjs';
import { solveIndependently } from './level-solver.mjs';

const FACES = ['front', 'back', 'top', 'bottom', 'left', 'right'];
const PAIRS = FACES.flatMap((face, index) => FACES.slice(index + 1).map((other) => [face, other]));
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const delta = (a, b) => a.map((value, index) => value - b[index]);
function apply(level, state, action) {
  switch (action.type) {
    case 'view':
      return viewFace(state, action.face);
    case 'reveal':
      return revealFace(state, action.face);
    case 'shaft':
      return moveShaft(level, state, action.id, action.value);
    case 'latch':
      return toggleLatch(level, state, action.id);
    case 'release':
      return releaseBall(level, state);
    case 'advance':
      return advanceBall(level, state);
    default:
      throw new Error(`Unknown action ${action.type}`);
  }
}
function replayIndependent(level, result) {
  const state = createState(level, { initialFaces: ['front', 'back'] });
  for (const face of FACES) revealFace(state, face);
  for (const action of result.actions) {
    if (action.type === 'shaft' || action.type === 'latch') {
      const control = (action.type === 'shaft' ? level.shafts : level.latches).find(
        (item) => item.id === action.id,
      );
      assert.equal(viewFace(state, control.face).ok, true);
    }
    const outcome = apply(level, state, action);
    assert.equal(outcome.ok, true, `${level.id}: ${JSON.stringify(action)}: ${outcome.message}`);
  }
  assert.equal(state.completed, true);
}

test('50 stable independent levels form five chapters of ten', async () => {
  assert.equal(LEVELS.length, 50);
  assert.equal(new Set(LEVELS.map((level) => level.id)).size, 50);
  assert.equal(CHAPTERS.length, 5);
  assert.deepEqual(
    CHAPTERS.map((chapter) => chapter.levels.length),
    [10, 10, 10, 10, 10],
  );
  for (const [index, level] of LEVELS.entries()) {
    assert.equal(level.number, index + 1);
    assert.equal(level.chapter.number, Math.floor(index / 10) + 1);
    const module = await import(`../levels/${String(index + 1).padStart(2, '0')}.mjs`);
    assert.equal(module.default, level);
    assert.ok(level.intro.trim() && level.lesson.trim(), level.id);
    assert.deepEqual(validateLevel(level), { valid: true, errors: [] }, level.id);
    assert.ok(level.initialViews.eligiblePairs.length > 1);
    const controls = [
      ...level.shafts.filter(
        (shaft) => !level.latches.some((latch) => latch.shaft === shaft.id && latch.initial),
      ),
      ...level.latches.filter(
        (latch) =>
          latch.initial &&
          latch.releaseWhen.every((condition) =>
            condition.positions.includes(
              level.shafts.find((shaft) => shaft.id === condition.shaft).initial,
            ),
          ),
      ),
    ];
    for (const pair of level.initialViews.eligiblePairs) {
      assert.equal(new Set(pair).size, 2);
      assert.ok(pair.some((face) => controls.some((control) => control.face === face)));
    }
  }
});

test('routes, apertures and full board travel occupy one consistent 3D box', () => {
  for (const level of LEVELS) {
    assert.deepEqual(level.checkpoints.at(-1), { pathIndex: level.path.length - 1, gateIds: [] });
    for (const [index, point] of level.path.entries()) {
      assert.equal(point.length, 3);
      assert.ok(point.every((value) => Number.isFinite(value) && Math.abs(value) < 260));
      if (index)
        assert.ok(
          point[0] > level.path[index - 1][0],
          `${level.id}: monotonic X rules out unintended board crossings`,
        );
    }
    for (const gate of level.gates) {
      const shaft = level.shafts.find((item) => item.id === gate.shaft);
      assert.deepEqual(gate.center, level.path[gate.pathIndex]);
      assert.equal(dot(gate.normal, shaft.slideAxis), 0);
      for (const neighbor of [level.path[gate.pathIndex - 1], level.path[gate.pathIndex + 1]]) {
        const displacement = delta(neighbor, gate.center);
        const distance = dot(displacement, gate.normal);
        assert.ok(Math.abs(distance) >= 8 + 1.5, `${level.id}: stopped sphere clears closed panel`);
        assert.ok(
          Math.hypot(...displacement.map((value, axis) => value - distance * gate.normal[axis])) <
            1e-8,
        );
      }
      for (let position = shaft.min; position <= shaft.max; position += 1) {
        const geometry = getGateGeometry(level, { shafts: { [shaft.id]: position } }, gate);
        assert.equal(geometry.open, gate.aperture.offsets.includes(position * gate.travel));
        assert.ok(
          geometry.corners.every((point) => point.every((value) => Math.abs(value) < 260)),
          `${level.id}/${gate.id}: full panel remains in box`,
        );
      }
    }
  }
});

for (const level of LEVELS) {
  test(`box ${level.number}: independently solvable and replayable through real engine`, () => {
    const result = solveIndependently(level);
    assert.equal(result.solvable, true, level.id);
    assert.ok(result.explored < 1_000_000, `${level.id}: finite physical state search`);
    replayIndependent(level, result);
  });
  test(`box ${level.number}: authored walkthrough works from every initial pair`, () => {
    for (const initialFaces of PAIRS) {
      const state = createState(level, { initialFaces });
      for (const action of level.solution) {
        const outcome = apply(level, state, action);
        assert.equal(
          outcome.ok,
          true,
          `${level.id} [${initialFaces}] ${JSON.stringify(action)}: ${outcome.message}`,
        );
      }
      assert.equal(state.completed, true);
      assert.equal(state.moves, level.estimatedMoves);
      assert.equal(getSnapshot(level, state).ballPathIndex, level.path.length - 1);
    }
  });
  if (level.number >= 21) {
    test(`box ${level.number}: no choice of only two control faces can complete it`, () => {
      assert.ok(level.requiredFaces.length >= 3);
      for (const allowedFaces of PAIRS) {
        const result = solveIndependently(level, { allowedFaces });
        assert.equal(
          result.solvable,
          false,
          `${level.id}: pair ${allowedFaces.join('/')} unexpectedly solves`,
        );
      }
    });
  }
}

test('difficulty adds independent controls, dependency topology and in-flight changes', () => {
  assert.equal(LEVELS[0].shafts.length, 1);
  assert.ok(LEVELS.slice(20, 30).every((level) => level.shafts.length === 3));
  assert.ok(LEVELS.slice(30, 40).every((level) => level.shafts.length === 4));
  assert.ok(LEVELS.slice(40, 45).every((level) => level.shafts.length === 5));
  assert.ok(LEVELS.slice(45).every((level) => level.shafts.length === 6));
  assert.ok(LEVELS.some((level) => level.latches.some((latch) => latch.releaseWhen.length === 3)));
  for (const level of LEVELS.slice(20)) {
    const hasIncompatibleDetents = level.shafts.some((shaft) => {
      const gates = level.gates.filter((gate) => gate.shaft === shaft.id);
      return ![0, 1, 2].some((position) =>
        gates.every((gate) => gate.aperture.offsets.includes(position * gate.travel)),
      );
    });
    assert.equal(hasIncompatibleDetents, true, `${level.id}: requires repositioning after release`);
  }
});
