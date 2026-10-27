import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRun,
  stepRun,
  continueRun,
  chooseUpgrade,
  retryRoom,
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

const intentions = new WeakMap();
export function naturalInput(run, frame) {
  const p = run.player,
    w = run.level.waves[run.waveIndex];
  const local = run.enemies.filter((e) => e.waveIndex === run.waveIndex);
  const below = p.y > run.level.ground + 20;
  const same = local.filter((e) => e.y > run.level.ground + 30 === below);
  const nearest = same.reduce(
    (a, e) => (!a || Math.hypot(e.x - p.x, e.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? e : a),
    null,
  );
  let dest = run.checkpointComplete
    ? (run.level.waves[run.waveIndex + 1]?.checkpointX ?? run.level.exitX)
    : w.checkpointX;
  let climb = 0,
    jump = frame % 43 === 0,
    dash = false;
  if (!nearest && (below || local.some((e) => e.y > run.level.ground + 30))) {
    const target = local.find((e) => e.y > run.level.ground + 30);
    const ladders = run.level.ladders.filter(
      (l) => l.bottom > run.level.ground && (!below || Math.abs(l.x - p.x) < 650),
    );
    const ladder = ladders.reduce(
      (a, l) =>
        !a || Math.abs(l.x - (target?.x ?? p.x)) < Math.abs(a.x - (target?.x ?? p.x)) ? l : a,
      null,
    );
    dest = ladder.x;
    jump = false;
    if (Math.abs(p.x - dest) < 12) {
      climb = below ? -1 : 1;
      intentions.set(run, climb);
    }
  }
  let move = Math.abs(dest - p.x) > 10 ? Math.sign(dest - p.x) : 0;
  if (p.climbing) {
    move = 0;
    climb = intentions.get(run) || -1;
    jump = false;
  }
  if (nearest) {
    if (below || run.weapon === 'flame') {
      move =
        Math.abs(nearest.x - p.x) > (run.weapon === 'flame' ? 130 : 260)
          ? Math.sign(nearest.x - p.x)
          : 0;
    } else if (Math.abs(nearest.x - p.x) < 160 && Math.abs(p.x - w.checkpointX) < 250)
      move = -Math.sign(nearest.x - p.x);
  }
  const boss = local.find((e) => e.type === 'boss');
  if (boss?.state === 'telegraph' && boss.attack.kind === 'charge' && boss.timer < 0.3) jump = true;
  if (boss?.state === 'charge' && Math.abs(boss.x - p.x) < 250) {
    jump = true;
    dash = true;
    move = -Math.sign(boss.vx);
  }
  return {
    move,
    climb,
    jump,
    dash,
    fire: true,
    aim: nearest ? { x: nearest.x, y: nearest.y - nearest.h * 0.55 } : null,
  };
}
for (const index of [0, 2, 22])
  test(`natural movement/fire bot clears sector ${index + 1} with sustained active defence`, (t) => {
    const run = createRun(index, { seed: 0x41a5f00d, singleLevel: true });
    let frame = 0,
      peak = 0;
    while (!['won', 'lost'].includes(run.phase) && frame < 60 * 900) {
      if (run.phase === 'upgrade') {
        chooseUpgrade(
          run,
          run.choices.includes('medical') && run.player.hp < run.player.maxHp - 15
            ? 'medical'
            : run.choices.includes('mobility') && run.player.hp < 60
              ? 'mobility'
              : run.choices[0],
        );
        continue;
      }
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
    run.encounters.forEach((e) => {
      e.guards = true;
      e.boss = true;
    });
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
  assert.equal(run.upgrades.length, LEVELS.length - 1);
  const progress = readProgress(null);
  assert.equal(recordProgress(progress, run), true);
  assert.equal(progress.completed.length, 23);
  assert.equal(progress.bestTime, run.time);
});

test('running past uncleared relays activates visible forward guards only once, without skipping objectives', () => {
  for (const viewWidth of [1280, 1413, 1600]) {
    const run = createRun(2, { seed: 1 });
    const x = run.level.waves[1].checkpointX;
    run.player.x = x - viewWidth * 0.66 - 5;
    stepRun(run, { viewWidth }, 1 / 60);
    assert.equal(run.encounters[1].guards, false);
    run.player.x += 10;
    stepRun(run, { viewWidth, move: 1, jump: true, dash: true }, 1 / 60);
    const guards = run.enemies.filter((e) => e.waveIndex === 1);
    assert.equal(guards.length, 5);
    assert.ok(guards.every((e) => e.x > run.player.x));
    assert.equal(run.waveIndex, 0);
    assert.equal(run.checkpointComplete, false);
    const ids = guards.map((e) => e.id);
    stepRun(run, { viewWidth }, 1 / 60);
    assert.deepEqual(
      run.enemies.filter((e) => e.waveIndex === 1).map((e) => e.id),
      ids,
    );
    run.player.x = run.level.exitX;
    stepRun(run, { viewWidth }, 1 / 60);
    assert.ok(run.encounters.every((e) => e.guards));
    assert.ok(!run.enemies.some((e) => e.type === 'boss'));
    assert.equal(run.phase, 'playing');
    assert.equal(run.roomsCleared.length, 0);
  }
});

test('future encounters survive relay transitions, defeated guards do not respawn, bosses retain prerequisites', () => {
  const run = createRun(2, { seed: 1 });
  run.player.x = run.level.waves[1].checkpointX - 400;
  stepRun(run, {}, 1 / 60);
  const survivor = run.enemies.find((e) => e.waveIndex === 1);
  run.enemies = [survivor];
  run.capture = run.level.waves[0].captureSeconds;
  for (let i = 0; i < 65; i++) stepRun(run, {}, 1 / 60);
  assert.equal(run.waveIndex, 1);
  assert.deepEqual(
    run.enemies.map((e) => e.id),
    [survivor.id],
  );
  const last = run.wavesTotal - 1;
  run.player.x = run.level.waves[last].checkpointX - 500;
  stepRun(run, {}, 1 / 60);
  assert.ok(!run.enemies.some((e) => e.type === 'boss'));
  run.waveIndex = last - 1;
  run.enemies = run.enemies.filter((e) => e.waveIndex === last);
  run.capture = run.level.waves[last - 1].captureSeconds;
  for (let i = 0; i < 65; i++) stepRun(run, {}, 1 / 60);
  assert.equal(run.waveIndex, last);
  assert.equal(run.enemies.filter((e) => e.type === 'boss').length, 1);
});

test('reinforcements arrive ahead while defending, and stop accumulating behind a distant runner', () => {
  const run = createRun(3, { seed: 1 });
  run.player.x = run.level.waves[0].checkpointX;
  run.enemies = [];
  run.reinforcementTime = 20;
  stepRun(run, {}, 1 / 60);
  assert.ok(run.enemies.length > 0);
  assert.ok(run.enemies.every((e) => e.x > run.player.x + 200));
  run.player.x = run.level.exitX;
  stepRun(run, {}, 1 / 60);
  const time = run.reinforcementTime;
  stepRun(run, {}, 0.1);
  assert.equal(run.reinforcementTime, time);
});

test('manual horizontal fire engages forward guards while old enemies remain behind', () => {
  const run = createRun(0, { seed: 1 });
  run.player.x = run.level.waves[1].checkpointX - 400;
  stepRun(run, { viewWidth: 1413 }, 1 / 60);
  const target = run.enemies.find((e) => e.waveIndex === 1 && e.type === 'shooter');
  const hp = target.hp;
  assert.ok(run.enemies.some((e) => e.waveIndex === 0 && e.x < run.player.x));
  for (let tick = 0; tick < 120; tick++) stepRun(run, { fire: true, viewWidth: 1413 }, 1 / 60);
  assert.ok(target.hp < hp, 'horizontal manual fire hits aligned forward guards');
  assert.equal(run.player.facing, 1);
  assert.equal(run.waveIndex, 0);
});

test('retry keeps current sector and earned upgrades, invalidates pending rewards and clean-run best time', () => {
  const run = createRun(0, { seed: 1 });
  run.phase = 'upgrade';
  run.choices = ['rapid'];
  chooseUpgrade(run, 'rapid');
  const epoch = run.roomEpoch;
  run.player.hp = 0;
  run.phase = 'lost';
  run.rewardUsed.revive = true;
  retryRoom(run);
  assert.equal(run.levelIndex, 1);
  assert.deepEqual(run.upgrades, ['rapid']);
  assert.equal(run.stats.rateMultiplier, 0.92);
  assert.equal(run.player.hp, 120);
  assert.equal(run.roomEpoch, epoch + 1);
  assert.equal(run.rewardUsed.revive, false);
  assert.equal(run.encounters.filter((e) => e.guards).length, 1);
  run.phase = 'won';
  run.roomsCleared = LEVELS.map((l) => l.id);
  run.time = 900;
  const progress = readProgress(null);
  recordProgress(progress, run);
  assert.equal(progress.completed.length, 23);
  assert.equal(progress.bestTime, null);
});
