import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRun as createCoreRun,
  stepRun,
  chooseUpgrade,
  LEVELS,
  UPGRADES,
  validateLevels,
  equipWeapon,
  WEAPONS,
  grantSupply,
  crossesFloor,
} from '../src/core.mjs';
// Isolate the original combat contracts from the campaign's new capture/exit gates.
const createRun = (index = 0) => {
  const run = createCoreRun(index, { seed: 0x41a5f00d });
  run.level = {
    ...run.level,
    waves: run.level.waves.map((w) => ({ ...w, captureSeconds: 0, checkpointX: null })),
  };
  run.enemies = run.enemies.filter((e) => e.type !== 'turret');
  run.enemies[2] = { ...run.enemies[2], type: 'shooter', baseY: 570, y: 570 };
  if (index === 2) {
    Object.assign(run.enemies[0], {
      type: 'boss',
      x: 1990,
      y: 570,
      w: 112,
      h: 140,
      hp: 900,
      maxHp: 900,
      state: 'idle',
      timer: 0.85,
      nextAttack: 'charge',
    });
    run.enemies = [run.enemies[0]];
  }
  return run;
};

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
    Object.assign(enemy, { x: run.player.x + offset, y: 570, hp: 20, timer: 50, fired: true });
    run.enemies = [enemy];
    run.barrels = [];
    run.waveIndex = run.wavesTotal - 1;
    stepRun(run, { fire: true, aim: { x: enemy.x, y: enemy.y - 32 } }, 0.1);
    assert.equal(run.kills, 1, `target offset ${offset}`);
    assert.equal(run.phase, 'playing');
    assert.equal(run.exitOpen, true);
  }
});

