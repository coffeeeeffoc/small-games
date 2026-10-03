import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, SEEDS, ENEMIES } from '../src/config.mjs';
import {
  createGame,
  startGame,
  step,
  selectSeed,
  chooseUpgrade,
  pauseGame,
  resumeGame,
  castSeed,
  dash,
} from '../src/simulation.mjs';

const idle = { moveX: 0, moveY: 0, firing: false, autoFire: false };

function isolatedGame(seed = 42) {
  const state = createGame('ruins', seed);
  startGame(state);
  state.enemies = [];
  state.plants = [];
  state.bullets = [];
  state.spawnTimer = 1e6;
  return state;
}

function advance(state, seconds, input = idle) {
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += 1 / 60) {
    step(state, Math.min(1 / 60, seconds - elapsed), input);
  }
}

function enemy(
  state,
  {
    id = 10000,
    x = state.player.x + 100,
    y = state.player.y,
    hp = 500,
    kind = 'sprout',
    radius = 16,
  } = {},
) {
  const result = { id, kind, x, y, hp, maxHp: hp, radius, angle: 0, hit: 0 };
  state.enemies.push(result);
  return result;
}

function plant(state, kind, overrides = {}) {
  const definition = SEEDS[kind];
  const result = {
    id: 20000,
    kind,
    x: state.player.x + 120,
    y: state.player.y,
    radius: definition.radius,
    age: 0,
    life: definition.life,
    hp: definition.health,
    maxHp: definition.health,
    ...overrides,
  };
  state.plants.push(result);
  return result;
}

test('the first level starts ready and only advances after starting', () => {
  const state = createGame();
  assert.equal(state.levelId, 'ruins');
  assert.equal(state.phase, 'ready');
  assert.equal(state.duration, LEVELS.ruins.duration);
  const initial = structuredClone(state);
  advance(state, 1);
  assert.deepEqual(state, initial);
  startGame(state);
  assert.equal(state.phase, 'playing');
  advance(state, 0.25);
  assert.ok(state.time > 0);
});

for (const kind of ['thorn', 'ice', 'mushroom']) {
  test(`a missed ${kind} seed grows at the aimed ground point`, () => {
    const state = isolatedGame();
    const target = { x: state.player.x + 200, y: state.player.y - 50 };
    selectSeed(state, kind);
    const initialAmmo = state.seeds[kind];
    assert.equal(castSeed(state, target), true);
    assert.equal(state.seeds[kind], initialAmmo - 1);
    assert.equal(state.stats.seedShots, 1);
    assert.equal(state.plants.length, 0, 'seeds must travel before growing');
    advance(state, 0.8);
    const grown = state.plants.find((entry) => entry.kind === kind);
    assert.ok(grown, 'the seed must create its matching terrain');
    assert.ok(Math.hypot(grown.x - target.x, grown.y - target.y) < 2);
    assert.equal(state.stats.plantsGrown, 1);
  });

  test(`a direct ${kind} seed hit damages an enemy without creating terrain`, () => {
    const state = isolatedGame();
    const victim = enemy(state, { x: state.player.x + 120 });
    selectSeed(state, kind);
    assert.equal(castSeed(state, { x: victim.x + 80, y: victim.y }), true);
    advance(state, 0.6);
    assert.ok(victim.hp < victim.maxHp);
    assert.equal(state.plants.length, 0);
    assert.equal(state.stats.plantsGrown, 0);
  });
}

test('ordinary missed bullets never create terrain', () => {
  const state = isolatedGame();
  advance(state, 2, {
    ...idle,
    firing: true,
    aimX: state.player.x + 300,
    aimY: state.player.y,
  });
  assert.ok(state.stats.shots > 0);
  assert.equal(state.stats.seedShots, 0);
  assert.equal(state.stats.plantsGrown, 0);
  assert.equal(state.plants.length, 0);
});

