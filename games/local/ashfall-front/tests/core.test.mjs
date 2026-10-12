import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRun as createCoreRun,
  stepRun,
  chooseUpgrade,
  LEVELS,
  UPGRADES,
  validateLevels,
} from '../src/core.mjs';
const createRun = (index = 0) => createCoreRun(index, { seed: 0x41a5f00d });

test('manual directions fire diagonally in both facings and reject invalid vectors', () => {
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      const run = createRun();
      stepRun(run, { fire: true, move: x, aimDirection: { x, y } }, 1 / 60);
      const bullet = run.bullets.find((item) => item.owner === 'player');
      assert.ok(bullet);
      assert.equal(Math.sign(bullet.vx), x);
      assert.equal(Math.sign(bullet.vy), y);
      assert.ok(Math.abs(Math.abs(bullet.vx) - Math.abs(bullet.vy)) < 1e-8);
    }
  }
  for (const direction of [
    { x: NaN, y: 1 },
    { x: 1, y: Infinity },
    { x: 0, y: 0 },
  ]) {
    const run = createRun();
    stepRun(run, { fire: true, aimDirection: direction }, 1 / 60);
    assert.ok(Number.isFinite(run.player.aimAngle));
  }
  const run = createRun();
  stepRun(
    run,
    {
      aim: { x: run.player.x + 100, y: run.player.y - run.player.h * 0.61 },
      aimDirection: { x: -1, y: 1 },
    },
    1 / 60,
  );
  assert.ok(Math.abs(run.player.aimAngle) < 0.02, 'mouse aim overrides direction aim');
});

test('content validates room geometry, stable IDs, references and unlock cycles', () => {
  assert.deepEqual(validateLevels(), []);
  const duplicate = structuredClone(LEVELS);
  duplicate[1].id = duplicate[0].id;
  assert.ok(validateLevels(duplicate).some((error) => error.includes('唯一')));
  const cycle = structuredClone(LEVELS);
  cycle[2].unlocks = [cycle[0].id];
  assert.ok(validateLevels(cycle).some((error) => error.includes('循环')));
  const badSpawn = structuredClone(LEVELS);
  badSpawn[0].spawn.x = -20;
  assert.ok(validateLevels(badSpawn).some((error) => error.includes('起点')));
  const badReference = structuredClone(LEVELS);
  badReference[0].unlocks = ['missing-room'];
  assert.ok(validateLevels(badReference).some((error) => error.includes('不存在')));
});

test('fast projectiles and enemies overlapping the muzzle are hit by inclusive swept collision', () => {
  for (const offset of [2, 105]) {
    const run = createRun();
    const enemy = run.enemies[0];
    Object.assign(enemy, { x: run.player.x + offset, y: 570, hp: 20, timer: 50 });
    run.enemies = [enemy];
    run.barrels = [];
    run.waveIndex = run.wavesTotal - 1;
    stepRun(run, { fire: true, aim: { x: enemy.x, y: enemy.y - 32 } }, 0.1);
    assert.equal(run.kills, 1, `target offset ${offset}`);
    assert.equal(run.phase, 'upgrade');
  }
});

test('a shot detonates connected barrels once and explosion salvage healing has a cap', () => {
  const run = createRun();
  run.player.x = 240;
  run.player.hp = 50;
  run.stats.salvage = true;
  const [a, b, c, distant] = run.enemies;
  Object.assign(a, { x: 550, y: 570, hp: 40, timer: 50 });
  Object.assign(b, { x: 585, y: 570, hp: 40, timer: 50 });
  Object.assign(c, { x: 610, y: 570, hp: 40, timer: 50 });
  Object.assign(distant, { x: 2250, y: 570, hp: 1000, timer: 50 });
  run.enemies = [a, b, c, distant];
  run.barrels = run.barrels.slice(0, 2);
  Object.assign(run.barrels[0], { x: 500, y: 570 });
  Object.assign(run.barrels[1], { x: 640, y: 570 });
  const events = [];
  for (let i = 0; i < 5; i++) {
    stepRun(run, { fire: true, aim: { x: 500, y: 550 } }, 0.1);
    events.push(...run.events);
  }
  assert.equal(events.filter((event) => event.type === 'explode').length, 2);
  assert.equal(events.filter((event) => event.type === 'explode' && event.chain).length, 1);
  assert.equal(run.largestChain, 2);
  assert.equal(run.kills, 3);
  assert.equal(run.player.hp, 86); // 3 × 2 ordinary healing + capped 30 salvage.
  assert.ok(run.barrels.every((barrel) => !barrel.active));
});

