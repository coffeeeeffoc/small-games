import assert from 'node:assert/strict';
import test from 'node:test';
import {
  sampleRoute,
  segmentInfo,
  lanePosition,
  waveAt,
  DISTRICTS,
  SEGMENT_LENGTH,
  WAVE_SPACING,
} from '../assets/scripts/core/route.ts';
import {
  createRun,
  updateRun,
  act,
  pauseRun,
  resumeRun,
  RULES,
} from '../assets/scripts/core/simulation.ts';
import {
  freshProgress,
  loadProgress,
  recordRun,
  SAVE_KEY,
  LEGACY_KEY,
} from '../assets/scripts/core/progress.ts';

test('city centerline, tangent, road width and height are continuous at 2000 seams', () => {
  for (let index = 1; index <= 2000; index++) {
    const s = index * SEGMENT_LENGTH;
    const a = sampleRoute(s - 1e-5, 313, 'market'),
      b = sampleRoute(s + 1e-5, 313, 'market');
    for (const key of ['x', 'y', 'z', 'heading', 'width', 'laneWidth', 'split'])
      assert.ok(Math.abs(a[key] - b[key]) < 0.001, `${index}: ${key}`);
  }
});

test('same seed is reproducible, all districts occur and independent waves have a safe lane at maximum speed', () => {
  const types = new Set(),
    districts = new Set();
  for (let seed = 1; seed <= 20; seed++)
    for (let wave = 0; wave < 500; wave++) {
      const obstacles = waveAt(wave, seed, 'old-town');
      assert.deepEqual(obstacles, waveAt(wave, seed, 'old-town'));
      assert.ok(new Set(obstacles.map((o) => o.lane)).size < 3);
      obstacles.forEach((o) => types.add(o.type));
      districts.add(sampleRoute(38 + wave * WAVE_SPACING, seed).district);
    }
  assert.equal(types.size, 6);
  assert.equal(districts.size, 3);
  assert.ok(
    WAVE_SPACING / RULES.maxSpeed > Math.max(RULES.jumpDuration, RULES.slideDuration) + 0.8,
  );
});

test('fork provides two spatially separated passages, fixed risk obstacle and safe alternative', () => {
  const info = segmentInfo(4, 15),
    s = info.start + 45;
  const a = lanePosition(s, 0, 15),
    b = lanePosition(s, 2, 15);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 7);
  const waves = Array.from({ length: 5 }, (_, i) => waveAt(8 + i, 15, 'old-town'))
    .flat()
    .filter((o) => o.id.endsWith('-fork'));
  assert.ok(waves.length >= 1);
  assert.ok(waves.every((o) => o.lane === info.riskSide));
});

test('tutorial actions clear the first three obstacles and preserve health', () => {
  const run = createRun();
  while (run.s < 115 && run.phase === 'running') {
    const next = run.obstacles.find((o) => !o.resolved);
    if (next && next.at - run.s < 3.5 && next.at > run.s) {
      if (next.type === 'barrier' && run.action === 'run') act(run, 'jump');
      if (next.type === 'beam' && run.action === 'run') act(run, 'slide');
      if (next.type === 'crate') act(run, 'left');
    }
    updateRun(run, 1 / 60);
  }
  assert.equal(run.health, 3);
  assert.ok(run.successes >= 2);
  assert.equal(run.phase, 'running');
});

test('untouched tutorial produces three collisions, one failure and cannot resume', () => {
  const run = createRun();
  updateRun(run, 30);
  assert.equal(run.phase, 'lost');
  assert.equal(run.health, 0);
  assert.equal(run.collisions, 3);
  assert.equal(run.events.filter((e) => e.type === 'lose').length, 1);
  const s = run.s;
  resumeRun(run);
  updateRun(run, 20);
  assert.equal(run.s, s);
});

test('jumping a crate does not bypass it, gaps require a jump and collision protection prevents multi-hit damage', () => {
  const run = createRun();
  run.obstacles = [
    { id: 'crate', at: 2, lane: 1, type: 'crate', resolved: false, offset: 0, wave: 0 },
  ];
  act(run, 'jump');
  updateRun(run, 0.4);
  assert.equal(run.health, 2);
  run.obstacles.push({
    id: 'second',
    at: run.s + 0.1,
    lane: 1,
    type: 'crate',
    resolved: false,
    offset: 0,
    wave: 1,
  });
  updateRun(run, 0.1);
  assert.equal(run.health, 2);
  const gap = createRun();
  gap.obstacles = [{ id: 'gap', at: 2, lane: 1, type: 'gap', resolved: false, offset: 0, wave: 0 }];
  updateRun(gap, 0.4);
  assert.equal(gap.phase, 'lost');
});

