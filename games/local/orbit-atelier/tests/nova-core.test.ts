import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATALOG, NOVA_LEVELS, CLASSIC_LEVELS } from '../assets/scripts/core/catalog.ts';
import { LEVELS as OLD_CLASSIC } from '../src/levels.ts';
import {
  createState,
  cloneState,
  rotateRing,
  tryRelease,
  isComplete,
  isLocked,
  solveLevel,
  shortestSolution,
  findHint,
  snapAngle,
  releaseAngle,
  angleDistance,
  validateLevel,
  validateLevels,
  type Level,
} from '../assets/scripts/core/rules.ts';
import {
  freshProgress,
  parseProgress,
  settle,
  unlockedIndex,
  restoreUndo,
  SAVE_KEY,
  LEGACY_SAVE_KEY,
  type Run,
} from '../assets/scripts/core/storage.ts';

const runFor = (level: Level): Run => ({ state: createState(level), moves: 0, hints: 0 });
function finish(run: Run) {
  const solution = shortestSolution(run.state);
  assert.ok(solution);
  for (const move of solution) {
    assert.equal(rotateRing(run.state, move.ringId, move.angle), true);
    assert.equal(tryRelease(run.state, move.ringId), true);
    run.moves++;
  }
  assert.equal(isComplete(run.state), true);
  return run;
}

test('24 authored nova maps and 74 original classic maps validate and remain solvable', () => {
  assert.equal(NOVA_LEVELS.length, 24);
  assert.equal(CLASSIC_LEVELS.length, 74);
  assert.deepEqual(validateLevels(CATALOG), []);
  for (const level of NOVA_LEVELS) {
    assert.ok(level.rings.length <= 8);
    assert.equal(level.goalRingIds?.length, 1);
    assert.equal(solveLevel(level)?.length, level.parMoves);
    const run = finish(runFor(level));
    assert.ok(
      run.state.rings.some((ring) => !ring.removed),
      `${level.id} preserves optional branches`,
    );
  }
  CLASSIC_LEVELS.forEach((level, index) => {
    assert.deepEqual(level.rings, OLD_CLASSIC[index]!.rings);
    assert.equal(level.id, OLD_CLASSIC[index]!.id);
    assert.equal(finish(runFor(level)).state.releasedCount, level.rings.length);
  });
});

test('shortest route deliberately skips long branches, and every hint stays on the route', () => {
  const level = NOVA_LEVELS[3]!;
  assert.equal(level.rings.length, 4);
  assert.equal(level.parMoves, 2);
  const state = createState(level);
  assert.equal(findHint(state)?.ringId, 'ring-1');
  const first = findHint(state)!;
  rotateRing(state, first.ringId, first.angle);
  tryRelease(state, first.ringId);
  assert.equal(findHint(state)?.ringId, level.goalRingIds![0]);
  const goal = findHint(state)!;
  rotateRing(state, goal.ringId, goal.angle);
  tryRelease(state, goal.ringId);
  assert.equal(isComplete(state), true);
  assert.equal(findHint(state), null);
});

test('named locks require their keys and reject self references, missing keys and cycles', () => {
  const level = NOVA_LEVELS[6]!;
  const state = createState(level);
  assert.equal(isLocked(state, 'ring-1'), true);
  assert.equal(rotateRing(state, 'ring-1', 0), false);
  assert.equal(tryRelease(state, 'ring-1'), false);
  const key = releaseAngle(state, 'ring-2');
  assert.notEqual(key, null);
  rotateRing(state, 'ring-2', key!);
  tryRelease(state, 'ring-2');
  assert.equal(isLocked(state, 'ring-1'), false);
  for (const requires of [['ring-1'], ['unknown'], ['ring-2', 'ring-2']]) {
    const invalid = {
      ...level,
      rings: level.rings.map((ring, i) => (i ? ring : { ...ring, requires })),
    };
    assert.ok(validateLevel(invalid).length);
  }
  const cycle = {
    ...level,
    rings: level.rings.map((ring, i) =>
      i < 2 ? { ...ring, requires: [`ring-${i ? 1 : 2}`] } : ring,
    ),
  };
  assert.ok(validateLevel(cycle).some((error) => error.includes('cycle')));
  assert.ok(validateLevel({ ...level, goalRingIds: ['missing'] }).length);
});

test('magnetic assistance is limited to six degrees, never rotates by itself or solves a blocked ring', () => {
  const state = createState(NOVA_LEVELS[0]!);
  const target = releaseAngle(state, 'ring-1')!;
  const original = state.rings[0]!.angle;
  assert.ok(angleDistance(snapAngle(state, 'ring-1', target + (5 * Math.PI) / 180), target) < 1e-9);
  const outside = target + (7 * Math.PI) / 180;
  assert.ok(angleDistance(snapAngle(state, 'ring-1', outside), outside) < 1e-9);
  assert.ok(angleDistance(snapAngle(state, 'ring-1', outside, 90), outside) < 1e-9);
  assert.equal(state.rings[0]!.angle, original);
  assert.equal(state.rings[0]!.removed, false);
  const blocked = createState(NOVA_LEVELS[4]!);
  assert.equal(releaseAngle(blocked, 'ring-1'), null);
  assert.ok(angleDistance(snapAngle(blocked, 'ring-1', 0.1), 0.1) < 1e-9);
});

