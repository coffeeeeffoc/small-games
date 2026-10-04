import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENEMIES,
  LEVELS,
  BOONS,
  SEEDS,
  UPGRADES,
  WEATHER,
  WEATHER_MODIFIERS,
} from '../src/config.mjs';
import { createProfile, profileStats } from '../src/progression.mjs';
import {
  createGame,
  startGame,
  step,
  selectSeed,
  castSeed,
  chooseUpgrade,
  pauseGame,
  resumeGame,
} from '../src/simulation.mjs';

const idle = { moveX: 0, moveY: 0, firing: false, autoFire: false };
const frame = 1 / 60;

// Isolated rule scenarios deliberately remove unrelated spawns/terrain. These
// are not balance replays and do not count as evidence of natural victories.
function isolated(levelId = 'ruins', profile = null, seed = 1729) {
  const state = createGame(levelId, seed, profile, {
    dev: true,
    weather: LEVELS[levelId].weather,
    map: levelId,
    skills: ['blast', 'gale'],
  });
  startGame(state);
  // Isolated ability fixtures exercise summons independently of campaign species unlocks.
  state.availableEnemies = Object.keys(ENEMIES);
  state.enemies = [];
  state.plants = [];
  state.bullets = [];
  state.telegraphs = [];
  state.terrain = [];
  state.spawnTimer = 1e6;
  state.pet = null;
  return state;
}

function advance(state, seconds, input = idle, observe = () => {}) {
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += frame) {
    step(state, Math.min(frame, seconds - elapsed), input);
    observe(state);
  }
}

function enemy(state, kind = 'sprout', overrides = {}) {
  const definition = ENEMIES[kind];
  assert.ok(definition, `registered enemy ${kind}`);
  const body = {
    id: ++state.nextId,
    kind,
    x: state.player.x + 300,
    y: state.player.y,
    hp: definition.hp,
    maxHp: definition.hp,
    radius: definition.radius,
    angle: 0,
    hit: 0,
    age: 0,
    attackCooldown: 1000,
    biteCooldown: 0,
    slow: 1,
    stuck: 0,
    layer: 'ground',
    height: 0,
    rank: definition.rank ?? 'normal',
    armor: definition.armor ?? 0,
    shield: definition.shield ?? 0,
    maxShield: definition.shield ?? 0,
    controlResistance: definition.controlResistance ?? 0,
    abilityState: {},
    bossPhase: 1,
    ...overrides,
  };
  state.enemies.push(body);
  return body;
}

function bullet(state, victim, damage, overrides = {}) {
  const projectile = {
    id: ++state.nextId,
    kind: 'normal',
    source: 'normal',
    x: victim.x - 2,
    y: victim.y,
    vx: 120,
    vy: 0,
    targetX: victim.x + 200,
    targetY: victim.y,
    remaining: 300,
    life: 2,
    radius: 4,
    damage,
    remainingPierce: 0,
    hitIds: [],
    ...overrides,
  };
  state.bullets.push(projectile);
  return projectile;
}

function plant(state, kind, overrides = {}) {
  const definition = Object.values(BOONS).find((boon) => boon.kind === kind) ?? SEEDS[kind];
  const body = {
    id: ++state.nextId,
    kind,
    x: state.player.x + 300,
    y: state.player.y,
    radius: definition.radius,
    age: 0,
    life: definition.life,
    hp: definition.health ?? 1,
    maxHp: definition.health ?? 1,
    ...overrides,
  };
  state.plants.push(body);
  return body;
}

test('starting and retrying preserve permanent growth and the supplied transaction ID', () => {
  const profile = createProfile({
    xp: 670,
    coins: 150,
    completed: ['ruins'],
    upgrades: { attack: 2, health: 2, armor: 3, weaponPierce: 1, pet: 1 },
  });
  const state = createGame('ruins', 42, profile);
  state.runId = 'combat-transaction';
  startGame(state);
  assert.deepEqual(state.profile, profile);
  assert.equal(state.runId, 'combat-transaction');
  assert.equal(state.player.maxHp, 130);
  assert.equal(state.player.hp, 130);
  assert.ok(state.pet, 'level-five profile has a companion');
  state.player.hp = 1;
  state.coins = 999;
  state.upgrades = ['wild-heart'];
  startGame(state);
  assert.deepEqual(state.profile, profile);
  assert.equal(state.runId, 'combat-transaction');
  assert.equal(state.player.hp, 130);
  assert.equal(state.coins, 0);
  assert.deepEqual(state.upgrades, []);
  assert.deepEqual(profile.coins, 150, 'run-local coins cannot mutate the wallet');
});

