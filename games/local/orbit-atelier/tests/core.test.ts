import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  STROKE_MARGIN,
  angleDistance,
  circleIntersections,
  createState,
  findHint,
  getBlockers,
  isComplete,
  isLocked,
  normalizeAngle,
  rotateRing,
  solveLevel,
  tryRelease,
  validateLevel,
  validateLevels,
} from '../src/core.ts';
import type { Level, Ring } from '../src/core.ts';
import { BOARD_HEIGHT, BOARD_WIDTH, CHAPTERS, LEVELS } from '../src/levels.ts';
import { freshProgress, parseProgress, settle, unlockedIndex } from '../src/storage.ts';
import type { Run } from '../src/storage.ts';

function ring(id: string, x: number, y = 0, extra: Partial<Ring> = {}): Ring {
  return { id, x, y, r: 54, gap: (100 * Math.PI) / 180, angle: Math.PI / 2, ...extra };
}

function level(rings: Ring[]): Level {
  return { id: 'test', name: '规则测试', chapter: 1, rings };
}

test('circle intersections sit on both circles, including unequal radii', () => {
  const a = ring('a', 0, 0, { r: 52 });
  const b = ring('b', 100, 0, { r: 60 });
  const points = circleIntersections(a, b);
  assert.ok(points);
  for (const point of points) {
    assert.ok(Math.abs(Math.hypot(point.x - a.x, point.y - a.y) - a.r) < 1e-8);
    assert.ok(Math.abs(Math.hypot(point.x - b.x, point.y - b.y) - b.r) < 1e-8);
  }
  assert.equal(circleIntersections(a, ring('far', 200)), null);
  assert.equal(circleIntersections(a, ring('touch', 106)), null);
  assert.equal(circleIntersections(a, ring('inside', 1, 0, { r: 10 })), null);
  assert.equal(circleIntersections(a, ring('same', 0, 0, { r: 52 })), null);
});

test('rotation and release stay continuous across ±π and do not auto-remove', () => {
  const state = createState(level([ring('a', 0), ring('b', -100)]));
  assert.equal(rotateRing(state, 'a', Math.PI + 0.1), true);
  assert.ok(Math.abs(state.rings[0]!.angle - (-Math.PI + 0.1)) < 1e-9);
  assert.equal(state.rings[0]!.removed, false);
  assert.ok(angleDistance(Math.PI - 0.02, -Math.PI + 0.02) < 0.041);
  assert.equal(tryRelease(state, 'a'), true);
  assert.equal(state.releasedCount, 1);
  assert.equal(tryRelease(state, 'a'), false);
  assert.equal(state.releasedCount, 1);
  assert.ok(normalizeAngle(-Math.PI * 7) >= -Math.PI);
});

test('covering only one of the two intersections cannot release the ring', () => {
  const state = createState(level([ring('a', 0), ring('b', 100)]));
  const blocker = getBlockers(state, 'a')[0]!;
  rotateRing(state, 'a', blocker.angles[0] + 0.2);
  const safeHalfGap = state.rings[0]!.gap / 2 - STROKE_MARGIN;
  assert.ok(angleDistance(state.rings[0]!.angle, blocker.angles[0]) <= safeHalfGap);
  assert.ok(angleDistance(state.rings[0]!.angle, blocker.angles[1]) > safeHalfGap);
  assert.equal(tryRelease(state, 'a'), false);
  rotateRing(state, 'a', 0);
  assert.equal(tryRelease(state, 'a'), true);
});

test("a neighbour's own opening never changes fixed circle connections", () => {
  const state = createState(level([ring('a', 0), ring('b', 100)]));
  rotateRing(state, 'a', Math.PI / 2);
  rotateRing(state, 'b', Math.PI);
  assert.equal(tryRelease(state, 'a'), false);
  assert.equal(getBlockers(state, 'a').length, 1);
  assert.equal(tryRelease(state, 'b'), true);
  assert.equal(getBlockers(state, 'a').length, 0);
  assert.equal(tryRelease(state, 'a'), true);
});

