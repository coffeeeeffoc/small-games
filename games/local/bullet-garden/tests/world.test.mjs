import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVELS,
  ENEMIES,
  SEEDS,
  WEATHER,
  BOONS,
  UPGRADES,
  WEAPONS,
  registerContentPack,
} from '../src/config.mjs';
import { validateContentPack } from '../src/content-schema.mjs';
import {
  terrainSolids,
  terrainPointBlocked,
  terrainMovement,
  weatherStats,
} from '../src/world.mjs';
import { createGame, startGame, step, chooseUpgrade } from '../src/simulation.mjs';
import { eligibleUpgrades } from '../src/loadout.mjs';

const idle = { moveX: 0, moveY: 0, autoFire: false };

test('all eleven authored maps are connected, referenced and safe around player spawn', () => {
  assert.equal(Object.keys(LEVELS).length, 11);
  const result = validateContentPack(
    {
      version: 1,
      levels: Object.values(LEVELS),
      enemies: Object.values(ENEMIES),
      plants: Object.values(SEEDS),
      weather: Object.values(WEATHER),
    },
    {},
  );
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  for (const level of Object.values(LEVELS)) {
    const state = { levelId: level.id, terrain: structuredClone(level.terrain) };
    assert.equal(
      terrainPointBlocked(state, level.playerStart.x, level.playerStart.y, 120),
      false,
      level.id,
    );
    assert.ok(
      terrainSolids(state).every((terrain) => terrain.permanent && terrain.kind === 'wall'),
    );
    const contacts = [];
    for (const tier of level.spawn.composition) contacts.push(...Object.keys(tier.weights));
    assert.ok(contacts.every((id) => ENEMIES[id].unlockStage <= level.order));
  }
  assert.deepEqual(
    Object.values(LEVELS)
      .filter((level) => level.encounter)
      .map((level) => [level.order, level.encounter.rank, level.encounter.kind]),
    [
      [4, 'leader', 'warden'],
      [8, 'leader', 'bastionlord'],
      [11, 'boss', 'overgrowth'],
    ],
  );
});

test('map evolution changes at most two regions and keeps movement changes local', () => {
  const campaign = Object.values(LEVELS).sort((a, b) => a.order - b.order);
  for (let index = 1; index < campaign.length; index++) {
    const previous = new Map(campaign[index - 1].terrain.map((terrain) => [terrain.id, terrain]));
    const next = new Map(campaign[index].terrain.map((terrain) => [terrain.id, terrain]));
    const ids = new Set([...previous.keys(), ...next.keys()]);
    const changed = [...ids].filter(
      (id) => JSON.stringify(previous.get(id)) !== JSON.stringify(next.get(id)),
    );
    assert.ok(changed.length <= 2, `${campaign[index].id}: ${changed.length} changes`);
    for (const id of changed) {
      if (!previous.has(id) || !next.has(id)) continue;
      assert.ok(
        Math.hypot(previous.get(id).x - next.get(id).x, previous.get(id).y - next.get(id).y) <= 40,
      );
    }
  }
});

test('runtime terrain overrides the definition and movement layers share arena bounds', () => {
  const state = { levelId: 'ruins', terrain: [] };
  assert.deepEqual(terrainSolids(state), []);
  state.terrain.push({ id: 'fixture-wall', kind: 'wall', x: 600, y: 400, radius: 45 });
  assert.equal(terrainPointBlocked(state, 600, 400, 18), true);
  assert.equal(terrainPointBlocked(state, 600, 400, 18, 'air'), false);
  assert.equal(terrainPointBlocked(state, 600, 400, 18, 'underground'), false);
  assert.equal(terrainPointBlocked(state, 1350, 400, 18, 'air'), true);
});

test('mud affects both ground factions and rain increases only the enemy mud penalty', () => {
  const player = { x: 600, y: 400, layer: 'ground' };
  const enemy = { x: 600, y: 400, layer: 'ground' };
  const state = {
    levelId: 'ruins',
    player,
    terrain: [{ id: 'fixture-mud', kind: 'mud', x: 600, y: 400, radius: 75 }],
    weather: { kind: 'rain' },
  };
  assert.equal(terrainMovement(state, player, 1 / 60).speedMultiplier, 0.8);
  assert.equal(terrainMovement(state, enemy, 1 / 60).speedMultiplier, 0.72 * 0.95);
  enemy.layer = 'air';
  assert.equal(terrainMovement(state, enemy, 1 / 60).speedMultiplier, 1);
});

test('slope rolls once on entry, supports deterministic replay and does not roll per frame', () => {
  function fixture() {
    const player = { x: 650, y: 400, layer: 'ground', terrainLastX: 625, terrainLastY: 400 };
    return {
      levelId: 'ruins',
      randomState: 43,
      player,
      weather: { kind: 'sunny' },
      terrain: [{ id: 'fixture-slope', kind: 'slope', x: 650, y: 400, radius: 50, slipChance: 1 }],
    };
  }
  const first = fixture(),
    second = fixture();
  const movement = terrainMovement(first, first.player, 1 / 60);
  assert.deepEqual(movement, terrainMovement(second, second.player, 1 / 60));
  assert.equal(movement.speedMultiplier, 0.9);
  assert.equal(movement.slip.dx, -35);
  const entrySeed = first.randomState;
  for (let index = 0; index < 180; index++)
    assert.equal(terrainMovement(first, first.player, 1 / 60).slip, null);
  assert.equal(first.randomState, entrySeed);
  first.player.x = 780;
  terrainMovement(first, first.player, 1 / 60);
  first.player.x = 650;
  assert.ok(terrainMovement(first, first.player, 1 / 60).slip);
  assert.notEqual(first.randomState, entrySeed);
});