test('permanent attack and fire-rate growth change actual gun damage and shot count', () => {
  const baseline = isolated();
  const grownProfile = createProfile({ upgrades: { attack: 3, fireRate: 10 } });
  const grown = isolated('ruins', grownProfile);
  const first = enemy(baseline, 'sprout', { hp: 10000, maxHp: 10000 });
  const second = enemy(grown, 'sprout', { hp: 10000, maxHp: 10000 });
  advance(baseline, 1, { ...idle, autoFire: true });
  advance(grown, 1, { ...idle, autoFire: true });
  assert.ok(grown.stats.shots > baseline.stats.shots, 'growth increases shots per second');
  assert.ok(second.maxHp - second.hp > first.maxHp - first.hp, 'growth increases delivered damage');
  assert.deepEqual(grownProfile.upgrades, grown.profile.upgrades);
});

test('armor reduces actual contact damage without changing enemy damage or maximum health', () => {
  const baseline = isolated();
  const protectedState = isolated('ruins', createProfile({ xp: 115, upgrades: { armor: 15 } }));
  for (const state of [baseline, protectedState]) {
    enemy(state, 'brute', {
      x: state.player.x,
      y: state.player.y,
      attackCooldown: 0,
      armor: 0,
    });
    advance(state, 0.1);
  }
  const ordinaryDamage = baseline.player.maxHp - baseline.player.hp;
  const armoredDamage = protectedState.player.maxHp - protectedState.player.hp;
  assert.ok(ordinaryDamage > armoredDamage && armoredDamage >= 1);
  assert.equal(protectedState.player.maxHp, baseline.player.maxHp);
});

test('pet unlocks at the experience threshold and fires only at an available target', () => {
  const locked = createGame('ruins', 42, createProfile({ xp: 669 }));
  startGame(locked);
  assert.equal(locked.pet, null);
  const state = createGame('ruins', 42, createProfile({ xp: 670 }));
  startGame(state);
  state.spawnTimer = 1e6;
  advance(state, 1.3);
  assert.equal(
    state.bullets.some((shot) => shot.source === 'pet'),
    false,
  );
  const victim = enemy(state, 'sprout', { x: state.player.x + 120, hp: 1000, maxHp: 1000 });
  advance(state, 1.4);
  assert.ok(victim.hp < victim.maxHp, 'companion causes real combat damage');
  assert.equal(state.stats.shots, 0, 'companion shots are separate from gun actions');
});

test('new passive plants respect permanent levels and generate only after an XP boon choice', () => {
  const state = isolated();
  assert.equal(selectSeed(state, 'sunflower'), false);
  assert.equal(castSeed(state, { x: state.player.x + 100, y: state.player.y }), false);
  assert.deepEqual(state.boons, []);
  for (const run of [state]) {
    run.progression.level = 2;
    run.progression.pending = 1;
    run.progression.queue = [2];
    run.phase = 'upgrade';
    run.upgradeChoices = ['boon-sunflower'];
  }
  assert.equal(
    chooseUpgrade(state, 'boon-sunflower'),
    false,
    'local XP cannot bypass permanent plant lock',
  );
  const unlocked = isolated('ruins', createProfile({ xp: 115 }));
  advance(unlocked, 5);
  assert.equal(unlocked.plants.length, 0, 'permanent unlock alone never grants automatic terrain');
  unlocked.progression.level = 2;
  unlocked.progression.pending = 1;
  unlocked.progression.queue = [2];
  unlocked.phase = 'upgrade';
  unlocked.upgradeChoices = ['boon-sunflower'];
  assert.equal(chooseUpgrade(unlocked, 'boon-sunflower'), true);
  advance(unlocked, BOONS.sunflower.interval + 0.2);
  assert.ok(unlocked.plants.some((entry) => entry.kind === 'sunflower'));
});

test('piercing projectiles damage each enemy once even while overlapping for many frames', () => {
  const state = isolated();
  const victim = enemy(state, 'sprout', { hp: 1000, maxHp: 1000 });
  bullet(state, victim, 25, { vx: 0, vy: 0, remainingPierce: 3 });
  advance(state, 0.2);
  assert.equal(victim.hp, 975, 'a piercing bullet cannot damage the same target every frame');
});