test('fixed steps produce the same simulation across coarse and fine frames', () => {
  const a = createRun({ seed: 99 }),
    b = createRun({ seed: 99 });
  a.invincible = b.invincible = true;
  for (let i = 0; i < 600; i++) updateRun(a, 1 / 60);
  for (let i = 0; i < 20; i++) updateRun(b, 0.5);
  for (const key of ['s', 'elapsed', 'speed', 'score', 'thiefDistance', 'laneVisual'])
    assert.equal(a[key], b[key], key);
});

test('pause freezes every gameplay clock and rejects input', () => {
  const run = createRun();
  act(run, 'jump');
  updateRun(run, 0.2);
  pauseRun(run);
  const snapshot = JSON.stringify(run);
  assert.equal(act(run, 'left'), false);
  updateRun(run, 1000);
  assert.equal(JSON.stringify(run), snapshot);
  resumeRun(run);
  updateRun(run, 0.1);
  assert.ok(run.elapsed > 0.2);
});

test('normal safe-lane play can run two kilometers without a timeout or forced capture', () => {
  const run = createRun({ seed: 12 });
  for (let i = 0; i < 25000 && run.s < 2000 && run.phase === 'running'; i++) {
    const route = sampleRoute(run.s, run.seed),
      info = segmentInfo(route.index, run.seed);
    let lane;
    if (route.fork) lane = info.riskSide === 0 ? 2 : 0;
    else {
      const near = run.obstacles.filter((o) => !o.resolved && o.at - run.s < 24);
      lane = [0, 1, 2].find((l) => !near.some((o) => o.lane === l));
    }
    if (lane !== undefined && run.lane !== lane) act(run, lane < run.lane ? 'left' : 'right');
    updateRun(run, 1 / 60);
    assert.ok(run.obstacles.length <= 16);
    assert.ok(run.pickups.length <= 24);
    assert.ok(run.events.length <= 24);
  }
  assert.equal(run.phase, 'running');
  assert.ok(run.s >= 2000);
  assert.equal(run.health, 3);
  assert.ok(run.thiefDistance >= 9);
  assert.ok(run.forks > 0);
});

test('very long runs have bounded active content and capped speed', () => {
  const run = createRun();
  run.invincible = true;
  updateRun(run, 3600);
  assert.equal(run.phase, 'running');
  assert.ok(run.s > 50000);
  assert.ok(run.obstacles.length <= 16);
  assert.ok(run.pickups.length <= 24);
  assert.ok(run.speed <= RULES.maxSpeed);
  assert.ok(run.practice);
});

test('legacy settings and records migrate without treating old time as endless score', () => {
  const legacy = {
    version: 1,
    sound: false,
    haptics: false,
    best: { 'old-town': { time: 42, collisions: 1 } },
  };
  const original = JSON.stringify(legacy),
    p = loadProgress(null, legacy);
  assert.equal(p.sound, false);
  assert.equal(p.haptics, false);
  assert.deepEqual(p.best, {});
  assert.equal(p.legacyBest['old-town'].time, 42);
  assert.equal(JSON.stringify(legacy), original);
  assert.notEqual(SAVE_KEY, LEGACY_KEY);
  assert.equal(loadProgress('{broken').writable, false);
  assert.equal(loadProgress({ version: 99 }).writable, false);
});

test('settlement is idempotent and practice cannot change records', () => {
  const run = createRun();
  updateRun(run, 30);
  const p = freshProgress();
  const saved = recordRun(p, run);
  assert.ok(saved.best['old-town'].distance > 0);
  assert.deepEqual(recordRun(saved, run), saved);
  run.practice = true;
  assert.deepEqual(recordRun(p, run), p);
});

test('fork commits the physical passage even if the target lane changes at the last moment', () => {
  const run = createRun({ seed: 15 });
  const info = segmentInfo(4, run.seed);
  let entry = info.start;
  while (sampleRoute(entry, run.seed).split < 0.5) entry += 0.01;
  run.s = entry - 0.08;
  run.lane = 1;
  run.laneVisual = 0;
  run.obstacles = [];
  run.pickups = [];
  run.nextWave = 100;
  updateRun(run, 1 / 60);
  assert.equal(run.forkChoice, 0);
  assert.equal(run.lane, 0);
  assert.equal(run.health, 3);
  assert.equal(act(run, 'right'), false);
  while (sampleRoute(run.s, run.seed).split > 0.05) updateRun(run, 1 / 60);
  assert.equal(act(run, 'right'), true);
});