test('all weather presets expose finite multipliers and wind/thunder compose independently', () => {
  for (const level of Object.values(LEVELS)) {
    const modifiers = weatherStats({ levelId: level.id });
    assert.ok(Object.values(modifiers).every((value) => Number.isFinite(value) && value > 0));
  }
  const rain = weatherStats({
    levelId: 'ruins',
    weather: { kind: 'rain', wind: 1, thunder: true },
  });
  assert.equal(rain.seedRegen, 1.1);
  assert.equal(rain.slopeChance, 1.4);
  assert.equal(rain.enemySpeed, 1.08);
  assert.equal(rain.airSpeed, 1.18);
  assert.equal(rain.electricDamage, 1.2);
  assert.equal(weatherStats({ levelId: 'ruins', weather: { kind: 'fog' } }).gunRange, 0.85);
  assert.equal(weatherStats({ levelId: 'ruins', weather: { kind: 'hail' } }).iceHealth, 1.25);
});

test('invalid content packs leave every directory unchanged', () => {
  const before = JSON.stringify({ LEVELS, ENEMIES, SEEDS, WEATHER, BOONS, UPGRADES, WEAPONS });
  const invalid = {
    ...structuredClone(LEVELS.ruins),
    id: 'invalid-garden',
    order: 12,
    weather: { kind: 'missing' },
  };
  assert.equal(registerContentPack({ version: 1, levels: [invalid] }).ok, false);
  assert.equal(
    JSON.stringify({ LEVELS, ENEMIES, SEEDS, WEATHER, BOONS, UPGRADES, WEAPONS }),
    before,
  );
});

test('a new plant registered after module import is offered through real kill XP and grows automatically', () => {
  const id = 'silverflower';
  const plant = {
    ...structuredClone(SEEDS.sunflower),
    id,
    name: '银铃花',
    unlockLevel: 1,
    autoInterval: 4,
  };
  const input = structuredClone(plant);
  const initialUpgradeCount = UPGRADES.length;
  const initialWeaponCount = WEAPONS.length;
  try {
    const registered = registerContentPack({
      version: 1,
      plants: [plant],
      buffs: [
        {
          id: 'silver-shot',
          name: '银弹芯',
          category: 'weapon',
          maxStacks: 2,
          unlockLevel: 2,
          art: plant.designReference,
          effects: [{ stat: 'damage', op: 'addPercent', value: 0.1 }],
        },
      ],
    });
    assert.equal(registered.ok, true, JSON.stringify(registered.errors));
    assert.deepEqual(plant, input, 'registration must not normalize the supplied data in place');
    assert.equal(BOONS[id].interval, 4);
    assert.equal(Object.isFrozen(SEEDS[id]), true);
    assert.equal(Object.isFrozen(BOONS[id]), true);
    const weapon = UPGRADES.find((definition) => definition.id === 'silver-shot');
    assert.equal(weapon.maxRank, 2);
    assert.equal(weapon.unlockPlayerLevel, 2);
    assert.ok(WEAPONS.includes(weapon));
    assert.equal(eligibleUpgrades(createGame()).includes(weapon), false);
    let acquired = null;
    for (let seed = 1; seed <= 120 && !acquired; seed++) {
      const state = createGame('ruins', seed);
      startGame(state);
      state.terrain = [];
      state.spawnTimer = 1e6;
      state.enemies = Array.from({ length: 6 }, (_, index) => ({
        id: 100 + index,
        kind: 'sprout',
        rank: 'normal',
        x: state.player.x + 80 + index * 8,
        y: state.player.y,
        hp: 1,
        maxHp: 1,
        radius: ENEMIES.sprout.radius,
        layer: 'ground',
        armor: 0,
        controlResistance: 0,
        shield: 0,
        maxShield: 0,
        age: 0,
        angle: 0,
        hit: 0,
        attackCooldown: 1,
        biteCooldown: 0,
        slow: 1,
        abilityState: {},
      }));
      for (let index = 0; index < 50 && state.phase === 'playing'; index++)
        step(state, 0.1, { ...idle, autoFire: true });
      if (!state.upgradeChoices.includes(`boon-${id}`)) continue;
      assert.ok(state.kills >= 6);
      assert.ok(state.progression.level >= 2);
      assert.equal(chooseUpgrade(state, `boon-${id}`), true);
      assert.ok(state.boons.includes(id));
      for (let index = 0; index < 12; index++) step(state, 0.1, idle);
      assert.ok(
        state.plants.some((entry) => entry.kind === id),
        'the new effect handler must generate a live plant',
      );
      acquired = state;
    }
    assert.ok(acquired, 'a normal weighted XP offer must include the appended boon');
    const before = JSON.stringify({ SEEDS, BOONS, UPGRADES });
    assert.equal(
      registerContentPack({ version: 1, plants: [{ ...input, id: 'shrub' }] }).ok,
      false,
    );
    assert.equal(JSON.stringify({ SEEDS, BOONS, UPGRADES }), before);
  } finally {
    delete SEEDS[id];
    delete BOONS[id];
    UPGRADES.splice(initialUpgradeCount);
    WEAPONS.splice(initialWeaponCount);
  }
});