test('gun penetration hits two aligned targets and stops before a third target', () => {
  const profile = createProfile({ xp: 450, upgrades: { weaponPierce: 1 } });
  const state = isolated('ruins', profile);
  const victims = [120, 190, 260].map((offset) =>
    enemy(state, 'sprout', {
      x: state.player.x + offset,
      hp: 1000,
      maxHp: 1000,
    }),
  );
  step(state, frame, {
    ...idle,
    firing: true,
    aimX: state.player.x + 400,
    aimY: state.player.y,
  });
  advance(state, 0.5);
  const damage = profileStats(profile).damage;
  assert.equal(victims[0].maxHp - victims[0].hp, damage);
  assert.equal(victims[1].maxHp - victims[1].hp, damage);
  assert.equal(victims[2].hp, victims[2].maxHp);
  assert.equal(state.stats.shots, 1);
  assert.equal(state.plants.length, 0);
});

test('monster armor and shields absorb damage before health', () => {
  const state = isolated();
  const armored = enemy(state, 'brute');
  bullet(state, armored, 30);
  advance(state, 0.03);
  assert.equal(armored.maxHp - armored.hp, Math.max(1, 30 - ENEMIES.brute.armor));
  const guarded = enemy(state, 'shield', { y: state.player.y + 100 });
  const originalShield = guarded.shield;
  bullet(state, guarded, 30);
  advance(state, 0.03);
  assert.equal(guarded.hp, guarded.maxHp);
  assert.equal(guarded.shield, originalShield - 30);
  bullet(state, guarded, guarded.shield + 15);
  advance(state, 0.03);
  assert.equal(guarded.shield, 0);
  assert.equal(guarded.maxHp - guarded.hp, 15);
});

test('compound defenses spend raw damage on the shield before reducing remaining health damage by armor', () => {
  for (const [damage, shield, healthDamage] of [
    [30, 0, 4],
    [10, 10, 0],
  ]) {
    const state = isolated();
    const guarded = enemy(state, 'shield', { armor: 6, shield: 20, maxShield: 20 });
    bullet(state, guarded, damage);
    advance(state, 0.04);
    assert.equal(guarded.shield, shield);
    assert.equal(
      guarded.maxHp - guarded.hp,
      healthDamage,
      'fully absorbed damage cannot leak a minimum-health hit',
    );
  }
});

test('explosions amplify shield damage while only the unabsorbed raw damage reaches armor', () => {
  const state = isolated();
  const shielded = enemy(state, 'shield', {
    armor: 12,
    shield: 500,
    maxShield: 500,
    hp: 1000,
    maxHp: 1000,
  });
  const broken = enemy(state, 'shield', {
    x: shielded.x + 45,
    armor: 12,
    shield: 65,
    maxShield: 65,
    hp: 1000,
    maxHp: 1000,
  });
  plant(state, 'mushroom', { x: shielded.x, y: shielded.y, life: 0.01 });
  advance(state, 0.04);
  assert.ok(Math.abs(shielded.shield - (500 - 105 * 1.3)) < 1e-8);
  assert.equal(shielded.hp, shielded.maxHp);
  assert.equal(broken.shield, 0);
  assert.equal(broken.maxHp - broken.hp, 105 - 65 / 1.3 - (12 - 6));
});

test('shield-break stun prevents movement and biting nearby ice even with an overlapping enemy', () => {
  const state = isolated();
  const lord = enemy(state, 'bastionlord', { x: 960 });
  const ice = plant(state, 'ice', {
    x: lord.x - lord.radius - 28 - 5,
    hp: 1000,
    maxHp: 1000,
    life: 30,
  });
  enemy(state, 'sprout', { x: lord.x + 5, y: lord.y, radius: 19 });
  bullet(state, lord, lord.shield + 5);
  advance(state, 0.04);
  assert.equal(lord.shield, 0);
  assert.ok(lord.stun > 0);
  const position = { x: lord.x, y: lord.y };
  const durability = ice.hp;
  advance(state, 0.6);
  assert.equal(lord.x, position.x);
  assert.equal(lord.y, position.y);
  assert.equal(ice.hp, durability, 'a stunned lord cannot bite the ice obstacle');
});

