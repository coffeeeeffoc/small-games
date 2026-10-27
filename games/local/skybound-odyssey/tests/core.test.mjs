import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRun,
  makeSegment,
  retryRun,
  step,
  referenceInput,
  segmentScene,
  score,
} from '../src/core.mjs';
import { ROUTES, CONNECTIONS, validateContent, SEGMENT_LENGTH } from '../src/content.mjs';
import { cleanProgress, settle, isUnlocked } from '../src/progress.mjs';
import { landscapeViewport, clientToElement } from '../src/display.mjs';
import { createLocalHost } from '../src/host.mjs';

function drive(run, limit = run.total) {
  let frames = 0;
  while (run.status === 'playing' && run.distance < limit && frames++ < 200000)
    step(run, referenceInput(run), 1 / 60);
  return run;
}
test('same seed reproduces every obstacle; different seeds produce different routes', () => {
  const a = makeSegment(123, 2, 'wavecrest', 1);
  assert.deepEqual(a, makeSegment(123, 2, 'wavecrest', 1));
  assert.notDeepEqual(a, makeSegment(124, 2, 'wavecrest', 1));
  const run = createRun({ seed: 123 });
  step(run, { steer: 0.2 });
  assert.deepEqual(retryRun(run), createRun({ seed: 123 }));
});
test('1000 complete five-scene routes remain reachable through real steering and braking', () => {
  for (let seed = 0; seed < 1000; seed++) {
    const run = drive(createRun({ seed, routeId: 'wavecrest' }));
    assert.equal(run.status, 'complete', `seed ${seed} at ${run.distance}: ${run.reason}`);
    assert.equal(run.vehicle, 'surf');
  }
});
test('long endless sequences keep legal scene connections, bounded memory and capped difficulty', () => {
  for (let seed = 0; seed < 80; seed++)
    for (let i = 1; i < 70; i++) {
      const before = segmentScene(seed, i - 1),
        after = segmentScene(seed, i);
      assert.ok(CONNECTIONS[before].includes(after), `${before} -> ${after}`);
    }
  const run = drive(createRun({ seed: 44, routeId: 'endless' }), SEGMENT_LENGTH * 50);
  assert.equal(run.status, 'playing');
  assert.ok(run.distance >= SEGMENT_LENGTH * 50);
  assert.ok(run.segments.length <= 2);
  assert.ok(run.difficulty <= 1.8);
});
test('idle player actually crashes; held steering runs out of bounds', () => {
  const run = createRun({ seed: 12 });
  for (let i = 0; i < 1000 && run.status === 'playing'; i++) step(run, {}, 1 / 60);
  assert.equal(run.status, 'failed');
  assert.match(run.reason, /撞上/);
  const edge = createRun();
  for (let i = 0; i < 200 && edge.status === 'playing'; i++) step(edge, { steer: 1 }, 1 / 60);
  assert.equal(edge.reason, '冲出了航道');
});
test('gates require alignment and braking and collision wins over completion', () => {
  for (const [x, speed, reason] of [
    [0, 24, '快'],
    [0.8, 12, '门'],
    [0, 12, null],
  ]) {
    const run = createRun();
    run.distance = 159.9;
    run.total = 160;
    run.x = x;
    run.speed = speed;
    run.segments[0].events = [
      { id: 'gate', z: 160, type: 'gate', x: 0, radius: 0.38, limit: 18, scene: 'snow' },
    ];
    step(run, { brake: speed === 12 }, 1 / 60);
    assert.equal(run.status, reason ? 'failed' : 'complete');
    if (reason) assert.ok(run.reason.includes(reason));
  }
});
test('progress unlocks only on real completion, cleans bad data, practice is isolated', () => {
  const p = cleanProgress({ completed: ['wavecrest'], bestDistance: Infinity });
  assert.deepEqual(p.completed, []);
  assert.equal(p.bestDistance, 0);
  const run = drive(createRun());
  const saved = settle(p, run, score(run));
  assert.deepEqual(saved.completed, ['snowline']);
  assert.ok(isUnlocked(saved, ROUTES[1]));
  run.practice = true;
  assert.deepEqual(settle(p, run, score(run)), p);
  assert.throws(() => validateContent([{ ...ROUTES[0], unlock: 'missing' }]));
  assert.throws(() => validateContent([{ ...ROUTES[0], scenes: ['ocean', 'falls'] }]));
});
test('touch coordinates follow rotated landscape container', () => {
  assert.deepEqual(landscapeViewport(390, 844, true), { width: 844, height: 390, rotated: true });
  const e = {
    closest: () => true,
    clientWidth: 844,
    clientHeight: 390,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 390, width: 390, height: 844 }),
  };
  assert.deepEqual(clientToElement(e, 290, 422), { x: 422, y: 100 });
});
test('unavailable host storage keeps session memory without blocking subsequent reads', async () => {
  const host = createLocalHost(null);
  await assert.rejects(host.storage.write('progress', { completed: ['snowline'] }), {
    code: 'UNAVAILABLE',
  });
  assert.deepEqual((await host.storage.read('progress')).value, { completed: ['snowline'] });
});
test('host exposes read errors so a caller cannot mistake unreadable progress for an empty save', async () => {
  let writes = 0;
  const host = createLocalHost({
    getItem() {
      throw new Error('temporarily unavailable');
    },
    setItem() {
      writes++;
    },
  });
  await assert.rejects(host.storage.read('progress'), { code: 'UNAVAILABLE' });
  assert.equal(writes, 0);
});