test('opposite neighbours block a central ring until a leaf is removed', () => {
  const state = createState(level([ring('middle', 0), ring('left', -100), ring('right', 100)]));
  rotateRing(state, 'middle', 0);
  assert.equal(tryRelease(state, 'middle'), false);
  const hint = findHint(state);
  assert.ok(hint);
  assert.notEqual(hint.ringId, 'middle');
  rotateRing(state, hint.ringId, hint.angle);
  assert.equal(tryRelease(state, hint.ringId), true);
  const next = findHint(state);
  assert.equal(next?.ringId, 'middle');
  rotateRing(state, next!.ringId, next!.angle);
  assert.equal(tryRelease(state, 'middle'), true);
});

test('stroke clearance prevents a visually grazing intersection from escaping', () => {
  const state = createState(level([ring('a', 0), ring('b', 100)]));
  const angle = getBlockers(state, 'a')[0]!.angles[0];
  const unsafe = angle + state.rings[0]!.gap / 2 - STROKE_MARGIN / 2;
  rotateRing(state, 'a', unsafe);
  assert.equal(tryRelease(state, 'a'), false);
  const hint = findHint(state)!;
  rotateRing(state, hint.ringId, hint.angle);
  assert.equal(tryRelease(state, hint.ringId), true);
});

test('star latches reject rotation and release until enough other rings leave', () => {
  const state = createState(
    level([ring('locked', 0, 0, { unlockAfter: 2 }), ring('left', -100), ring('right', 100)]),
  );
  const initialAngle = state.rings[0]!.angle;
  assert.equal(isLocked(state, 'locked'), true);
  assert.equal(rotateRing(state, 'locked', 0), false);
  assert.equal(state.rings[0]!.angle, initialAngle);
  assert.equal(tryRelease(state, 'locked'), false);
  for (const id of ['left', 'right']) {
    const hint = findHint(state)!;
    assert.equal(hint.ringId, id);
    rotateRing(state, hint.ringId, hint.angle);
    assert.equal(tryRelease(state, hint.ringId), true);
  }
  assert.equal(isLocked(state, 'locked'), false);
  assert.equal(tryRelease(state, 'locked'), true);
  assert.equal(isComplete(state), true);
});

test('isolated rings wait for an explicit action and snapshots support undo', () => {
  const content = level([ring('alone', 0)]);
  const state = createState(content);
  const snapshot = structuredClone(state);
  assert.equal(isComplete(state), false);
  assert.equal(state.releasedCount, 0);
  assert.deepEqual(findHint(state), { ringId: 'alone', angle: state.rings[0]!.angle });
  assert.equal(tryRelease(state, 'alone'), true);
  assert.equal(isComplete(state), true);
  const restored = structuredClone(snapshot);
  assert.equal(isComplete(restored), false);
  assert.equal(restored.releasedCount, 0);
  assert.equal(content.rings[0]!.angle, Math.PI / 2);
});

test('unknown IDs, removed rings and nonfinite input do not corrupt state', () => {
  const state = createState(level([ring('a', 0)]));
  const before = structuredClone(state);
  assert.equal(rotateRing(state, 'a', NaN), false);
  assert.equal(rotateRing(state, 'a', Infinity), false);
  assert.equal(rotateRing(state, 'missing', 0), false);
  assert.equal(tryRelease(state, 'missing'), false);
  assert.deepEqual(state, before);
  assert.equal(tryRelease(state, 'a'), true);
  assert.equal(rotateRing(state, 'a', 0), false);
  assert.equal(findHint(state), null);
});

test('schema rejects invalid numbers, IDs, range and latch thresholds', () => {
  assert.deepEqual(validateLevel(LEVELS[0]), []);
  assert.ok(validateLevel(null).length);
  assert.ok(validateLevel(level([])).length);
  assert.ok(validateLevel(level([ring('a', NaN)])).some((error) => error.includes('finite')));
  assert.ok(
    validateLevel(level([ring('a', 0), ring('a', 100)])).some((error) =>
      error.includes('duplicate'),
    ),
  );
  for (const extra of [
    { r: 0 },
    { gap: 0 },
    { angle: Infinity },
    { unlockAfter: -1 },
    { unlockAfter: 1.5 },
    { unlockAfter: 1 },
  ]) {
    assert.ok(validateLevel(level([ring('a', 0, 0, extra)])).length);
  }
  assert.throws(() => createState(level([ring('bad', 0, 0, { gap: 0 })])), /Invalid level/);
});