test('empty seed charges and the shared cooldown reject casts without consuming charges', () => {
  const state = isolatedGame();
  selectSeed(state, 'ice');
  state.seeds.ice = 0;
  const target = { x: state.player.x + 150, y: state.player.y };
  assert.equal(castSeed(state, target), false);
  assert.equal(state.stats.seedShots, 0);
  state.seeds.ice = 2;
  assert.equal(castSeed(state, target), true);
  assert.equal(castSeed(state, target), false);
  assert.equal(state.seeds.ice, 1);
  assert.equal(state.stats.seedShots, 1);
});

test('the active plant cap prevents accumulated terrain from filling the arena', () => {
  const state = isolatedGame();
  state.plantCap = 3;
  state.seeds.thorn = 10;
  for (let index = 0; index < 6; index += 1) {
    state.seedCooldown = 0;
    assert.equal(castSeed(state, { x: 500 + index * 70, y: 320 }), true);
    advance(state, 0.8);
    assert.ok(state.plants.length <= state.plantCap);
  }
  assert.ok(state.plants.length > 0);
  assert.ok(state.stats.plantsGrown >= 3);
});

test('expired terrain is removed and releases capacity', () => {
  const state = isolatedGame();
  const expired = plant(state, 'thorn', { life: 0.1 });
  const lasting = plant(state, 'ice', { id: 20001, y: state.player.y + 100, life: 20 });
  advance(state, 0.3);
  assert.ok(!state.plants.some((entry) => entry.id === expired.id));
  assert.ok(state.plants.some((entry) => entry.id === lasting.id));
});

test('ice blocks movement while the player can slide around its edge', () => {
  const state = isolatedGame();
  const ice = plant(state, 'ice', { radius: 30, life: 30, hp: 1000, maxHp: 1000 });
  advance(state, 1, { ...idle, moveX: 1 });
  assert.ok(state.player.x < ice.x, 'moving into an ice column must not pass through it');
  assert.ok(
    Math.hypot(state.player.x - ice.x, state.player.y - ice.y) >=
      state.player.radius + ice.radius - 1,
  );
  const blockedX = state.player.x;
  advance(state, 0.7, { ...idle, moveX: 1, moveY: 1 });
  assert.ok(state.player.x > blockedX + 20, 'diagonal movement must let the player go around ice');
});

for (const kind of ['sprout', 'runner', 'brute']) {
  test(`${kind} enemies get past an ice column by routing around or breaking it`, () => {
    const state = isolatedGame();
    const ice = plant(state, 'ice', { x: 920, life: 60 });
    const pursuer = enemy(state, { kind, x: 1080, radius: ENEMIES[kind].radius });
    let lateralTravel = 0;
    const passedColumn = () => pursuer.x < ice.x - ice.radius - pursuer.radius;
    for (let elapsed = 0; elapsed < 12 && !passedColumn(); elapsed += 1 / 60) {
      step(state, 1 / 60, idle);
      lateralTravel = Math.max(lateralTravel, Math.abs(pursuer.y - ice.y));
      if (ice.hp > 0) {
        assert.ok(
          Math.hypot(pursuer.x - ice.x, pursuer.y - ice.y) >= pursuer.radius + ice.radius - 1,
          'enemies must not walk through solid ice',
        );
      }
    }
    assert.ok(passedColumn(), 'ice must not permanently trap a pursuing enemy');
    assert.ok(
      lateralTravel > ice.radius || ice.hp <= 0,
      'getting past the column requires a visible detour or destroying it',
    );
    assert.ok(ice.age < ice.life, 'progress must not depend on the obstacle expiring');
  });
}

