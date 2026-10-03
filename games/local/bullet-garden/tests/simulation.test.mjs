import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, BOONS, SKILLS, ENEMIES, UPGRADES } from '../src/config.mjs';
import {
  createGame,
  configureLoadout,
  selectSkill,
  castSkill,
  selectSeed,
  castSeed,
  startGame,
  step,
  chooseUpgrade,
  pauseGame,
  resumeGame,
  dash,
} from '../src/simulation.mjs';

const idle = { moveX: 0, moveY: 0, firing: false, autoFire: false };

function isolatedGame(seed = 42, boon = null, skills = ['blast', 'gale']) {
  const state = createGame('ruins', seed);
  configureLoadout(state, { boon, skills });
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
  const definition = Object.values(BOONS).find((boon) => boon.kind === kind);
  const result = {
    id: ++state.nextId,
    kind,
    x: state.player.x + 120,
    y: state.player.y,
    radius: definition.radius,
    age: 0,
    life: definition.life,
    hp: 1,
    maxHp: 1,
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

test('automatic fire continues in the last direction in an empty arena and targets nearby enemies', () => {
  const empty = isolatedGame();
  advance(empty, 2.5, { ...idle, autoFire: true });
  assert.ok(empty.stats.shots > 0);
  assert.equal(empty.stats.plantsGrown, 0, 'empty shots cannot unlock unchosen terrain');
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

test('one active blast retains overflow experience for consecutive upgrades', () => {
  const state = isolatedGame();
  const center = { x: 1000, y: 400 };
  state.skillSlots[0].energy = 100;
  for (let index = 0; index < 6; index += 1) {
    enemy(state, { kind: 'brute', hp: 1, x: center.x + index * 3, y: center.y });
  }
  castSkill(state, center);
  advance(state, 0.7);
  assert.equal(state.kills, 6);
  assert.equal(state.stats.skillKills, 6);
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

test('pause freezes all timers, bullets, terrain and energy, then resumes the same run', () => {
  const state = isolatedGame();
  fireOnce(state);
  plant(state, 'thorn');
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

test('restarting clears experience, upgrades, skill energy and combat entities', () => {
  const state = isolatedGame();
  triggerUpgrade(state);
  chooseUpgrade(state, state.upgradeChoices[0]);
  fireOnce(state);
  plant(state, 'thorn');
  state.stats.misses = 2;
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
  assert.equal(state.stats.misses, 1);
});

test('a reflected primary never counts as an ordinary miss when the reflected flight expires', () => {
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
  assert.equal(state.stats.misses, 0);
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
  assert.equal(state.stats.misses, 1, 'only the missed primary changes the miss statistic');
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
  assert.equal(state.stats.misses, 0);
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
  assert.equal(state.stats.misses, 0);
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
  assert.equal(state.stats.misses, 0);
});

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

function readySkill(state, kind) {
  const index = state.skillSlots.findIndex((slot) => slot.kind === kind);
  assert.ok(index >= 0);
  state.skillSlots[index].energy = SKILLS[kind].energyMax;
  assert.equal(selectSkill(state, index), true);
  return index;
}

test('loadout choices are atomic, unique, and locked during combat', () => {
  const state = createGame();
  const original = structuredClone(state.loadout);
  for (const value of [
    { boon: 'missing', skills: ['blast', 'gale'] },
    { boon: 'shrub', skills: ['blast', 'blast'] },
    { boon: 'shrub', skills: ['blast'] },
    { boon: 'shrub', skills: ['blast', 'missing'] },
  ])
    assert.equal(configureLoadout(state, value), false);
  assert.deepEqual(state.loadout, original);
  assert.equal(configureLoadout(state, { boon: 'poison', skills: ['horse', 'laser'] }), true);
  startGame(state);
  assert.deepEqual(state.boons, ['poison']);
  assert.equal(configureLoadout(state, { boon: 'shrub', skills: ['blast', 'gale'] }), false);
  assert.equal(selectSkill(state, 2), false);
  assert.equal(selectSkill(state, 0.5), false);
});

test('no boon means no terrain; full energy never automatically releases a skill', () => {
  const state = isolatedGame();
  advance(state, 25, { ...idle, autoFire: true });
  assert.ok(state.stats.shots > 0);
  assert.equal(state.plants.length, 0);
  assert.equal(state.stats.plantsGrown, 0);
  assert.deepEqual(
    state.skillSlots.map((slot) => slot.energy),
    [100, 100],
  );
  assert.equal(state.stats.skillCasts, 0);
  assert.equal(state.skillEffects.length, 0);
  assert.equal(selectSeed(state, 'thorn'), false);
  assert.equal(castSeed(state, { x: 1000, y: 400 }), false);
});

for (const [boonId, definition] of Object.entries(BOONS)) {
  test(`only selected ${boonId} generates finite terrain, independently of firing`, () => {
    const state = isolatedGame(42, boonId);
    advance(state, 0.4);
    assert.equal(state.plants.length, 0);
    advance(state, 10);
    assert.ok(state.stats.plantsGrown >= 2);
    assert.ok(state.plants.every((item) => item.kind === definition.kind));
    assert.equal(state.stats.shots, 0);
    assert.equal(state.progression.xp, 0);
    const first = state.plants[0];
    state.boonTimers[boonId] = 1e6;
    advance(state, definition.life + 1);
    assert.ok(!state.plants.includes(first));
    assert.equal(state.plants.length, 0);
  });
}

test('terrain unlocks only after choosing its eligible upgrade, and never twice', () => {
  const state = isolatedGame(42, 'shrub');
  advance(state, 1);
  assert.ok(state.plants.every((item) => item.kind === 'thorn'));
  state.phase = 'upgrade';
  state.progression.pending = 1;
  state.progression.queue = [2];
  state.upgradeChoices = ['boon-trench', 'attack-power', 'wild-heart'];
  const frozen = structuredClone(state);
  advance(state, 3);
  assert.deepEqual(state, frozen);
  assert.equal(chooseUpgrade(state, 'boon-trench'), true);
  advance(state, 0.7);
  assert.ok(state.plants.some((item) => item.kind === 'trench'));
  assert.deepEqual(state.boons, ['shrub', 'trench']);
  triggerUpgrade(state);
  assert.ok(!state.upgradeChoices.includes('boon-trench'));
  assert.ok(!state.upgradeChoices.includes('boon-shrub'));
});

test('energy comes from combat time and one reward per kill, then freezes in all noncombat phases', () => {
  const state = isolatedGame();
  advance(state, 1);
  assert.ok(Math.abs(state.skillSlots[0].energy - 6) < 1e-8);
  const before = state.skillSlots[0].energy;
  killWithGun(state);
  assert.ok(Math.abs(state.skillSlots[0].energy - before - 8 - 6 * (13 / 60)) < 1e-7);
  for (const phase of ['ready', 'paused', 'upgrade', 'won', 'lost']) {
    state.phase = phase;
    const frozen = structuredClone(state);
    advance(state, 1);
    assert.deepEqual(state, frozen);
    assert.equal(castSkill(state, { x: 900, y: 400 }), false);
  }
});

test('manual skills validate targets, consume only the selected slot, clip range and respect cooldown', () => {
  const state = isolatedGame();
  const target = { x: 5000, y: 400 };
  assert.equal(castSkill(state, target), false);
  readySkill(state, 'blast');
  readySkill(state, 'gale');
  assert.equal(castSkill(state, { x: NaN, y: 500 }, 0), false);
  assert.equal(castSkill(state, target, 3), false);
  assert.equal(castSkill(state, target, 0), true);
  assert.equal(state.skillSlots[0].energy, 0);
  assert.equal(state.skillSlots[1].energy, 100);
  assert.equal(state.stats.skillCasts, 1);
  const effect = state.skillEffects[0];
  assert.ok(
    Math.hypot(effect.x - state.player.x, effect.y - state.player.y) <= SKILLS.blast.range + 1e-8,
  );
  assert.ok(effect.x <= LEVELS.ruins.bounds.right && effect.y >= LEVELS.ruins.bounds.top);
  assert.equal(castSkill(state, target, 1), false);
  advance(state, 0.35);
  assert.equal(castSkill(state, target, 1), true);
});

test('shrub slows and damages enemies while the player remains free to cross', () => {
  const normal = isolatedGame(),
    garden = isolatedGame();
  const first = enemy(normal, { x: 920 }),
    second = enemy(garden, { x: 920 });
  plant(garden, 'thorn', { x: 920 });
  advance(normal, 0.3);
  advance(garden, 0.3);
  assert.ok(second.x > first.x + 2);
  assert.ok(second.hp < second.maxHp);
  const startX = garden.player.x;
  advance(garden, 1, { ...idle, moveX: 1 });
  assert.ok(garden.player.x > startX + 190);
});

test('trench collision follows its oval shape and only slows enemies', () => {
  const state = isolatedGame();
  const ditch = plant(state, 'trench', { x: 950, y: 400 });
  const inside = enemy(state, { x: 950, y: 440 });
  const outside = enemy(state, { x: 950, y: 490 });
  const normalInside = isolatedGame(),
    normalOutside = isolatedGame();
  const controlInside = enemy(normalInside, { x: inside.x, y: inside.y });
  const controlOutside = enemy(normalOutside, { x: outside.x, y: outside.y });
  advance(state, 0.1);
  advance(normalInside, 0.1);
  advance(normalOutside, 0.1);
  assert.ok(inside.x > controlInside.x + 2);
  assert.ok(Math.abs(outside.x - controlOutside.x) < 1e-8);
  assert.equal(inside.hp, inside.maxHp);
  assert.equal(ditch.radius, BOONS.trench.radius);
});

test('frost freezes movement and contact attacks, then allows movement before refreezing', () => {
  const state = isolatedGame();
  const victim = enemy(state, { x: state.player.x, y: state.player.y, attackCooldown: 0 });
  plant(state, 'frost', { x: victim.x, y: victim.y });
  const original = { x: victim.x, y: victim.y };
  advance(state, 0.5);
  assert.deepEqual({ x: victim.x, y: victim.y }, original);
  assert.equal(state.player.hp, 100);
  assert.ok(victim.frozen > 0);
  advance(state, 0.5);
  assert.equal(victim.frozen, 0);
  assert.ok(victim.freezeCooldown > 1);
  assert.ok(state.player.hp < 100, 'an unfrozen enemy can attack during the immunity window');
  state.plants = [];
  advance(state, 4);
  assert.equal(victim.freezeCooldown, 0);
});

test('poison persists after leaving the patch, expires, and credits terrain damage', () => {
  const state = isolatedGame();
  const victim = enemy(state, { x: 1000, y: 400 });
  plant(state, 'poison', { x: victim.x, y: victim.y });
  advance(state, 0.05);
  state.plants = [];
  const poisonedHp = victim.hp;
  advance(state, 1);
  assert.ok(victim.hp < poisonedHp - 9);
  advance(state, 2.2);
  assert.equal(victim.poison, 0);
  assert.equal(victim.poisonDps, 0);
  const curedHp = victim.hp;
  advance(state, 1);
  assert.equal(victim.hp, curedHp);
  assert.ok(state.stats.terrainDamage >= 30);
});

test('blast advertises its delay, damages only its area, and its stun expires', () => {
  const state = isolatedGame();
  const victim = enemy(state, { x: 1000, y: 400 });
  const outside = enemy(state, { x: 200, y: 650 });
  readySkill(state, 'blast');
  castSkill(state, { x: victim.x, y: victim.y });
  advance(state, 0.4);
  assert.equal(victim.hp, victim.maxHp);
  advance(state, 0.2);
  assert.equal(victim.hp, victim.maxHp - SKILLS.blast.damage);
  assert.ok(victim.stunned > 0);
  const frozenX = victim.x;
  advance(state, 0.3);
  assert.equal(victim.x, frozenX);
  assert.equal(outside.hp, outside.maxHp);
  advance(state, 0.7);
  assert.equal(victim.stunned, 0);
  assert.ok(victim.x < frozenX);
  assert.equal(state.skillEffects.length, 0);
});

test('gale pushes away from its center, slows temporarily, and leaves outside targets alone', () => {
  const state = isolatedGame();
  const victim = enemy(state, { x: 1000, y: 400 });
  const outside = enemy(state, { x: 200, y: 650 });
  readySkill(state, 'gale');
  castSkill(state, { x: 950, y: 400 });
  advance(state, 0.3);
  assert.ok(victim.x > 1000);
  assert.ok(victim.hp < victim.maxHp);
  assert.ok(victim.windSlow > 0);
  assert.equal(outside.hp, outside.maxHp);
  assert.equal(outside.windSlow, 0);
  advance(state, 3);
  assert.equal(victim.windSlow, 0);
  assert.equal(state.skillEffects.length, 0);
});

for (const kind of ['cart', 'horse']) {
  test(`${kind} travels along its path, affects each target once and its control expires`, () => {
    const state = isolatedGame(42, null, [kind, 'blast']);
    const victim = enemy(state, { x: 1000, y: state.player.y });
    const outside = enemy(state, { x: 1000, y: state.player.y - 180 });
    readySkill(state, kind);
    castSkill(state, { x: 1200, y: state.player.y });
    advance(state, 0.1);
    assert.equal(victim.hp, victim.maxHp, 'travel takes time');
    advance(state, 0.3);
    assert.equal(victim.hp, victim.maxHp - SKILLS[kind].damage);
    assert.equal(outside.hp, outside.maxHp);
    if (kind === 'cart') assert.ok(victim.stunned > 0);
    else {
      assert.ok(victim.feared > 0);
      const hitX = victim.x;
      advance(state, 0.3);
      assert.ok(victim.x > hitX, 'fear retreats from the charge origin');
    }
    advance(state, 3);
    assert.equal(victim.hp, victim.maxHp - SKILLS[kind].damage, 'one charge cannot repeatedly hit');
    assert.equal(victim.stunned, 0);
    assert.equal(victim.feared, 0);
    assert.equal(state.skillEffects.length, 0);
  });
}

test('laser only hits its beam and vulnerability increases subsequent damage for a limited time', () => {
  const state = isolatedGame(42, null, ['laser', 'blast']);
  const victim = enemy(state, { x: 950, y: state.player.y });
  const outside = enemy(state, { x: 950, y: state.player.y - 120 });
  readySkill(state, 'laser');
  castSkill(state, { x: 1200, y: state.player.y });
  advance(state, 1 / 60);
  assert.equal(victim.hp, victim.maxHp - SKILLS.laser.damage);
  assert.equal(outside.hp, outside.maxHp);
  assert.ok(victim.vulnerable > 0);
  fireOnce(state);
  advance(state, 0.4);
  assert.ok(Math.abs(victim.hp - (victim.maxHp - SKILLS.laser.damage - 19 * 1.35)) < 1e-7);
  advance(state, 4);
  assert.equal(victim.vulnerable, 0);
  assert.equal(outside.vulnerable, 0);
});

test('restarting preserves chosen loadout while clearing energy, acquired boons, statuses and XP', () => {
  const state = isolatedGame(42, 'poison', ['horse', 'laser']);
  readySkill(state, 'horse');
  castSkill(state, { x: 1100, y: 470 });
  state.boons.push('frost');
  state.boonTimers.frost = 0;
  advance(state, 1);
  startGame(state);
  const fresh = createGame('ruins', 42);
  configureLoadout(fresh, { boon: 'poison', skills: ['horse', 'laser'] });
  startGame(fresh);
  assert.deepEqual(state, fresh);
});

test('all terrain and weapon combinations remain bounded, deterministic and serializable', () => {
  const states = [
    isolatedGame(19, 'shrub', ['laser', 'horse']),
    isolatedGame(19, 'shrub', ['laser', 'horse']),
  ];
  for (const state of states) {
    state.boons = Object.keys(BOONS);
    state.boonTimers = Object.fromEntries(state.boons.map((kind) => [kind, 0]));
    state.plantCap = 5;
    state.upgrades.push(
      'multishot',
      'multishot',
      'burst',
      'burst',
      'split-shot',
      'split-explosion',
      'ricochet',
      'fire-shot',
      'ice-shot',
      ...Array(4).fill('attack-speed'),
    );
  }
  for (let frame = 0; frame < 2400; frame += 1)
    for (const state of states) {
      const index = frame % 2;
      if (state.skillSlots[index].energy >= 100) castSkill(state, { x: 1100, y: 450 }, index);
      step(state, 1 / 60, {
        ...idle,
        autoFire: true,
        moveX: Math.cos(frame / 100),
        moveY: Math.sin(frame / 100),
      });
      assert.ok(state.plants.length <= state.plantCap);
      assert.ok(state.bullets.length <= 120);
      assert.ok(state.particles.length <= 240);
      assert.ok(state.skillEffects.length <= 12);
      assert.ok(
        state.skillSlots.every(
          (slot) => Number.isFinite(slot.energy) && slot.energy >= 0 && slot.energy <= 100,
        ),
      );
    }
  assert.deepEqual(states[0], states[1]);
  assert.deepEqual(JSON.parse(JSON.stringify(states[0])), states[0]);
  assert.ok(states[0].stats.skillCasts > 0);
});

test('maximum weapon effects cap visual rings without reducing any explosion damage or spawn warnings', () => {
  const state = isolatedGame();
  const victim = enemy(state, { x: 900, y: 450, hp: 100000 });
  state.telegraphs.push({ x: 1100, y: 650, radius: 30, life: 1, kind: 'spawn' });
  for (let index = 0; index < 120; index += 1)
    state.bullets.push({
      id: ++state.nextId,
      kind: 'normal',
      generation: 0,
      x: 880,
      y: 450,
      vx: 850,
      vy: 0,
      radius: 4,
      remaining: 500,
      life: 1,
      damage: 1,
      explosion: 1,
      split: 2,
      splitExplosion: 0.8,
    });
  step(state, 1 / 60, idle);
  assert.equal(victim.hp, victim.maxHp - 240, 'all 120 direct hits and explosions still apply');
  assert.equal(state.telegraphs.filter((item) => item.kind === 'explosion').length, 24);
  assert.ok(state.telegraphs.some((item) => item.kind === 'spawn'));
  assert.ok(state.telegraphs.length <= 40);
  assert.ok(state.bullets.length <= 120);
  assert.ok(state.particles.length <= 240);
  assert.ok(state.skillEffects.length <= 12);
  advance(state, 0.3);
  assert.ok(
    state.telegraphs.every((item) => item.kind === 'spawn'),
    'capped rings expire normally',
  );
});

test('fully ranked gun combinations and all boons stay bounded with 48 active enemies', () => {
  const state = isolatedGame(77, 'shrub', ['laser', 'gale']);
  state.player.invulnerable = 100;
  state.boons = Object.keys(BOONS);
  state.boonTimers = Object.fromEntries(state.boons.map((kind) => [kind, 0]));
  for (const upgrade of UPGRADES.filter((item) => item.category === 'weapon'))
    state.upgrades.push(...Array(upgrade.maxRank).fill(upgrade.id));
  for (let index = 0; index < 48; index += 1)
    enemy(state, {
      x: 180 + (index % 8) * 150,
      y: 200 + Math.floor(index / 8) * 95,
      hp: 100000,
    });
  for (let frame = 0; frame < 1200; frame += 1) {
    for (let index = 0; index < 2; index += 1) {
      if (state.skillSlots[index].energy >= 100) castSkill(state, { x: 900, y: 450 }, index);
    }
    step(state, 1 / 60, {
      autoFire: true,
      moveX: Math.cos(frame / 50),
      moveY: Math.sin(frame / 50),
    });
    assert.equal(state.enemies.length, 48);
    assert.ok(state.bullets.length <= 120);
    assert.ok(state.plants.length <= 18);
    assert.ok(state.telegraphs.length <= 40);
    assert.ok(state.particles.length <= 240);
    assert.ok(state.skillEffects.length <= 12);
  }
  assert.ok(
    state.enemies.every((entry) => entry.age > 19.9),
    'every enemy remains fully simulated',
  );
  assert.ok(state.stats.splitShots > 0);
  assert.ok(state.stats.skillCasts > 0);
  assert.ok(state.stats.terrainDamage > 0);
});

for (const status of ['frozen', 'stunned']) {
  test(`gale damages ${status} enemies without moving them until the hold ends`, () => {
    const state = isolatedGame();
    const victim = enemy(state, { x: 780, y: 470, [status]: 0.5 });
    readySkill(state, 'gale');
    castSkill(state, { x: 760, y: 470 });
    advance(state, 0.3);
    assert.equal(victim.x, 780);
    assert.equal(victim.y, 470);
    assert.ok(victim.hp < victim.maxHp);
    assert.ok(victim.windSlow > 0);
    advance(state, 0.3);
    assert.ok(victim.x > 780, 'wind pushes once the immobilizing status expires');
  });
}

test('a circle skill can target the exact player position without a directional offset', () => {
  const state = isolatedGame();
  readySkill(state, 'blast');
  castSkill(state, { x: state.player.x, y: state.player.y });
  assert.equal(state.skillEffects[0].x, state.player.x);
  assert.equal(state.skillEffects[0].y, state.player.y);
});

test('optimized swept shots retain tangent hits at the beginning, middle and end of a full-crowd path', () => {
  for (const hitX of [200, 800, 1200]) {
    const state = isolatedGame();
    for (let index = 0; index < 47; index += 1)
      enemy(state, {
        x: 180 + (index % 12) * 95,
        y: 570 + Math.floor(index / 12) * 35,
      });
    const victim = enemy(state, { kind: 'brute', x: hitX, y: 337, radius: 33 });
    state.bullets.push({
      id: ++state.nextId,
      kind: 'normal',
      x: 200,
      y: 300,
      vx: 60000,
      vy: 0,
      remaining: 1000,
      radius: 4,
      damage: 19,
      life: 1,
    });
    step(state, 1 / 60, idle);
    assert.equal(victim.hp, victim.maxHp - 19);
    assert.equal(state.bullets.length, 0);
    assert.equal(state.enemies.length, 48);
    assert.ok(state.enemies.every((entry) => entry.age > 0));
  }
});