test('catalog validation detects unreachable latch cycles and repeated level IDs', () => {
  const deadlock = level([
    ring('a', 0, 0, { unlockAfter: 1 }),
    ring('b', 100, 0, { unlockAfter: 1 }),
  ]);
  assert.equal(solveLevel(deadlock), null);
  assert.ok(validateLevels([deadlock]).some((error) => error.includes('cannot be completed')));
  assert.ok(
    validateLevels([LEVELS[0], LEVELS[0]]).some((error) => error.includes('duplicate level id')),
  );
});

test('all 24 original levels validate, fit the board, and solve by actual rotate/release moves', () => {
  assert.equal(LEVELS.length, 24);
  assert.deepEqual(
    CHAPTERS.map((chapter) => chapter.name),
    ['初光', '星栓', '星图'],
  );
  assert.deepEqual(validateLevels(LEVELS), []);
  for (const chapter of [1, 2, 3])
    assert.equal(LEVELS.filter((entry) => entry.chapter === chapter).length, 8);
  for (const content of LEVELS) {
    for (const item of content.rings) {
      assert.ok(item.x - item.r >= 0 && item.x + item.r <= BOARD_WIDTH, `${content.id}: x bounds`);
      assert.ok(item.y - item.r >= 0 && item.y + item.r <= BOARD_HEIGHT, `${content.id}: y bounds`);
    }
    const state = createState(content);
    const plan = solveLevel(content);
    assert.ok(plan, `${content.id} must have a solution`);
    assert.equal(plan.length, content.rings.length);
    for (const move of plan) {
      assert.equal(
        rotateRing(state, move.ringId, move.angle),
        true,
        `${content.id}: rotate ${move.ringId}`,
      );
      assert.equal(tryRelease(state, move.ringId), true, `${content.id}: release ${move.ringId}`);
    }
    assert.equal(isComplete(state), true, content.id);
    assert.equal(state.releasedCount, content.rings.length);
    assert.equal(findHint(state), null);
  }
});

function completedRun(index = 0, moves?: number, hints = 0): Run {
  const content = LEVELS[index]!;
  const state = createState(content);
  for (const move of solveLevel(content)!) {
    rotateRing(state, move.ringId, move.angle);
    tryRelease(state, move.ringId);
  }
  return { state, moves: moves ?? content.rings.length, hints };
}

test('missing, corrupt and foreign-version saves fall back to independent fresh progress', () => {
  for (const raw of [
    null,
    '',
    'broken json',
    'null',
    '17',
    JSON.stringify({ version: 2, medals: { 'orbit-01': 3 } }),
  ]) {
    assert.deepEqual(parseProgress(raw), freshProgress());
  }
  const first = freshProgress();
  first.settings.sound = false;
  first.medals['orbit-01'] = 3;
  assert.equal(freshProgress().settings.sound, true);
  assert.deepEqual(freshProgress().medals, {});
});

test('save parsing keeps valid settings and sequential medals without unlocking past holes', () => {
  const progress = parseProgress(
    JSON.stringify({
      version: 1,
      medals: { 'orbit-01': 3, 'orbit-02': 2, 'orbit-04': 1, 'orbit-05': 9, invented: 3 },
      settings: { sound: false, vibration: 'true', reducedMotion: true, invented: true },
    }),
  );
  assert.deepEqual(progress.medals, { 'orbit-01': 3, 'orbit-02': 2 });
  assert.deepEqual(progress.settings, { sound: false, vibration: false, reducedMotion: true });
  assert.equal(unlockedIndex(progress), 2);
});