for (const kind of ['thorn', 'ice', 'mushroom']) {
  test(`${kind} seed charges regenerate at their configured interval and stop at capacity`, () => {
    const state = isolatedGame();
    const definition = SEEDS[kind];
    state.seeds[kind] = definition.capacity - 2;
    state.seedRegen[kind] = 0;
    advance(state, definition.regenSeconds - 0.05);
    assert.equal(state.seeds[kind], definition.capacity - 2, 'charges must not recover early');
    advance(state, 0.1);
    assert.equal(state.seeds[kind], definition.capacity - 1);
    advance(state, definition.regenSeconds);
    assert.equal(state.seeds[kind], definition.capacity);
    advance(state, definition.regenSeconds * 2);
    assert.equal(state.seeds[kind], definition.capacity, 'recovery must respect the ammo cap');
  });
}

test('thorn terrain slows enemies and deals damage while they cross it', () => {
  const ordinary = isolatedGame();
  const overgrown = isolatedGame();
  const normalEnemy = enemy(ordinary, { x: ordinary.player.x + 200 });
  const slowedEnemy = enemy(overgrown, { x: overgrown.player.x + 200 });
  plant(overgrown, 'thorn', { x: slowedEnemy.x, y: slowedEnemy.y });
  advance(ordinary, 0.3);
  advance(overgrown, 0.3);
  assert.ok(
    slowedEnemy.x > normalEnemy.x + 2,
    'thorn enemies must advance less than normal enemies',
  );
  assert.ok(slowedEnemy.hp < slowedEnemy.maxHp);
  assert.ok(overgrown.stats.terrainDamage > 0);
});

test('a mushroom waits before blasting, damages an area, and credits terrain kills', () => {
  const state = isolatedGame();
  const mushroom = plant(state, 'mushroom', { x: 1000, y: 400 });
  const nearby = enemy(state, { id: 10001, x: mushroom.x + 10, y: mushroom.y, hp: 1 });
  const secondNearby = enemy(state, { id: 10002, x: mushroom.x - 20, y: mushroom.y + 20, hp: 500 });
  const outside = enemy(state, { id: 10003, x: 200, y: 650, hp: 500 });
  advance(state, 0.05);
  assert.equal(
    nearby.hp,
    nearby.maxHp,
    'mushrooms must advertise the delayed blast before dealing damage',
  );
  for (
    let elapsed = 0;
    elapsed < SEEDS.mushroom.life + 2 && state.plants.some((entry) => entry.id === mushroom.id);
    elapsed += 1 / 60
  ) {
    // Keep the targets at known distances so this checks blast radius independently of pursuit.
    nearby.x = mushroom.x + 10;
    nearby.y = mushroom.y;
    secondNearby.x = mushroom.x - 20;
    secondNearby.y = mushroom.y + 20;
    outside.x = 200;
    outside.y = 650;
    step(state, 1 / 60, idle);
  }
  assert.ok(!state.plants.some((entry) => entry.id === mushroom.id));
  assert.ok(!state.enemies.some((entry) => entry.id === nearby.id));
  assert.ok(secondNearby.hp < secondNearby.maxHp, 'a blast must affect more than one nearby enemy');
  assert.equal(outside.hp, outside.maxHp, 'an enemy outside the blast must not be damaged');
  assert.equal(state.stats.plantKills, 1);
  assert.ok(state.stats.terrainDamage > 0);
});

test('automatic fire targets the closest enemy and does not waste shots on empty ground', () => {
  const state = isolatedGame();
  advance(state, 0.4, { ...idle, autoFire: true });
  assert.equal(state.stats.shots, 0);
  const near = enemy(state, { id: 10000, x: state.player.x + 110 });
  const far = enemy(state, { id: 10001, x: state.player.x - 220 });
  advance(state, 0.4, { ...idle, autoFire: true });
  assert.ok(state.stats.shots > 0);
  assert.ok(near.hp < near.maxHp);
  assert.equal(far.hp, far.maxHp);
});

