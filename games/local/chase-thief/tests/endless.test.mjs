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
  GAP,
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

test('10000 waves are reproducible and always have a free lane or one compatible action', () => {
  const types = new Set(),
    districts = new Set();
  for (let seed = 1; seed <= 20; seed++)
    for (let wave = 0; wave < 500; wave++) {
      const obstacles = waveAt(wave, seed, 'old-town');
      assert.deepEqual(obstacles, waveAt(wave, seed, 'old-town'));
      if (new Set(obstacles.map((o) => o.lane)).size === 3) {
        assert.ok(obstacles.every((o) => o.fullWidth));
        assert.equal(new Set(obstacles.map((o) => o.type)).size, 1);
        assert.ok(['barrier', 'beam'].includes(obstacles[0].type));
      }
      obstacles.forEach((o) => types.add(o.type));
      districts.add(sampleRoute(38 + wave * WAVE_SPACING, seed).district);
    }
  assert.equal(types.size, 6);
  assert.equal(districts.size, 3);
  assert.ok(
    WAVE_SPACING / RULES.maxSpeed > Math.max(RULES.jumpDuration, RULES.slideDuration) + 0.3,
  );
});

test('fork provides two spatially separated passages, fixed risk obstacle and safe alternative', () => {
  const info = segmentInfo(4, 15),
    s = info.start + 45;
  const a = lanePosition(s, 0, 15),
    b = lanePosition(s, 2, 15);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 7);
  const waves = Array.from({ length: 4 }, (_, i) => waveAt(12 + i, 15, 'old-town'))
    .flat()
    .filter((o) => o.id.endsWith('-fork'));
  assert.equal(waves.length, 1);
  assert.ok(waves.every((o) => o.lane === info.riskSide));
});

test('tutorial actions clear the first three obstacles and preserve health', () => {
  const run = createRun();
  while (run.s < 94 && run.phase === 'running') {
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

function playSafely(run) {
  const route = sampleRoute(run.s, run.seed, run.departure),
    info = segmentInfo(route.index, run.seed, run.departure);
  const next = run.obstacles.find(
    (o) => !o.resolved && o.at + (o.type === 'gap' ? GAP.length / 2 : 0) > run.s,
  );
  if (route.fork) {
    const lane = info.riskSide === 0 ? 2 : 0;
    if (run.lane !== lane) act(run, lane < run.lane ? 'left' : 'right');
  } else if (next && next.at - run.s < run.speed * 0.85) {
    const wave = run.obstacles.filter((o) => o.wave === next.wave);
    const lane = [0, 1, 2].find((l) => !wave.some((o) => o.lane === l)) ?? run.lane;
    if (run.lane !== lane) act(run, lane < run.lane ? 'left' : 'right');
    const obstacle = wave.find((o) => o.lane === lane);
    if (obstacle && obstacle.at - run.s < run.speed * 0.38 && run.action === 'run')
      act(run, obstacle.type === 'beam' ? 'slide' : 'jump');
  }
}

test('normal play combining lane choice, jumping and sliding can run two kilometers', () => {
  const run = createRun({ seed: 12 });
  for (let i = 0; i < 25000 && run.s < 2000 && run.phase === 'running'; i++) {
    playSafely(run);
    updateRun(run, 1 / 60);
    assert.ok(run.obstacles.length <= 27);
    assert.ok(run.pickups.length <= 27);
    assert.ok(run.events.length <= 24);
  }
  assert.equal(run.phase, 'running');
  assert.ok(run.s >= 2000);
  assert.equal(run.health, 3);
  assert.ok(run.thiefDistance >= 9);
  assert.ok(run.forks > 0);
  assert.ok(run.successes > 20);
});

test('top speed routes remain playable across seeds and all three districts', () => {
  for (const departure of DISTRICTS)
    for (let seed = 1; seed <= 5; seed++) {
      const run = createRun({ seed, departure });
      run.ticks = Math.ceil(
        (RULES.maxSpeed - RULES.startSpeed) / RULES.acceleration / RULES.fixedStep,
      );
      while (run.s < 3000 && run.phase === 'running') {
        playSafely(run);
        updateRun(run, RULES.fixedStep);
      }
      assert.equal(run.health, 3, `${departure} seed=${seed} at=${run.s}`);
      assert.ok(run.s >= 3000);
      assert.equal(run.speed, RULES.maxSpeed);
    }
});

test('full rows require the correct timed action, including between lane centers', () => {
  for (const wave of [3, 6])
    for (const lane of [0, 0.49, 0.51, 1, 1.5, 2]) {
      for (const action of [null, 'jump', 'slide']) {
        const run = createRun();
        run.obstacles = waveAt(wave, run.seed, run.departure);
        run.s = run.obstacles[0].at - RULES.startSpeed * 0.38;
        run.lane = run.laneVisual = lane;
        run.nextWave = 1000;
        if (action) act(run, action);
        updateRun(run, 0.5);
        const correct = action === (wave === 3 ? 'jump' : 'slide');
        assert.equal(run.health, correct ? 3 : 2, `${wave}/${lane}/${action}`);
        assert.equal(run.successes, correct ? 1 : 0);
      }
    }
});

test('trench collision covers entry, landing and lane changes until the far lip', () => {
  const make = () => {
    const run = createRun();
    run.obstacles = [
      { id: 'gap', type: 'gap', lane: 1, at: 12, wave: 0, resolved: false, offset: 0 },
    ];
    run.nextWave = 1000;
    return run;
  };
  const walk = make();
  walk.s = 9.9;
  updateRun(walk, 0.03);
  assert.equal(walk.phase, 'lost');
  const jump = make();
  jump.s = 12 - RULES.startSpeed * 0.38;
  act(jump, 'jump');
  updateRun(jump, 0.6);
  assert.equal(jump.health, 3);
  assert.equal(jump.successes, 1);
  const early = make();
  early.s = 10.1;
  early.action = 'jump';
  early.actionRemaining = 0.11;
  updateRun(early, 0.12);
  assert.equal(early.phase, 'lost');
  const switchIn = make();
  switchIn.s = 12;
  switchIn.lane = switchIn.laneVisual = 0;
  act(switchIn, 'right');
  updateRun(switchIn, 0.1);
  assert.equal(switchIn.phase, 'lost');
  const around = make();
  around.lane = around.laneVisual = 0;
  updateRun(around, 1.2);
  assert.equal(around.phase, 'running');
});

test('very long runs have bounded active content and capped speed', () => {
  const run = createRun();
  run.invincible = true;
  updateRun(run, 3600);
  assert.equal(run.phase, 'running');
  assert.ok(run.s > 50000);
  assert.ok(run.obstacles.length <= 27);
  assert.ok(run.pickups.length <= 27);
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