test('new and classic campaigns unlock independently; hints and inefficient routes affect stars', () => {
  const progress = freshProgress();
  assert.equal(
    settle(progress, finish(runFor(NOVA_LEVELS[1]!))),
    0,
    'locked level cannot award medals',
  );
  assert.equal(settle(progress, finish(runFor(NOVA_LEVELS[0]!))), 3);
  assert.equal(unlockedIndex(progress), 1);
  assert.equal(unlockedIndex(progress, 'classic'), 0);
  const inefficient = runFor(NOVA_LEVELS[1]!);
  for (const id of ['ring-1', 'ring-3']) {
    rotateRing(inefficient.state, id, releaseAngle(inefficient.state, id)!);
    assert.equal(tryRelease(inefficient.state, id), true);
    inefficient.moves++;
  }
  finish(inefficient);
  assert.equal(settle(progress, inefficient), 2);
  const hinted = finish(runFor(NOVA_LEVELS[2]!));
  hinted.hints = 1;
  assert.equal(settle(progress, hinted), 1);
  const before = runFor(NOVA_LEVELS[3]!);
  const after = { ...before, state: cloneState(before.state), hints: 4 };
  const undone = restoreUndo(after, before);
  assert.equal(undone.hints, 4);
  assert.notEqual(undone.state, before.state);
});

test('v1 imports classic stars, settings and a current run without populating nova or writing old storage', () => {
  const oldRun = runFor(CLASSIC_LEVELS[1]!);
  const { revision: _revision, ...oldState } = oldRun.state;
  const legacy = JSON.stringify({
    version: 1,
    medals: { 'orbit-01': 3 },
    settings: { sound: false, vibration: true, reducedMotion: true },
    run: { ...oldRun, state: oldState },
  });
  const migrated = parseProgress(null, legacy);
  assert.equal(SAVE_KEY, 'orbit-atelier.v2');
  assert.equal(LEGACY_SAVE_KEY, 'orbit-atelier.v1');
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.medals, { 'orbit-01': 3 });
  assert.deepEqual(migrated.settings, { sound: false, vibration: true, reducedMotion: true });
  assert.equal(migrated.run?.state.levelId, 'orbit-02');
  assert.equal(migrated.run?.state.revision, 1);
  assert.equal(unlockedIndex(migrated), 0);
  assert.equal(unlockedIndex(migrated, 'classic'), 1);
  assert.equal(parseProgress(legacy).run?.state.levelId, 'orbit-02');
});

test('save hydration reconstructs geometry and rejects invalid counters, locks, duplicate IDs and content revisions', () => {
  const progress = freshProgress();
  progress.run = runFor(NOVA_LEVELS[0]!);
  const raw = JSON.parse(JSON.stringify(progress));
  raw.run.state.rings[0].r = 999;
  raw.run.state.rings[0].requires = ['evil'];
  raw.run.state.goalRingIds = ['ring-2'];
  raw.run.state.releasedCount = 100;
  const hydrated = parseProgress(JSON.stringify(raw));
  assert.equal(hydrated.run?.state.rings[0]?.r, 64);
  assert.equal(hydrated.run?.state.rings[0]?.requires, undefined);
  assert.deepEqual(hydrated.run?.state.goalRingIds, ['ring-1']);
  assert.equal(hydrated.run?.state.releasedCount, 0);
  for (const mutation of [
    (data: any) => {
      data.run.state.revision = 99;
    },
    (data: any) => {
      data.run.hints = -1;
    },
    (data: any) => {
      data.run.state.rings[1].id = 'ring-1';
    },
    (data: any) => {
      data.run.state.rings[0].angle = null;
    },
  ]) {
    const changed = JSON.parse(JSON.stringify(progress));
    mutation(changed);
    assert.equal(parseProgress(JSON.stringify(changed)).run, null);
  }
  const locked = freshProgress();
  for (const level of NOVA_LEVELS.slice(0, 6)) locked.medals[level.id] = 3;
  locked.run = runFor(NOVA_LEVELS[6]!);
  locked.run.state.rings[0]!.removed = true;
  locked.run.moves = 1;
  assert.equal(
    parseProgress(JSON.stringify(locked)).run,
    null,
    'a locked target cannot appear removed',
  );
  assert.deepEqual(parseProgress('{broken'), freshProgress());
});

test('save holes are trimmed within each campaign and a valid v2 takes priority over v1', () => {
  const progress = freshProgress();
  progress.medals = { 'nova-01': 3, 'nova-03': 3, 'orbit-01': 2, 'orbit-02': 3, 'orbit-04': 3 };
  const parsed = parseProgress(
    JSON.stringify(progress),
    JSON.stringify({ version: 1, medals: { 'orbit-01': 3 } }),
  );
  assert.deepEqual(parsed.medals, { 'nova-01': 3, 'orbit-01': 2, 'orbit-02': 3 });
  assert.equal(unlockedIndex(parsed), 1);
  assert.equal(unlockedIndex(parsed, 'classic'), 2);
});
