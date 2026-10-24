import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CATALOG,
  METAL_LEVELS,
  NOVA_LEVELS,
  CLASSIC_LEVELS,
  getCampaignLevels,
} from '../assets/scripts/core/catalog.ts';
import {
  createState,
  validateLevels,
  solveLevel,
  rotateRing,
  tiltRing,
  tryRelease,
  isComplete,
  findHint,
  cloneState,
} from '../assets/scripts/core/rules.ts';
import {
  freshProgress,
  parseProgress,
  settle,
  unlockedIndex,
  alignReward,
  restoreUndo,
  type Run,
} from '../assets/scripts/core/storage.ts';
import { wireCollision, type WireRing } from '../assets/scripts/core/metal.ts';
const runFor = (level = METAL_LEVELS[0]!): Run => ({
  state: createState(level),
  moves: 0,
  hints: 0,
});

test('physical catalog uses real geometry, both shape chapters and normal independent progression', () => {
  assert.equal(METAL_LEVELS.length, 12);
  assert.deepEqual(validateLevels(CATALOG), []);
  assert.equal(getCampaignLevels('metal'), METAL_LEVELS);
  const progress = freshProgress();
  for (const level of METAL_LEVELS) {
    const run = runFor(level),
      solution = solveLevel(level);
    assert.ok(solution, level.id + ' has a real solution');
    assert.equal(solution.length, level.parMoves);
    for (const hint of solution) {
      assert.ok(rotateRing(run.state, hint.ringId, hint.angle, hint.tilt));
      assert.ok(tryRelease(run.state, hint.ringId));
      run.moves++;
    }
    assert.ok(isComplete(run.state));
    assert.equal(settle(progress, run), 3);
    const loaded = parseProgress(JSON.stringify(progress));
    assert.equal(loaded.medals[level.id], 3);
    assert.equal(unlockedIndex(loaded, 'nova'), 0);
    assert.equal(unlockedIndex(loaded, 'classic'), 0);
  }
});

test('switching to metal preserves a v2 legacy run and medals in separate campaign slots', () => {
  const old: Run = { state: createState(NOVA_LEVELS[0]!), moves: 1, hints: 0 };
  rotateRing(old.state, old.state.rings[0]!.id, 0.4);
  const raw = JSON.stringify({
    version: 2,
    medals: { 'orbit-01': 2 },
    settings: { sound: false, vibration: false, reducedMotion: false },
    run: old,
  });
  const p = parseProgress(raw);
  assert.deepEqual(p.runs?.nova?.state, old.state);
  assert.equal(p.medals['orbit-01'], 2);
  p.run = runFor();
  p.runs!.metal = structuredClone(p.run);
  const loaded = parseProgress(JSON.stringify(p));
  assert.deepEqual(loaded.runs?.nova?.state, old.state);
  assert.equal(loaded.run?.state.levelId, 'metal-01');
  assert.equal(loaded.runs?.metal?.state.levelId, 'metal-01');
  assert.equal(loaded.settings.sound, false);
  assert.equal(JSON.parse(raw).run.state.levelId, 'nova-01');
  loaded.runs!.classic = { state: createState(CLASSIC_LEVELS[2]!), moves: 0, hints: 0 };
  assert.equal(
    parseProgress(JSON.stringify(loaded)).runs?.classic,
    undefined,
    'locked slot is rejected',
  );
});

test('metal save rebuilds geometry, validates finite tilt and rejects fixed removals or solid overlaps', () => {
  const p = freshProgress();
  p.run = runFor();
  const r = p.run.state.rings[1]!;
  assert.ok(tiltRing(p.run.state, r.id, 0.1));
  p.run.moves++;
  const safe = parseProgress(JSON.stringify(p));
  assert.equal(safe.run!.state.rings[1]!.tilt, 0.1);
  const forged = JSON.parse(JSON.stringify(p));
  forged.run.state.rings[0].wire.shape = 'u';
  forged.run.state.rings[1].wire.z = 9999;
  assert.equal(parseProgress(JSON.stringify(forged)).run!.state.rings[0]!.wire!.shape, 'circle');
  assert.equal(parseProgress(JSON.stringify(forged)).run!.state.rings[1]!.wire!.z, 0);
  for (const tilt of [Math.PI, null, '0']) {
    const bad = JSON.parse(JSON.stringify(p));
    bad.run.state.rings[1].tilt = tilt;
    assert.equal(parseProgress(JSON.stringify(bad)).run, null);
  }
  for (const field of ['angle', 'tilt']) {
    const movedBase = JSON.parse(JSON.stringify(p));
    movedBase.run.state.rings[0][field] = 0.2;
    assert.equal(
      parseProgress(JSON.stringify(movedBase)).run,
      null,
      'fixed poses cannot change in a save',
    );
  }
  const removed = JSON.parse(JSON.stringify(p));
  removed.run.state.rings[0].removed = true;
  removed.run.moves = 4;
  assert.equal(parseProgress(JSON.stringify(removed)).run, null);
  assert.equal(wireCollision(safe.run!.state.rings as WireRing[], r.id), null);
});

test('physical hint alignment changes a reachable pose, never releases, and undo retains hint use', () => {
  const run = runFor(),
    before = structuredClone(run),
    hint = findHint(run.state);
  assert.ok(hint);
  const applied = alignReward(run);
  assert.ok(applied);
  assert.equal(run.state.releasedCount, 0);
  assert.equal(run.hints, 1);
  assert.ok(tryRelease(cloneState(run.state), applied.ringId));
  const undone = restoreUndo(run, before);
  assert.equal(JSON.stringify(undone.state), JSON.stringify(before.state));
  assert.equal(undone.hints, 1);
  assert.equal(undone.rewardAlignUsed, true);
});
