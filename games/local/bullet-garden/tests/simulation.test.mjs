import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, SEEDS, ENEMIES, UPGRADES } from '../src/config.mjs';
import {
  createGame,
  startGame,
  step,
  chooseUpgrade,
  pauseGame,
  resumeGame,
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

function enemy(state, overrides = {}) {
  const hp = overrides.hp ?? 500;
  const result = {
    id: ++state.nextId,
    kind: 'sprout',
    x: state.player.x + 100,
    y: state.player.y,
    hp,
    maxHp: hp,
    radius: 16,
    angle: 0,
    hit: 0,
    attackCooldown: 0.5,
    biteCooldown: 0,
    slow: 1,
    age: 0,
    stuck: 0,
    ...overrides,
  };
  state.enemies.push(result);
  return result;
}

function plant(state, kind, overrides = {}) {
  const definition = SEEDS[kind];
  const result = {
    id: ++state.nextId,
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

function fireOnce(state, dx = 1, dy = 0) {
  state.shotCooldown = 0;
  step(state, 1 / 60, {
    ...idle,
    firing: true,
    aimX: state.player.x + dx * 600,
    aimY: state.player.y + dy * 600,
  });
}

function killWithGun(state, kind = 'sprout') {
  const victim = enemy(state, { kind, hp: 1, x: state.player.x + 100 });
  fireOnce(state);
  advance(state, 0.2);
  assert.ok(victim.hp <= 0, 'the projectile must kill the real target');
  return victim;
}

function triggerUpgrade(state) {
  state.progression.xp = state.progression.nextXp - ENEMIES.sprout.xp;
  killWithGun(state);
  assert.equal(state.phase, 'upgrade');
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

test('a primary miss counts once only after the projectile finishes travelling', () => {
  const state = isolatedGame();
  fireOnce(state);
  assert.ok(state.bullets.length > 0);
  assert.equal(state.growth.misses, 0);
  assert.equal(state.stats.plantsGrown, 0);
  advance(state, 0.8);
  assert.equal(state.bullets.length, 0);
  assert.equal(state.growth.misses, 1);
  advance(state, 1);
  assert.equal(state.growth.misses, 1, 'a finished projectile cannot count twice');
  assert.equal(state.progression.xp, 0, 'empty shots cannot farm upgrade experience');
});

test('a primary hit damages its target without advancing the miss threshold', () => {
  const state = isolatedGame();
  const victim = enemy(state);
  fireOnce(state);
  advance(state, 0.8);
  assert.ok(victim.hp < victim.maxHp);
  assert.equal(state.growth.misses, 0);
  assert.equal(state.stats.plantsGrown, 0);
});

for (const kind of ['thorn', 'ice', 'mushroom']) {
  test(`the final miss automatically grows ${kind} in the latest firing direction`, () => {
    const state = isolatedGame();
    state.growth.nextKind = kind;
    state.growth.misses = state.growth.threshold - 1;
    fireOnce(state, -1, 0);
    assert.equal(state.plants.length, 0, 'terrain waits for the final miss to resolve');
    advance(state, 0.8);
    const grown = state.plants.find((entry) => entry.kind === kind);
    assert.ok(grown, 'crossing the threshold grows terrain without a cast command');
    assert.ok(grown.x < state.player.x, 'the latest missed direction controls the spawn side');
    const spawnAngle = Math.atan2(grown.y - state.player.y, grown.x - state.player.x);
    const angleDifference = Math.atan2(
      Math.sin(spawnAngle - Math.PI),
      Math.cos(spawnAngle - Math.PI),
    );
    assert.ok(
      Math.abs(angleDifference) <= LEVELS.ruins.growth.sector,
      'random placement must stay within the missed direction sector',
    );
    assert.ok(
      Math.hypot(grown.x - state.player.x, grown.y - state.player.y) >
        state.player.radius + grown.radius,
    );
    assert.equal(state.growth.misses, 0);
    assert.equal(state.stats.plantsGrown, 1);
    assert.ok(grown.life > 0 && Number.isFinite(grown.life));
  });
}

test('growing terrain preserves surplus misses and never grants experience by itself', () => {
  const state = isolatedGame();
  const remainder = 2;
  state.growth.misses = state.growth.threshold + remainder - 1;
  fireOnce(state);
  advance(state, 0.8);
  assert.equal(state.stats.plantsGrown, 1);
  assert.equal(state.growth.misses, remainder);
  assert.equal(state.progression.xp, 0);
  assert.equal(state.progression.level, 1);
});

test('natural repeated misses respect the active terrain cap', () => {
  const state = isolatedGame();
  state.plantCap = 2;
  advance(state, 15, { ...idle, firing: true, aimX: 1200, aimY: 300 });
  assert.ok(state.stats.plantsGrown > state.plantCap, 'the run must exercise replacement');
  assert.ok(state.plants.length <= state.plantCap);
  assert.ok(state.plants.length > 0);
});

test('automatically generated terrain stays inside the arena near its corners', () => {
  for (const [x, y, dx, dy] of [
    [120, 170, -1, -1],
    [1320, 730, 1, 1],
  ]) {
    const state = isolatedGame();
    state.player.x = x;
    state.player.y = y;
    state.growth.misses = state.growth.threshold - 1;
    fireOnce(state, dx, dy);
    advance(state, 0.8);
    const bounds = LEVELS.ruins.bounds;
    for (const terrain of state.plants) {
      assert.ok(terrain.x >= bounds.left + terrain.radius);
      assert.ok(terrain.x <= bounds.right - terrain.radius);
      assert.ok(terrain.y >= bounds.top + terrain.radius);
      assert.ok(terrain.y <= bounds.bottom - terrain.radius);
      assert.ok(Math.hypot(terrain.x - x, terrain.y - y) >= state.player.radius + terrain.radius);
    }
  }
});

test('expired terrain is removed and releases capacity', () => {
  const state = isolatedGame();
  const expired = plant(state, 'thorn', { life: 0.1 });
  const lasting = plant(state, 'ice', { y: state.player.y + 100, life: 20 });
  advance(state, 0.3);
  assert.ok(!state.plants.some((entry) => entry.id === expired.id));
  assert.ok(state.plants.some((entry) => entry.id === lasting.id));
});

test('automatic ice terrain does not block player movement', () => {
  const state = isolatedGame();
  const ice = plant(state, 'ice', { x: state.player.x + 80, life: 30 });
  advance(state, 1, { ...idle, moveX: 1 });
  assert.ok(state.player.x > ice.x + ice.radius, 'automatic terrain must not trap its owner');
});

for (const kind of ['thorn', 'ice']) {
  test(`${kind} terrain slows enemies while they cross it`, () => {
    const ordinary = isolatedGame();
    const overgrown = isolatedGame();
    const normalEnemy = enemy(ordinary, { x: ordinary.player.x + 200 });
    const slowedEnemy = enemy(overgrown, { x: overgrown.player.x + 200 });
    plant(overgrown, kind, { x: slowedEnemy.x, y: slowedEnemy.y });
    advance(ordinary, 0.3);
    advance(overgrown, 0.3);
    assert.ok(slowedEnemy.x > normalEnemy.x + 2, 'terrain enemies must advance less');
    if (kind === 'thorn') {
      assert.ok(slowedEnemy.hp < slowedEnemy.maxHp);
      assert.ok(overgrown.stats.terrainDamage > 0);
    }
  });
}

test('a mushroom waits before blasting, damages an area, and credits terrain kills', () => {
  const state = isolatedGame();
  const mushroom = plant(state, 'mushroom', { x: 1000, y: 400 });
  const nearby = enemy(state, { x: mushroom.x + 10, y: mushroom.y, hp: 1 });
  const secondNearby = enemy(state, { x: mushroom.x - 20, y: mushroom.y + 20 });
  const outside = enemy(state, { x: 200, y: 650 });
  advance(state, 0.05);
  assert.equal(nearby.hp, nearby.maxHp, 'a delayed blast must advertise before dealing damage');
  for (
    let elapsed = 0;
    elapsed < SEEDS.mushroom.life + 2 && state.plants.includes(mushroom);
    elapsed += 1 / 60
  ) {
    nearby.x = mushroom.x + 10;
    nearby.y = mushroom.y;
    secondNearby.x = mushroom.x - 20;
    secondNearby.y = mushroom.y + 20;
    outside.x = 200;
    outside.y = 650;
    step(state, 1 / 60, idle);
  }
  assert.ok(!state.plants.includes(mushroom));
  assert.ok(nearby.hp <= 0);
  assert.ok(secondNearby.hp < secondNearby.maxHp);
  assert.equal(outside.hp, outside.maxHp);
  assert.equal(state.stats.plantKills, 1);
  assert.equal(state.progression.xp, ENEMIES.sprout.xp);
  assert.ok(state.stats.terrainDamage > 0);
});

test('automatic fire continues in the last direction in an empty arena and targets nearby enemies', () => {
  const empty = isolatedGame();
  advance(empty, 2.5, { ...idle, autoFire: true });
  assert.ok(empty.stats.shots > 0);
  assert.ok(empty.stats.plantsGrown > 0, 'automatic fire alone must feed the garden cycle');
  assert.equal(empty.progression.xp, 0);
  const state = isolatedGame();
  const near = enemy(state, { x: state.player.x + 110 });
  const far = enemy(state, { x: state.player.x - 220 });
  advance(state, 0.4, { ...idle, autoFire: true });
  assert.ok(state.stats.shots > 0);
  assert.ok(near.hp < near.maxHp);
  assert.equal(far.hp, far.maxHp);
});

for (const kind of ['sprout', 'runner', 'brute']) {
  test(`a killed ${kind} grants its configured experience exactly once`, () => {
    const state = isolatedGame();
    killWithGun(state, kind);
    assert.equal(state.kills, 1);
    assert.equal(state.progression.xp, ENEMIES[kind].xp);
    advance(state, 1);
    assert.equal(state.kills, 1);
    assert.equal(state.progression.xp, ENEMIES[kind].xp);
  });
}

test('experience opens unique upgrade choices and freezes combat until a valid selection', () => {
  const state = isolatedGame();
  triggerUpgrade(state);
  assert.ok(state.upgradeChoices.length >= 3 && state.upgradeChoices.length <= 4);
  assert.equal(new Set(state.upgradeChoices).size, state.upgradeChoices.length);
  assert.ok(!state.upgradeChoices.includes('split-explosion'), 'locked synergies cannot appear');
  const paused = structuredClone(state);
  advance(state, 1, { ...idle, moveX: 1, firing: true, autoFire: true });
  assert.deepEqual(state, paused);
  assert.equal(chooseUpgrade(state, 'not-an-upgrade'), false);
  assert.deepEqual(state, paused);
  const selected = state.upgradeChoices[0];
  assert.equal(chooseUpgrade(state, selected), true);
  assert.equal(state.phase, 'playing');
  assert.ok(state.upgrades.includes(selected));
  assert.ok(state.player.invulnerable > 0);
});

test('one terrain explosion retains overflow experience for consecutive upgrades', () => {
  const state = isolatedGame();
  const mushroom = plant(state, 'mushroom', { x: 1000, y: 400, life: 0.05 });
  for (let index = 0; index < 6; index += 1) {
    enemy(state, { kind: 'brute', hp: 1, x: mushroom.x + index * 3, y: mushroom.y });
  }
  advance(state, 0.2);
  assert.equal(state.kills, 6);
  assert.equal(state.stats.plantKills, 6);
  assert.equal(state.phase, 'upgrade');
  let selections = 0;
  while (state.phase === 'upgrade' && selections < 10) {
    assert.equal(chooseUpgrade(state, state.upgradeChoices[0]), true);
    selections += 1;
  }
  assert.equal(selections, 2, '48 XP must pay the first 12 and next 22 XP thresholds');
  assert.equal(state.progression.xp, 14);
  assert.equal(state.progression.level, 3);
  assert.equal(state.progression.nextXp, 32);
  advance(state, 1);
  assert.equal(state.kills, 6, 'expired blast cannot pay experience again');
});

test('the upgrade draw excludes capped upgrades and eventually offers unlocked synergies', () => {
  let sawSynergy = false;
  for (let seed = 1; seed <= 30; seed += 1) {
    const state = isolatedGame(seed);
    const capped = UPGRADES.find((upgrade) => upgrade.id === 'attack-power');
    assert.ok(Number.isInteger(capped.maxRank) && capped.maxRank > 0);
    state.upgrades.push(...Array(capped.maxRank).fill(capped.id), 'split-shot');
    triggerUpgrade(state);
    assert.ok(!state.upgradeChoices.includes(capped.id));
    assert.equal(new Set(state.upgradeChoices).size, state.upgradeChoices.length);
    if (state.upgradeChoices.includes('split-explosion')) sawSynergy = true;
  }
  assert.ok(sawSynergy, 'a prerequisite should unlock an actual reachable upgrade');
});

test('pause freezes all timers, bullets, terrain and growth, then resumes the same run', () => {
  const state = isolatedGame();
  fireOnce(state);
  plant(state, 'mushroom');
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

test('wave transitions alone do not grant upgrades, and surviving five minutes wins', () => {
  const state = isolatedGame();
  for (let iterations = 0; state.phase !== 'won' && iterations < 4000; iterations += 1) {
    step(state, 0.1, idle);
    assert.notEqual(state.phase, 'upgrade', 'upgrades must depend on experience rather than waves');
  }
  assert.equal(state.phase, 'won');
  assert.equal(state.wave, 10);
  assert.ok(Math.abs(state.time - state.duration) < 0.11);
  assert.equal(state.upgrades.length, 0);
  const won = structuredClone(state);
  step(state, 0.1, idle);
  assert.deepEqual(state, won);
});

test('enemy contact can end the run and a lost run cannot keep advancing', () => {
  const state = isolatedGame();
  state.player.hp = 1;
  state.player.invulnerable = 0;
  enemy(state, { x: state.player.x, y: state.player.y, kind: 'brute', attackCooldown: 0 });
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

test('restarting clears experience, upgrades, pending growth and combat entities', () => {
  const state = isolatedGame();
  triggerUpgrade(state);
  chooseUpgrade(state, state.upgradeChoices[0]);
  fireOnce(state);
  plant(state, 'thorn');
  state.growth.misses = 2;
  startGame(state);
  const fresh = createGame('ruins', state.initialSeed);
  startGame(fresh);
  assert.deepEqual(state, fresh);
});

test('the same seed and inputs reproduce combat and upgrade draws exactly', () => {
  const first = createGame('ruins', 731);
  const second = createGame('ruins', 731);
  startGame(first);
  startGame(second);
  for (let frame = 0; frame < 3600; frame += 1) {
    const angle = frame / 120;
    const input = { ...idle, moveX: Math.cos(angle), moveY: Math.sin(angle), autoFire: true };
    for (const state of [first, second]) {
      if (state.phase === 'upgrade') chooseUpgrade(state, state.upgradeChoices[0]);
      step(state, 1 / 60, input);
    }
  }
  assert.deepEqual(first, second);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  assert.ok(first.stats.shots > 0);
  assert.ok(first.kills > 0);
  assert.ok(first.upgrades.length > 0, 'deterministic replay must exercise experience draws');
});

test('an unreflected primary that reaches the arena edge counts as one miss', () => {
  const state = isolatedGame();
  state.player.x = 1260;
  fireOnce(state);
  advance(state, 0.3);
  assert.equal(state.bullets.length, 0);
  assert.equal(state.growth.misses, 1);
});

test('a reflected primary never earns miss growth when the reflected flight expires', () => {
  const state = isolatedGame();
  state.player.x = 1130;
  state.upgrades.push('ricochet');
  fireOnce(state);
  let sawReflection = false;
  for (let frame = 0; frame < 180; frame += 1) {
    if (state.bullets.some((bullet) => bullet.reflected)) sawReflection = true;
    step(state, 1 / 60, idle);
  }
  assert.ok(sawReflection, 'the shot must actually bounce off a boundary');
  assert.equal(state.bullets.length, 0);
  assert.equal(state.growth.misses, 0);
  assert.equal(state.stats.plantsGrown, 0);
});

test('split children fly but cannot multiply the primary miss reward or split recursively', () => {
  const state = isolatedGame();
  state.upgrades.push('split-shot', 'split-explosion');
  fireOnce(state);
  const generations = new Map();
  for (let frame = 0; frame < 180; frame += 1) {
    for (const bullet of state.bullets) generations.set(bullet.id, bullet.generation);
    step(state, 1 / 60, idle);
  }
  assert.ok(
    [...generations.values()].includes(1),
    'the primary must generate real child projectiles',
  );
  assert.ok([...generations.values()].every((generation) => generation === 0 || generation === 1));
  assert.ok(generations.size <= 5, 'one shot cannot grow an unbounded projectile tree');
  assert.equal(state.bullets.length, 0);
  assert.equal(state.growth.misses, 1, 'only the missed primary may advance growth');
});

test('children from a successful primary hit do not count as missed primary shots', () => {
  const state = isolatedGame();
  state.upgrades.push('split-shot');
  const victim = enemy(state);
  fireOnce(state);
  let sawChildren = false;
  for (let frame = 0; frame < 120; frame += 1) {
    if (state.bullets.some((bullet) => bullet.generation === 1)) sawChildren = true;
    step(state, 1 / 60, idle);
  }
  assert.ok(victim.hp < victim.maxHp);
  assert.ok(sawChildren);
  assert.equal(state.growth.misses, 0);
});

test('attack power increases damage dealt by an actual projectile', () => {
  const normal = isolatedGame();
  const stronger = isolatedGame();
  stronger.upgrades.push('attack-power');
  const first = enemy(normal);
  const second = enemy(stronger);
  fireOnce(normal);
  fireOnce(stronger);
  advance(normal, 0.3);
  advance(stronger, 0.3);
  assert.ok(second.maxHp - second.hp > first.maxHp - first.hp);
});

test('attack speed increases the number of shots fired over the same interval', () => {
  const normal = isolatedGame();
  const faster = isolatedGame();
  faster.upgrades.push('attack-speed', 'attack-speed');
  for (const state of [normal, faster]) {
    enemy(state, { x: state.player.x + 350, hp: 10000 });
    advance(state, 1.5, { ...idle, autoFire: true });
  }
  assert.ok(faster.stats.shots > normal.stats.shots);
});

test('multishot creates distinct main projectiles and burst adds a timed follow-up', () => {
  const multiple = isolatedGame();
  multiple.upgrades.push('multishot');
  fireOnce(multiple);
  assert.ok(multiple.bullets.length >= 2);
  assert.ok(multiple.bullets.every((bullet) => bullet.generation === 0));
  assert.ok(new Set(multiple.bullets.map((bullet) => Math.atan2(bullet.vy, bullet.vx))).size >= 2);

  const burst = isolatedGame();
  burst.upgrades.push('burst');
  fireOnce(burst);
  const firstShots = burst.stats.shots;
  advance(burst, 0.3);
  assert.ok(
    burst.stats.shots > firstShots,
    'follow-up projectiles must launch without a second input',
  );
});

test('ice bullets slow a struck enemy and the slow wears off', () => {
  const normal = isolatedGame();
  const frozen = isolatedGame();
  frozen.upgrades.push('ice-shot');
  const first = enemy(normal, { x: normal.player.x + 300 });
  const second = enemy(frozen, { x: frozen.player.x + 300 });
  fireOnce(normal);
  fireOnce(frozen);
  advance(normal, 0.8);
  advance(frozen, 0.8);
  assert.ok(second.x > first.x + 2, 'an ice hit must measurably reduce pursuit speed');
  advance(frozen, 4);
  assert.equal(second.slow, 1, 'the projectile slow must not last forever');
});

test('fire bullets apply damage over time after the projectile disappears', () => {
  const state = isolatedGame();
  state.upgrades.push('fire-shot');
  const victim = enemy(state, { x: state.player.x + 250 });
  fireOnce(state);
  advance(state, 0.4);
  assert.equal(state.bullets.length, 0);
  const hpAfterHit = victim.hp;
  advance(state, 1);
  assert.ok(victim.hp < hpAfterHit, 'burning must continue dealing damage without new shots');
  assert.equal(state.growth.misses, 0);
});

test('explosive bullets damage nearby targets and grant each kill experience once', () => {
  const state = isolatedGame();
  state.upgrades.push('explosive-shot');
  const first = enemy(state, { x: state.player.x + 160, hp: 1 });
  const second = enemy(state, { x: first.x + 28, y: first.y + 12, hp: 1 });
  const distant = enemy(state, { x: 180, y: 650, hp: 100 });
  fireOnce(state);
  advance(state, 0.4);
  assert.ok(first.hp <= 0);
  assert.ok(second.hp <= 0, 'a second target outside the direct path must be hit by the blast');
  assert.equal(distant.hp, distant.maxHp);
  assert.equal(state.kills, 2);
  assert.equal(state.progression.xp, ENEMIES.sprout.xp * 2);
  advance(state, 1);
  assert.equal(state.kills, 2);
  assert.equal(state.progression.xp, ENEMIES.sprout.xp * 2);
  assert.equal(state.growth.misses, 0);
});

for (const kind of ['sprout', 'runner', 'brute']) {
  test(`${kind} enemies can route around or destroy temporary ice`, () => {
    const state = isolatedGame();
    const ice = plant(state, 'ice', { x: 920, life: 60 });
    const pursuer = enemy(state, { kind, x: 1080, radius: ENEMIES[kind].radius });
    let lateralTravel = 0;
    const passedColumn = () => pursuer.x < ice.x - ice.radius - pursuer.radius;
    for (let elapsed = 0; elapsed < 14 && !passedColumn(); elapsed += 1 / 60) {
      step(state, 1 / 60, idle);
      lateralTravel = Math.max(lateralTravel, Math.abs(pursuer.y - ice.y));
      if (ice.hp > 0) {
        assert.ok(
          Math.hypot(pursuer.x - ice.x, pursuer.y - ice.y) >= pursuer.radius + ice.radius - 1,
        );
      }
    }
    assert.ok(passedColumn(), 'ice must not permanently trap pursuing enemies');
    assert.ok(lateralTravel > ice.radius || ice.hp <= 0);
    assert.ok(ice.age < ice.life, 'progress must not depend on ice expiring');
  });
}

test('later experience levels offer four eligible upgrades with weapon and terrain options', () => {
  const state = isolatedGame();
  state.progression.level = 4;
  triggerUpgrade(state);
  assert.equal(state.progression.level, 5);
  assert.equal(state.upgradeChoices.length, 4);
  const categories = state.upgradeChoices.map(
    (id) => UPGRADES.find((upgrade) => upgrade.id === id).category,
  );
  assert.ok(categories.includes('weapon'));
  assert.ok(categories.includes('terrain'));
});

test('rapid multishot and bursts respect the terrain generation interval and projectile cap', () => {
  const state = isolatedGame();
  state.upgrades.push('multishot', 'multishot', 'burst', 'burst', ...Array(4).fill('attack-speed'));
  const growthTimes = [];
  let grown = 0;
  for (let frame = 0; frame < 600; frame += 1) {
    step(state, 1 / 60, { ...idle, firing: true, aimX: 1200, aimY: 300 });
    if (state.stats.plantsGrown > grown) {
      assert.equal(
        state.stats.plantsGrown - grown,
        1,
        'a burst must not release multiple pending terrain spawns at once',
      );
      growthTimes.push(state.time);
      grown = state.stats.plantsGrown;
    }
    assert.ok(state.bullets.length <= 180);
    assert.ok(state.plants.length <= state.plantCap);
    assert.ok(state.growth.misses >= 0 && state.growth.misses < state.growth.threshold);
  }
  assert.ok(growthTimes.length >= 3, 'the scenario must exercise several terrain cooldowns');
  for (let index = 1; index < growthTimes.length; index += 1) {
    assert.ok(
      growthTimes[index] - growthTimes[index - 1] >=
        LEVELS.ruins.growth.triggerInterval - 1 / 60 - 1e-8,
    );
  }
});

test('a blocked growth direction waits at the wall and releases forward after the player moves', () => {
  const state = isolatedGame();
  state.player.x = LEVELS.ruins.bounds.right - state.player.radius;
  state.growth.nextKind = 'thorn';
  state.growth.misses = state.growth.threshold - 1;
  fireOnce(state, 1, 0);
  advance(state, 0.8);
  assert.equal(state.stats.misses, 1);
  assert.equal(state.growth.pending, true);
  assert.equal(
    state.plants.length,
    0,
    'an impossible forward sector must not redirect terrain behind the player',
  );
  advance(state, 0.9, { ...idle, moveX: -1 });
  assert.equal(state.stats.misses, 1, 'opening space must not require another missed shot');
  assert.equal(state.growth.pending, false);
  assert.equal(state.stats.plantsGrown, 1);
  const grown = state.plants[0];
  assert.ok(grown.x > state.player.x);
  assert.ok(grown.x + grown.radius <= LEVELS.ruins.bounds.right);
});