test('a shot detonates connected barrels once and explosion salvage healing has a cap', () => {
  const run = createRun();
  run.player.x = 240;
  run.player.hp = 50;
  run.stats.salvage = true;
  const [a, b, c, distant] = run.enemies;
  Object.assign(a, { x: 550, y: 570, hp: 40, timer: 50, fired: true });
  Object.assign(b, { x: 585, y: 570, hp: 40, timer: 50, fired: true });
  Object.assign(c, { x: 610, y: 570, hp: 40, timer: 50, fired: true });
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
  assert.equal(run.player.hp, 89); // 3 × 3 ordinary healing + capped 30 salvage.
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
  run.player.x = run.level.exitX;
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
  assert.equal(chooseUpgrade(run, 'power'), true);
  assert.equal(chooseUpgrade(run, 'power'), false);
  assert.equal(run.levelIndex, 1);
  assert.equal(run.stats.damageMultiplier, 1.1);
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
  Object.assign(first, { x: run.player.x + 65, y: 570, hp: 20, timer: 50, fired: true });
  Object.assign(second, { x: run.player.x + 105, y: 570, hp: 20, timer: 50, fired: true });
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

test('every ordinary enemy fires before its first-volley shield permits a kill', () => {
  const run = createRun();
  run.barrels = [];
  const target = run.enemies[0];
  target.x = run.player.x + 110;
  run.enemies = [target];
  run.stats.damageMultiplier = 100;
  target.type = 'shooter';
  stepRun(run, { fire: true }, 0.1);
  assert.ok(target.hp >= 1);
  assert.equal(target.fired, false);
  let shot = false;
  for (let i = 0; i < 12; i++) {
    stepRun(run, { fire: true }, 0.1);
    shot ||= run.events.some((e) => e.type === 'shoot' && e.owner === 'enemy');
  }
  assert.ok(shot);
  assert.equal(run.kills, 1);
});

test('exit stays locked for living guards and opens only after all waves; reaching it advances', () => {
  const run = createRun();
  run.player.x = run.level.exitX;
  stepRun(run, {}, 1 / 60);
  assert.equal(run.phase, 'playing');
  assert.equal(run.exitOpen, false);
  run.enemies = [];
  run.waveIndex = run.wavesTotal - 1;
  run.player.x = 1700;
  stepRun(run, {}, 1 / 60);
  assert.equal(run.exitOpen, true);
  assert.equal(run.phase, 'playing');
  run.player.x = run.level.exitX;
  stepRun(run, {}, 1 / 60);
  assert.equal(run.phase, 'upgrade');
  assert.equal(run.upgradeReason, 'room');
  assert.equal(chooseUpgrade(run, run.choices[0]), true);
  assert.equal(run.levelIndex, 1);
});

test('ladder descends into tunnel, holds still, crosses floor and climbs out', () => {
  for (let index = 0; index < LEVELS.length; index++) {
    const run = createRun(index);
    run.enemies = [];
    run.encounters.forEach((e) => {
      e.guards = true;
      e.boss = true;
    });
    run.nextWaveDelay = 1000;
    const [entry, exit] = run.level.ladders;
    run.player.x = entry.x;
    for (let i = 0; i < 90; i++) stepRun(run, { climb: 1 }, 1 / 60);
    assert.equal(run.player.y, entry.bottom);
    for (let i = 0; i < 250 && run.player.x < exit.x - 4; i++) stepRun(run, { move: 1 }, 1 / 60);
    assert.ok(Math.abs(run.player.x - exit.x) < 10);
    for (let i = 0; i < 90; i++) stepRun(run, { climb: -1 }, 1 / 60);
    assert.equal(run.player.y, entry.top);
  }
});

test('weapons differ by spread, burst, range, splash and spin-up; ammo exhaustion returns rifle', () => {
  for (const id of Object.keys(WEAPONS)) {
    const run = createRun();
    run.enemies = [];
    run.barrels = [];
    run.encounters.forEach((e) => {
      e.guards = true;
      e.boss = true;
    });
    run.nextWaveDelay = 1000;
    equipWeapon(run, id);
    for (let i = 0; i < 30; i++)
      stepRun(run, { fire: true, aimDirection: { x: 0, y: -1 } }, 1 / 60);
    assert.ok(run.shots > 0, id);
    if (id === 'shotgun') assert.ok(run.bullets.length >= 5);
    if (id === 'burst') assert.ok(run.shots >= 3);
    if (id === 'flame') assert.ok(run.bullets.every((b) => b.life <= 0.46 && b.pierce === 3));
    if (id === 'cannon') assert.ok(run.bullets.some((b) => b.blast === 115));
    if (id !== 'rifle') {
      run.ammo = 1;
      run.player.fireCooldown = 0;
      stepRun(run, { fire: true }, 1 / 60);
      assert.equal(run.weapon, 'rifle');
      assert.equal(run.ammo, 0);
    }
  }
});

test('XP upgrade pauses in-place, offers two free and one rewarded choice, and keeps overflow', () => {
  const run = createRun();
  run.xp = 80;
  stepRun(run, {}, 1 / 60);
  assert.equal(run.phase, 'upgrade');
  assert.equal(run.xp, 20);
  assert.equal(run.choices.filter((id) => UPGRADES.find((u) => u.id === id).rewarded).length, 1);
  const before = run.time,
    x = run.player.x;
  stepRun(run, { move: 1 }, 0.1);
  assert.equal(run.time, before);
  assert.equal(chooseUpgrade(run, 'overdrive'), false);
  assert.equal(chooseUpgrade(run, 'overdrive', { rewarded: true }), true);
  assert.equal(chooseUpgrade(run, 'overdrive', { rewarded: true }), false);
  assert.equal(run.levelIndex, 0);
  assert.equal(run.player.x, x);
  assert.equal(run.player.maxHp, 150);
  assert.equal(run.roomsCleared.length, 0);
  run.player.hp = 40;
  assert.equal(grantSupply(run), true);
  assert.equal(run.player.hp, 80);
  assert.equal(run.weapon, 'machine');
  assert.equal(grantSupply(run), false);
});

test('underground ceiling blocks crossing shots except through ladder shafts', () => {
  const level = LEVELS[0],
    ladder = level.ladders[0],
    tunnel = level.tunnels[0];
  assert.equal(crossesFloor(level, tunnel.x + 300, 520, tunnel.x + 300, 820), true);
  assert.equal(crossesFloor(level, ladder.x, 520, ladder.x, 820), false);
  assert.equal(crossesFloor(level, tunnel.x + 300, 800, tunnel.x + 300, 520), true);
  assert.equal(crossesFloor(level, tunnel.x + 300, 780, tunnel.x + 400, 780), false);
});