test('Boss telegraphs before attacking and changes behaviour below half health', () => {
  const run = createRun(2),
    boss = run.enemies[0];
  run.player.x = 1530;
  let warning;
  for (let i = 0; i < 30 && boss.state !== 'telegraph'; i++) {
    stepRun(run, {}, 0.1);
    warning ||= run.events.find((event) => event.type === 'warning' && event.kind === 'charge');
  }
  assert.ok(warning);
  assert.ok(boss.attack.duration >= 0.7);
  const hp = run.player.hp;
  for (let i = 0; i < 4; i++) stepRun(run, {}, 0.1);
  assert.equal(boss.state, 'telegraph');
  assert.equal(run.player.hp, hp);
  boss.hp = boss.maxHp / 2;
  stepRun(run, {}, 1 / 60);
  assert.equal(boss.phase, 2);
  assert.ok(run.events.some((event) => event.type === 'warning' && event.kind === 'phase2'));
});

test('dash grants temporary invulnerability and cooldown; projectiles expire', () => {
  const run = createRun();
  run.player.invulnerable = 0;
  run.bullets = [
    {
      id: 'test-shot',
      owner: 'enemy',
      x: run.player.x - 50,
      y: run.player.y - 32,
      px: 0,
      py: 0,
      vx: 5000,
      vy: 0,
      damage: 30,
      radius: 4,
      life: 1,
      pierce: 0,
      hitIds: [],
    },
  ];
  stepRun(run, { dash: true, move: 1 }, 1 / 60);
  assert.equal(run.player.hp, 120);
  assert.ok(run.player.dashCooldown > 0.7);
  const remainingCooldown = run.player.dashCooldown;
  stepRun(run, { dash: true }, 1 / 60);
  assert.ok(run.player.dashCooldown < remainingCooldown);
  run.bullets.push({
    id: 'expired',
    owner: 'enemy',
    x: 2200,
    y: 100,
    px: 2200,
    py: 100,
    vx: 0,
    vy: 0,
    damage: 1,
    radius: 1,
    life: 0.001,
    pierce: 0,
    hitIds: [],
  });
  stepRun(run, {}, 1 / 60);
  assert.ok(!run.bullets.some((bullet) => bullet.id === 'expired'));
});

test('clear rewards and upgrades apply once, freeze between rooms, and reset on a new run', () => {
  const run = createRun();
  run.player.hp = 60;
  run.enemies = [];
  run.waveIndex = run.wavesTotal - 1;
  stepRun(run, {}, 1 / 60);
  assert.equal(run.phase, 'upgrade');
  assert.equal(run.player.hp, 90);
  assert.equal(run.events.filter((event) => event.type === 'room-clear').length, 1);
  const time = run.time;
  stepRun(run, { fire: true, move: 1 }, 0.1);
  assert.equal(run.time, time);
  assert.equal(run.player.hp, 90);
  assert.equal(chooseUpgrade(run, 'invalid'), false);
  assert.equal(chooseUpgrade(run, 'scatter'), true);
  assert.equal(chooseUpgrade(run, 'scatter'), false);
  assert.equal(run.levelIndex, 1);
  assert.equal(run.stats.pellets, 3);
  assert.deepEqual(run.roomsCleared, [LEVELS[0].id]);
  const fresh = createRun();
  assert.deepEqual(fresh.upgrades, []);
  assert.equal(fresh.stats.pellets, 1);
  assert.equal(fresh.player.hp, 120);
  assert.equal(fresh.bullets.length, 0);
  assert.equal(UPGRADES.length >= 4, true);
});