test('control resistance weakens thorn slowing but does not grant control immunity', () => {
  const ordinary = isolated();
  const resistant = isolated();
  const first = enemy(ordinary, 'sprout');
  const second = enemy(resistant, 'sentinel');
  const startX = first.x;
  for (const state of [ordinary, resistant]) plant(state, 'thorn', { radius: 300 });
  advance(ordinary, 0.1);
  advance(resistant, 0.1);
  const ordinaryFraction = (startX - first.x) / (ENEMIES.sprout.speed * 0.1);
  const resistantFraction = (startX - second.x) / (ENEMIES.sentinel.speed * 0.1);
  assert.ok(
    resistantFraction > ordinaryFraction,
    'resistant target retains more of its movement speed',
  );
  assert.ok(resistantFraction < 0.99, 'resistance must not become full immunity');
  assert.ok(first.hp < first.maxHp && second.hp < second.maxHp);
});

test('a large brood hit crosses both spawn thresholds exactly once', () => {
  const state = isolated();
  const mother = enemy(state, 'brood');
  bullet(state, mother, mother.maxHp * 0.72);
  advance(state, 0.04);
  assert.equal(state.enemies.filter((entry) => entry.kind === 'minion').length, 4);
  advance(state, 0.6);
  assert.equal(state.enemies.filter((entry) => entry.kind === 'minion').length, 4);
  bullet(state, mother, 2);
  advance(state, 0.04);
  assert.equal(state.enemies.filter((entry) => entry.kind === 'minion').length, 4);
});

test('brood summons cannot exceed the level enemy cap or recursively spawn minions', () => {
  const state = isolated('hollow');
  const mother = enemy(state, 'brood');
  const cap = LEVELS.hollow.spawn.maxEnemies;
  for (let index = 1; index < cap; index += 1)
    enemy(state, 'sprout', { x: 200 + (index % 10) * 50, y: 200 + Math.floor(index / 10) * 60 });
  bullet(state, mother, mother.maxHp * 0.72);
  advance(state, 0.04);
  assert.ok(state.enemies.length <= cap);
  assert.equal(state.enemies.filter((entry) => entry.kind === 'minion').length, 0);
  const second = isolated();
  const minion = enemy(second, 'minion');
  bullet(second, minion, minion.hp + 1);
  advance(second, 0.04);
  assert.equal(second.enemies.length, 0, 'small minions do not create further descendants');
});

test('spitter advertises its ranged attack before spawning a damaging projectile', () => {
  const state = isolated('wetland');
  enemy(state, 'spitter');
  let warned = false;
  let emitted = false;
  advance(state, 4, idle, (current) => {
    warned ||= current.telegraphs.some((entry) => entry.kind === 'ranged');
    if (current.bullets.some((entry) => entry.source === 'enemy')) {
      assert.equal(warned, true, 'enemy projectile must have an earlier visible warning');
      emitted = true;
    }
  });
  assert.equal(warned, true);
  assert.equal(emitted, true);
});

test('charger warns, locks its direction, and does not steer toward a moved player mid-charge', () => {
  const state = isolated('windpass');
  const charger = enemy(state, 'charger', { x: 1120 });
  charger.abilityState.charger = { phase: 'ready', timer: 0, angle: 0 };
  step(state, frame, idle);
  const warning = state.telegraphs.find((entry) => entry.kind === 'charge');
  assert.ok(warning);
  const warningX = charger.x,
    warningY = charger.y;
  state.player.y += 100;
  const definition = ENEMIES.charger.abilities.find((entry) => entry.type === 'charger');
  advance(state, definition.windup + 0.1);
  assert.ok(charger.x < warningX - 15, 'charge makes visible forward progress');
  assert.ok(
    Math.abs(charger.y - warningY) < 0.01,
    'charge follows the warned horizontal direction',
  );
});

test('a broken shield waits for both its recharge cooldown and a quiet period', () => {
  const state = isolated();
  const guarded = enemy(state, 'shield', { hp: 1000, maxHp: 1000 });
  bullet(state, guarded, guarded.shield + 5);
  advance(state, 0.04);
  assert.equal(guarded.shield, 0);
  advance(state, 5.4);
  bullet(state, guarded, 2);
  advance(state, 1);
  assert.equal(guarded.shield, 0, 'recent damage postpones recharge even after six seconds');
  advance(state, 2.2);
  assert.equal(guarded.shield, 35, 'recharge restores only half of the original shield');
});

