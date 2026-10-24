import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRun,
  stepRun,
  continueRun,
  chooseUpgrade,
  LEVELS,
  validateLevels,
  UPGRADES,
} from '../src/core.mjs';
import { readProgress, recordProgress } from '../src/progress.mjs';

test('23 stable sectors have distinct layouts, reachable exits and finite checkpoint configuration', () => {
  assert.equal(LEVELS.length, 23);
  assert.deepEqual(
    LEVELS.slice(0, 3).map((l) => l.id),
    ['foundry-entry', 'furnace-crossing', 'dismantler-core'],
  );
  assert.deepEqual(validateLevels(), []);
  const signatures = LEVELS.map((l) =>
    JSON.stringify({
      platforms: l.platforms,
      waves: l.waves.map(({ id, ...w }) => w),
      width: l.width,
    }),
  );
  assert.equal(new Set(signatures).size, 23);
  for (const key of ['captureSeconds', 'radius', 'contestRadius', 'reinforcementInterval'])
    for (const value of [NaN, Infinity, -Infinity]) {
      const levels = structuredClone(LEVELS);
      levels[0].waves[0][key] = value;
      assert.ok(validateLevels(levels).length, `${key}=${value}`);
    }
});

test('capture requires presence and a cleared perimeter; boss cannot spawn before previous checkpoints', () => {
  const run = createRun(2, { seed: 1 });
  assert.ok(!run.enemies.some((e) => e.type === 'boss'));
  run.enemies = [];
  stepRun(run, {}, 0.1);
  assert.equal(run.capture, 0);
  run.player.x = run.level.waves[0].checkpointX;
  stepRun(run, {}, 0.1);
  assert.ok(run.capture > 0);
  const capture = run.capture;
  const enemy = createRun(2, { seed: 1 }).enemies[0];
  enemy.x = run.player.x;
  enemy.timer = 100;
  run.enemies = [enemy];
  stepRun(run, {}, 0.1);
  assert.equal(run.capture, capture);
  run.enemies = [];
  run.capture = run.level.waves[0].captureSeconds;
  stepRun(run, {}, 0.1);
  assert.equal(run.waveIndex, 0);
  assert.equal(run.checkpointComplete, true);
  const p = readProgress({
    schemaVersion: 1,
    completed: LEVELS.slice(0, 3).map((l) => l.id),
    bestTime: 32,
    sound: false,
  });
  assert.equal(p.completed.length, 3);
  assert.equal(p.bestTime, null);
  assert.equal(p.sound, false);
});

test('all five modifications can be exhausted without blocking free continuation; assisted clears unlock without best time', () => {
  const run = createRun();
  run.phase = 'upgrade';
  run.choices = [];
  run.upgrades = UPGRADES.map((u) => u.id);
  assert.equal(continueRun(run), true);
  assert.equal(run.levelIndex, 1);
  assert.equal(continueRun(run), false);
  const p = readProgress(null);
  run.roomsCleared = LEVELS.map((l) => l.id);
  run.phase = 'won';
  run.startIndex = 0;
  run.time = 1000;
  run.assisted = true;
  assert.equal(recordProgress(p, run), true);
  assert.equal(p.completed.length, 23);
  assert.equal(p.bestTime, null);
});

export function naturalInput(run, frame) {
  const p = run.player,
    wave = run.level.waves[run.waveIndex];
  const destination = run.checkpointComplete
    ? (run.level.waves[run.waveIndex + 1]?.checkpointX ?? run.level.exitX)
    : wave.checkpointX;
  let move = Math.abs(destination - p.x) > 70 ? Math.sign(destination - p.x) : 0;
  const nearest = run.enemies.reduce(
    (a, e) => (!a || Math.hypot(e.x - p.x, e.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? e : a),
    null,
  );
  if (nearest && Math.abs(nearest.x - p.x) < 150 && Math.abs(p.x - wave.checkpointX) < 250)
    move = -Math.sign(nearest.x - p.x);
  let jump = frame % 43 === 0,
    dash = Math.abs(destination - p.x) > 450 && frame % 70 === 0;
  const boss = run.enemies.find((e) => e.type === 'boss');
  if (boss?.state === 'telegraph' && boss.attack.kind === 'charge' && boss.timer < 0.25)
    jump = true;
  if (boss?.state === 'charge' && Math.abs(boss.x - p.x) < 300) {
    jump = true;
    dash = true;
    move = -Math.sign(boss.vx);
  }
  return {
    move,
    fire: true,
    jump,
    dash,
    aim: nearest ? { x: nearest.x, y: nearest.y - nearest.h * 0.55 } : null,
  };
}

for (const index of [0, 2, 22])
  test(`natural movement/fire bot clears sector ${index + 1} with sustained active defence`, (t) => {
    const run = createRun(index, { seed: 0x41a5f00d, singleLevel: true });
    let frame = 0,
      peak = 0;
    while (run.phase === 'playing' && frame < 60 * 900) {
      stepRun(run, naturalInput(run, frame++), 1 / 60);
      peak = Math.max(peak, run.bullets.length);
    }
    t.diagnostic(
      `sector=${index + 1}, outcome=${run.phase}, time=${run.time.toFixed(1)}s, hp=${run.player.hp}, kills=${run.kills}, peakBullets=${peak}`,
    );
    // Reference target is 6–9 minutes; natural movement can finish the first sector slightly faster.
    assert.equal(run.phase, 'won');
    assert.ok(run.time >= 350 && run.time < 540);
    assert.ok(run.kills > 80);
    assert.ok(peak < 120);
  });

test('all 23 sector transitions remain free after modifications are exhausted and record a full clear', () => {
  const run = createRun(0, { seed: 0x41a5f00d });
  for (let index = 0; index < LEVELS.length; index++) {
    assert.equal(run.levelIndex, index);
    // Set the final checkpoint state: this verifies transitions, not natural combat.
    run.enemies = [];
    run.bullets = [];
    run.waveIndex = run.wavesTotal - 1;
    run.checkpointComplete = true;
    run.player.x = run.level.exitX;
    stepRun(run, {}, 1 / 60);
    if (index < LEVELS.length - 1) {
      assert.equal(run.phase, 'upgrade');
      if (run.choices.length) assert.equal(chooseUpgrade(run, run.choices[0]), true);
      else assert.equal(continueRun(run), true);
      assert.equal(run.phase, 'playing');
    }
  }
  assert.equal(run.phase, 'won');
  assert.deepEqual(
    run.roomsCleared,
    LEVELS.map((level) => level.id),
  );
  assert.equal(run.upgrades.length, UPGRADES.length);
  const progress = readProgress(null);
  assert.equal(recordProgress(progress, run), true);
  assert.equal(progress.completed.length, 23);
  assert.equal(progress.bestTime, run.time);
});