test('piercing hits two aligned targets while fatal damage freezes the lost run', () => {
  const run = createRun();
  const [first, second] = run.enemies;
  Object.assign(first, { x: run.player.x + 65, y: 570, hp: 20, timer: 50 });
  Object.assign(second, { x: run.player.x + 105, y: 570, hp: 20, timer: 50 });
  run.enemies = [first, second];
  run.barrels = [];
  run.stats.pierce = 1;
  stepRun(run, { fire: true, aim: { x: run.player.x + 150, y: 535 } }, 0.1);
  assert.equal(run.kills, 2);

  const losing = createRun();
  losing.player.hp = 10;
  losing.player.invulnerable = 0;
  losing.bullets = [
    {
      id: 'fatal-shot',
      owner: 'enemy',
      x: losing.player.x,
      y: losing.player.y - 30,
      px: 0,
      py: 0,
      vx: 1,
      vy: 0,
      damage: 15,
      radius: 4,
      life: 1,
      pierce: 0,
      hitIds: [],
    },
  ];
  stepRun(losing, {}, 1 / 60);
  assert.equal(losing.phase, 'lost');
  assert.equal(losing.player.hp, 0);
  assert.equal(losing.events.filter((event) => event.type === 'lose').length, 1);
  const deathTime = losing.time;
  stepRun(losing, { fire: true, jump: true, dash: true, move: 1 }, 0.1);
  assert.equal(losing.time, deathTime);
  assert.equal(losing.player.hp, 0);
  assert.equal(chooseUpgrade(losing, 'salvage'), false);
});

test('reinforcements give a nearby player time to move clear before taking contact damage', () => {
  const run = createRun(1, { seed: 123 });
  const spawnX = LEVELS[1].waves[1].enemies[0].x;
  run.player.x = spawnX;
  run.player.invulnerable = 0;
  run.enemies = [];
  run.nextWaveDelay = 0.001;
  stepRun(run, {}, 1 / 60);
  assert.equal(run.waveIndex, 1);
  assert.ok(run.events.some((event) => event.type === 'wave'));
  assert.equal(run.player.hp, 120);
  assert.ok(run.player.invulnerable > 1.1);
  for (let i = 0; i < 5; i++) stepRun(run, { move: -1 }, 0.1);
  assert.equal(run.player.hp, 120);
  assert.ok(run.player.x <= spawnX - 145);
});

test('an ordinary movement/fire/jump bot clears all three rooms using touch-style auto aim', (t) => {
  const run = createRun();
  const seen = new Set();
  let steps = 0,
    peakBullets = 0,
    recoveryWindows = 0,
    lastBossState = '';
  while (run.phase !== 'won' && run.phase !== 'lost' && steps < 60 * 180) {
    if (run.phase === 'upgrade') {
      const id = run.choices.includes('scatter')
        ? 'scatter'
        : run.choices.includes('pierce')
          ? 'pierce'
          : run.choices[0];
      assert.equal(chooseUpgrade(run, id), true);
      continue;
    }
    const p = run.player;
    const nearest = run.enemies.reduce(
      (best, enemy) => (!best || Math.abs(enemy.x - p.x) < Math.abs(best.x - p.x) ? enemy : best),
      null,
    );
    const dx = nearest ? nearest.x - p.x : 0,
      direction = Math.sign(dx) || p.facing;
    const move = Math.abs(dx) > 380 || p.facing !== direction ? direction : 0;
    const boss = run.enemies.find((enemy) => enemy.type === 'boss');
    const jump =
      steps % 65 === 0 ||
      Boolean(
        boss?.state === 'telegraph' &&
          boss.attack.kind === 'charge' &&
          boss.attack.remaining < 0.32,
      );
    const dash = Boolean(
      boss?.state === 'charge' && Math.abs(boss.x - p.x) < 150 && p.dashCooldown <= 0,
    );
    stepRun(run, { move, fire: true, jump, dash, aim: null }, 1 / 60);
    if (boss?.state === 'recover' && lastBossState !== 'recover') recoveryWindows++;
    lastBossState = boss?.state || '';
    for (const event of run.events) seen.add(event.type);
    peakBullets = Math.max(peakBullets, run.bullets.length);
    steps++;
  }
  assert.equal(
    run.phase,
    'won',
    `phase=${run.phase}, room=${run.levelIndex}, time=${run.time.toFixed(1)}, hp=${run.player.hp}`,
  );
  assert.deepEqual(
    run.roomsCleared,
    LEVELS.map((level) => level.id),
  );
  assert.equal(run.upgrades.length, 2);
  assert.ok(run.kills >= 19);
  assert.ok(seen.has('warning') && seen.has('room-clear') && seen.has('win'));
  assert.ok(peakBullets < 100);
  assert.ok(recoveryWindows >= 3, 'Boss must expose at least three distinct recovery windows');
  t.diagnostic(
    `Touch-style run: ${run.time.toFixed(1)} s, ${run.kills} kills, ${run.damageTaken} damage taken, ${peakBullets} peak projectiles, ${recoveryWindows} Boss recovery windows`,
  );
});