test('boss phases announce transitions, summon bounded minions, and activate the final shield', () => {
  const state = isolated('heartgarden');
  const boss = enemy(state, 'overgrowth', { x: 1150 });
  bullet(state, boss, boss.maxHp * 0.4 + boss.armor);
  advance(state, 0.04);
  assert.equal(boss.bossPhase, 2);
  assert.ok(state.telegraphs.some((entry) => entry.kind === 'boss-phase' && entry.phase === 2));
  advance(state, 8.2);
  assert.equal(state.enemies.filter((entry) => entry.kind === 'minion').length, 3);
  assert.ok(state.enemies.length <= LEVELS.heartgarden.spawn.maxEnemies);
  bullet(state, boss, boss.maxHp * 0.4 + boss.armor);
  advance(state, 0.04);
  assert.equal(boss.bossPhase, 3);
  assert.equal(boss.shield, 120);
  assert.ok(state.telegraphs.some((entry) => entry.kind === 'boss-phase' && entry.phase === 3));
});

test('burrowers have a temporary underground immunity and return to the ground', () => {
  const state = isolated('terraces');
  const burrower = enemy(state, 'burrower', { x: 1180, hp: 1000, maxHp: 1000 });
  let underground = false;
  let returned = false;
  advance(state, 8, idle, (current) => {
    if (burrower.layer === 'underground' && !underground) {
      underground = true;
      bullet(current, burrower, 50);
    } else if (underground && burrower.layer === 'ground') returned = true;
  });
  assert.equal(underground, true);
  assert.equal(returned, true);
  assert.equal(burrower.hp, 1000, 'surface bullet cannot damage a submerged target');
  assert.ok(Number.isFinite(burrower.x) && Number.isFinite(burrower.y));
});

test('gliders alternate altitude while maintaining a targetable air phase', () => {
  const state = isolated('mistwood');
  const glider = enemy(state, 'glider', { x: 1180, hp: 1000, maxHp: 1000 });
  let airborne = false;
  let returned = false;
  advance(state, 6, idle, (current) => {
    if (glider.layer === 'air' && !airborne) {
      airborne = true;
      bullet(current, glider, 25);
    } else if (airborne && glider.layer === 'ground') returned = true;
  });
  assert.equal(airborne, true);
  assert.equal(returned, true);
  assert.equal(glider.hp, 975, 'ordinary gun can damage an airborne target');
});

for (const levelId of ['quarry', 'bastion', 'heartgarden']) {
  test(`${levelId} cannot win on time alone and wins only after its required encounter dies`, () => {
    const state = isolated(levelId);
    const level = LEVELS[levelId];
    state.time = level.duration - 0.05;
    state.wave = level.waves;
    advance(state, 0.15);
    assert.equal(state.phase, 'playing');
    assert.equal(state.encounter.spawned, true);
    assert.equal(state.encounter.defeated, false);
    const required = state.enemies.find((entry) => entry.id === state.encounter.enemyId);
    assert.ok(required, 'required encounter exists even when ordinary spawns are disabled');
    assert.equal(required.kind, level.encounter.kind);
    const remaining = enemy(state, 'sprout', { x: state.player.x + 200, y: state.player.y + 150 });
    bullet(state, required, required.maxHp + required.shield + 1000);
    advance(state, 0.08);
    assert.equal(state.encounter.defeated, true);
    assert.ok(
      ['playing', 'upgrade'].includes(state.phase),
      'defeating the boss still requires clearing ordinary enemies',
    );
    while (state.phase === 'upgrade') chooseUpgrade(state, state.upgradeChoices[0]);
    bullet(state, remaining, 1000);
    advance(state, 0.08);
    assert.equal(state.phase, 'won');
    const frozen = structuredClone(state);
    advance(state, 0.2);
    assert.deepEqual(state, frozen);
  });
}