test('resumed attempts restore angles and removals while rebuilding all geometry from authored content', () => {
  const state = createState(LEVELS[0]!);
  rotateRing(state, 'ring-1', 0);
  assert.equal(tryRelease(state, 'ring-1'), true);
  state.rings[1]!.angle = Math.PI * 9;
  const serialized = structuredClone(state);
  serialized.releasedCount = 900;
  Object.assign(serialized.rings[1]!, {
    x: -999,
    y: -999,
    r: 999,
    gap: 6,
    color: 'fake',
    unlockAfter: 99,
  });
  const progress = parseProgress(
    JSON.stringify({ ...freshProgress(), run: { state: serialized, moves: 1, hints: 2 } }),
  );
  assert.ok(progress.run);
  assert.equal(progress.run.state.releasedCount, 1);
  assert.equal(progress.run.moves, 1);
  assert.equal(progress.run.hints, 2);
  assert.equal(progress.run.state.rings[0]!.removed, true);
  const resumed = progress.run.state.rings[1]!;
  const authored = LEVELS[0]!.rings[1]!;
  assert.equal(resumed.x, authored.x);
  assert.equal(resumed.y, authored.y);
  assert.equal(resumed.r, authored.r);
  assert.equal(resumed.gap, authored.gap);
  assert.equal(resumed.color, authored.color);
  assert.equal(resumed.unlockAfter, authored.unlockAfter);
  assert.ok(angleDistance(resumed.angle, Math.PI) < 1e-9);
  assert.equal(tryRelease(progress.run.state, 'ring-2'), true);
  assert.equal(isComplete(progress.run.state), true);
});

test('saved attempts reject locked levels, duplicate rings, invalid angles and invalid counters', () => {
  const state = createState(LEVELS[0]!);
  const attempt = { state, moves: 0, hints: 0 };
  const invalid: unknown[] = [
    { ...attempt, state: createState(LEVELS[1]!) },
    { ...attempt, moves: -1 },
    { ...attempt, moves: 0.5 },
    { ...attempt, hints: 100001 },
    { ...attempt, state: { ...state, rings: [state.rings[0], state.rings[0]] } },
    { ...attempt, state: { ...state, rings: state.rings.slice(1) } },
    {
      ...attempt,
      state: { ...state, rings: [{ ...state.rings[0], angle: null }, state.rings[1]] },
    },
    {
      ...attempt,
      state: { ...state, rings: [{ ...state.rings[0], removed: 'yes' }, state.rings[1]] },
    },
  ];
  for (const run of invalid) {
    const progress = parseProgress(JSON.stringify({ ...freshProgress(), run }));
    assert.equal(progress.run, null);
    assert.deepEqual(progress.medals, {});
  }
});

test('completed attempts never resume as empty boards and the final cleared catalog remains selectable', () => {
  const completed = parseProgress(JSON.stringify({ ...freshProgress(), run: completedRun() }));
  assert.equal(completed.run, null);
  const all = freshProgress();
  for (const content of LEVELS) all.medals[content.id] = 3;
  assert.equal(unlockedIndex(parseProgress(JSON.stringify(all))), LEVELS.length - 1);
});

test('resumed star latches derive their remaining count from restored releases and current content', () => {
  const progress = freshProgress();
  for (const content of LEVELS.slice(0, 8)) progress.medals[content.id] = 3;
  const state = createState(LEVELS[8]!);
  assert.equal(isLocked(state, 'ring-1'), true);
  const move = findHint(state)!;
  rotateRing(state, move.ringId, move.angle);
  assert.equal(tryRelease(state, move.ringId), true);
  state.releasedCount = 0;
  state.rings[0]!.unlockAfter = 99;
  progress.run = { state, moves: 1, hints: 0 };
  const restored = parseProgress(JSON.stringify(progress));
  assert.ok(restored.run);
  assert.equal(restored.run.state.releasedCount, 1);
  assert.equal(restored.run.state.rings[0]!.unlockAfter, 1);
  assert.equal(isLocked(restored.run.state, 'ring-1'), false);
});

test('settlement rejects incomplete attempts and preserves the best medal across replay', () => {
  const progress = freshProgress();
  const incomplete = { state: createState(LEVELS[0]!), moves: 1, hints: 0 };
  progress.run = structuredClone(incomplete);
  assert.equal(settle(progress, incomplete), 0);
  assert.deepEqual(progress.medals, {});
  assert.deepEqual(progress.run, incomplete);
  assert.equal(settle(progress, completedRun(0, 1, 1)), 1);
  assert.equal(progress.medals['orbit-01'], 1);
  assert.equal(progress.run, null);
  assert.equal(unlockedIndex(progress), 1);
  assert.equal(settle(progress, completedRun(0, 10)), 2);
  assert.equal(progress.medals['orbit-01'], 2);
  assert.equal(settle(progress, completedRun()), 3);
  assert.equal(progress.medals['orbit-01'], 3);
  assert.equal(settle(progress, completedRun(0, 10, 1)), 1);
  assert.equal(progress.medals['orbit-01'], 3);
});