test('pause freezes the entire simulation and resume continues the same run', () => {
  const state = isolatedGame();
  castSeed(state, { x: state.player.x + 200, y: state.player.y });
  pauseGame(state);
  assert.equal(state.phase, 'paused');
  const paused = structuredClone(state);
  advance(state, 1, { ...idle, moveX: 1, firing: true, autoFire: true });
  assert.deepEqual(state, paused);
  resumeGame(state);
  assert.equal(state.phase, 'playing');
  advance(state, 0.2);
  assert.ok(state.time > paused.time);
});

test('ten waves pause for three upgrades before the five-minute victory', () => {
  const state = isolatedGame();
  const stops = [];
  for (let iterations = 0; state.phase !== 'won' && iterations < 4000; iterations += 1) {
    step(state, 0.1, idle);
    if (state.phase !== 'upgrade') continue;
    stops.push({ time: state.time, wave: state.wave });
    assert.equal(state.upgradeChoices.length, 3);
    const frozenTime = state.time;
    step(state, 0.1, idle);
    assert.equal(state.time, frozenTime);
    assert.equal(chooseUpgrade(state, 'not-an-upgrade'), false);
    assert.equal(state.phase, 'upgrade');
    const selected = state.upgradeChoices[0];
    assert.equal(chooseUpgrade(state, selected), true);
    assert.equal(state.phase, 'playing');
    assert.ok(state.upgrades.includes(selected));
  }
  assert.equal(state.phase, 'won');
  assert.equal(state.wave, 10);
  assert.ok(Math.abs(state.time - state.duration) < 0.11);
  assert.deepEqual(
    stops.map((stop) => stop.wave),
    [4, 7, 10],
  );
  for (const [index, stop] of stops.entries()) {
    assert.ok(Math.abs(stop.time - (index + 1) * 90) < 0.11);
  }
  assert.equal(state.upgrades.length, 3);
  const won = structuredClone(state);
  step(state, 0.1, idle);
  assert.deepEqual(state, won);
});

test('enemy contact can end the run and a lost run cannot keep advancing', () => {
  const state = isolatedGame();
  state.player.hp = 1;
  state.player.invulnerable = 0;
  enemy(state, { x: state.player.x, y: state.player.y, kind: 'brute' });
  advance(state, 0.3);
  assert.equal(state.phase, 'lost');
  assert.equal(state.player.hp, 0);
  const lost = structuredClone(state);
  advance(state, 0.3);
  assert.deepEqual(state, lost);
});

test('movement and dashes stay inside arena bounds and dash has a cooldown', () => {
  const state = isolatedGame();
  state.player.x = 1320;
  state.player.y = 730;
  assert.equal(dash(state, { x: 1, y: 1 }), true);
  assert.equal(dash(state, { x: 1, y: 1 }), false);
  advance(state, 2, { ...idle, moveX: 1, moveY: 1 });
  assert.ok(state.player.x <= 1340 - state.player.radius);
  assert.ok(state.player.y <= 750 - state.player.radius);
  advance(state, 10, { ...idle, moveX: -1, moveY: -1 });
  assert.ok(state.player.x >= 100 + state.player.radius);
  assert.ok(state.player.y >= 150 + state.player.radius);
});

test('the same seed and inputs reproduce combat exactly and remain JSON serializable', () => {
  const first = createGame('ruins', 731);
  const second = createGame('ruins', 731);
  startGame(first);
  startGame(second);
  for (let frame = 0; frame < 1200; frame += 1) {
    const angle = frame / 120;
    const input = { ...idle, moveX: Math.cos(angle), moveY: Math.sin(angle), autoFire: true };
    for (const state of [first, second]) {
      if (frame % 180 === 0) {
        selectSeed(state, ['thorn', 'ice', 'mushroom'][(frame / 180) % 3]);
        castSeed(state, { x: 650 + Math.cos(angle) * 100, y: 400 + Math.sin(angle) * 100 });
      }
      step(state, 1 / 60, input);
    }
  }
  assert.deepEqual(first, second);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  assert.ok(first.stats.shots > 0);
  assert.ok(first.stats.seedShots > 0);
});