test('blocked spawn candidates do not create enemies inside terrain and required encounters retry', () => {
  const ordinary = isolated();
  const obstruction = {
    id: 'blocked-fixture',
    kind: 'wall',
    x: 720,
    y: 450,
    radius: 2000,
    blocksProjectiles: true,
  };
  ordinary.terrain = [obstruction];
  ordinary.spawnTimer = 0;
  advance(ordinary, 0.1);
  assert.equal(ordinary.enemies.length, 0, 'a failed ordinary spawn cannot use a blocked fallback');

  const required = isolated('quarry');
  required.terrain = [obstruction];
  required.time = LEVELS.quarry.duration - 0.05;
  required.wave = LEVELS.quarry.waves;
  advance(required, 0.1);
  assert.equal(required.phase, 'playing');
  assert.equal(required.encounter.spawned, false);
  assert.equal(required.encounter.enemyId, null);
  assert.equal(required.enemies.length, 0);
  required.terrain = [];
  advance(required, 0.6);
  assert.equal(
    required.encounter.spawned,
    true,
    'a later legal candidate can start the required encounter',
  );
  const boss = required.enemies.find((entry) => entry.id === required.encounter.enemyId);
  assert.ok(boss);
  bullet(required, boss, boss.maxHp + boss.shield + 1000);
  advance(required, 0.08);
  assert.equal(required.phase, 'won');
});

for (const [levelId, definition] of [
  ['hailfield', WEATHER.hail],
  ['heartgarden', WEATHER_MODIFIERS.thunder],
]) {
  const { kind, interval: seconds } = definition.hazard;
  test(`${kind} weather warns before damage and freezes its danger timer when paused`, () => {
    const state = isolated(levelId);
    advance(state, seconds + 0.1);
    const warning = state.telegraphs.find((entry) => entry.kind === kind && entry.dangerous);
    assert.ok(warning, 'weather danger is visible before impact');
    state.player.x = warning.x;
    state.player.y = warning.y;
    const health = state.player.hp;
    pauseGame(state);
    const frozen = structuredClone(state);
    advance(state, 2);
    assert.deepEqual(state, frozen);
    resumeGame(state);
    advance(state, warning.life + 0.05);
    assert.ok(state.player.hp < health, 'remaining inside the warned circle causes damage');
    assert.equal(
      state.telegraphs.some((entry) => entry === warning),
      false,
    );
  });
}

test('buff stack limits reject forged choices without healing, spending, or resuming', () => {
  const state = isolated();
  const definition = UPGRADES.find((entry) => entry.id === 'wild-heart');
  const maximum = definition.maxRank ?? definition.maxStacks;
  assert.ok(Number.isInteger(maximum) && maximum > 0);
  state.upgrades = Array(maximum).fill(definition.id);
  state.phase = 'upgrade';
  state.upgradeChoices = [definition.id];
  state.player.hp = 1;
  const before = structuredClone(state);
  assert.equal(chooseUpgrade(state, definition.id), false);
  assert.deepEqual(state, before);
});

test('exhausted buff pools skip the menu instead of trapping the run', () => {
  const state = isolated();
  state.upgrades = UPGRADES.flatMap((entry) =>
    Array(entry.maxRank ?? entry.maxStacks).fill(entry.id),
  );
  state.boons = Object.keys(BOONS);
  state.boonTimers = Object.fromEntries(state.boons.map((id) => [id, 1000]));
  state.progression.xp = state.progression.nextXp - ENEMIES.sprout.xp;
  const victim = enemy(state, 'sprout', { hp: 1 });
  bullet(state, victim, 5);
  advance(state, 0.1);
  assert.equal(state.phase, 'playing');
  assert.deepEqual(state.upgradeChoices, []);
  assert.equal(state.progression.pending, 0);
});

test('expanded combat remains deterministic and JSON serializable through ability cycles', () => {
  const first = isolated('heartgarden', createProfile({ xp: 670, upgrades: { attack: 1 } }), 23);
  const second = isolated('heartgarden', createProfile({ xp: 670, upgrades: { attack: 1 } }), 23);
  for (const state of [first, second]) {
    for (const [index, kind] of [
      'charger',
      'spitter',
      'burrower',
      'glider',
      'brood',
      'shield',
    ].entries())
      enemy(state, kind, { x: 200 + index * 170, y: 220, hp: 1000, maxHp: 1000 });
  }
  for (let index = 0; index < 720; index += 1) {
    const input = {
      ...idle,
      moveX: Math.cos(index / 80),
      moveY: Math.sin(index / 80),
      autoFire: true,
    };
    step(first, frame, input);
    step(second, frame, input);
  }
  assert.deepEqual(first, second);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
});
