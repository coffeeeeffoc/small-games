import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, ENEMIES, SEEDS, WEATHER, UPGRADES, registerContentPack } from '../src/config.mjs';
import { validateContentPack } from '../src/content-schema.mjs';
import { createGame, startGame } from '../src/simulation.mjs';
import { createProfile, isLevelUnlocked } from '../src/progression.mjs';

const current = () => ({
  levels: LEVELS,
  enemies: ENEMIES,
  plants: SEEDS,
  weather: WEATHER,
  buffs: UPGRADES,
});
function extraLevel(id = 'extension-garden', order = 12) {
  const level = structuredClone(LEVELS.ruins);
  return {
    ...level,
    id,
    order,
    name: '扩展庭院',
    encounter: null,
    visual: { ...level.visual, designReference: 'docs/design/concepts/map-ruins.png' },
  };
}

test('content validation rejects a mixed invalid pack without partial installation', () => {
  const before = JSON.stringify(current());
  const invalid = extraLevel();
  invalid.spawn.composition[0].weights = { missing: 1 };
  const result = registerContentPack({
    version: 1,
    levels: [invalid],
    enemies: [{ ...ENEMIES.sprout, id: 'new-sprout' }],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /missing/);
  assert.equal(JSON.stringify(current()), before);
});

test('content requires prior art, supported handlers and safe connected geometry', () => {
  const noArt = extraLevel();
  delete noArt.visual;
  delete noArt.art;
  delete noArt.designReference;
  assert.equal(validateContentPack({ version: 1, levels: [noArt] }, current()).ok, false);
  const unsupported = {
    ...structuredClone(ENEMIES.sprout),
    id: 'scripted-sprout',
    abilities: [{ type: 'eval' }],
  };
  assert.equal(validateContentPack({ version: 1, enemies: [unsupported] }, current()).ok, false);
  const blocked = extraLevel();
  blocked.terrain = [{ id: 'spawn-stone', kind: 'wall', ...blocked.playerStart, radius: 35 }];
  assert.match(
    validateContentPack({ version: 1, levels: [blocked] }, current()).errors.join('\n'),
    /blocked player spawn/,
  );
  const split = extraLevel();
  split.terrain = Array.from({ length: 14 }, (_, index) => ({
    id: `stone-${index}`,
    kind: 'wall',
    x: 600,
    y: 185 + index * 40,
    radius: 35,
  }));
  assert.match(
    validateContentPack({ version: 1, levels: [split] }, current()).errors.join('\n'),
    /disconnected arena/,
  );
});

test('Dynamic Content cannot contain functions, reserved keys or unsupported versions', () => {
  assert.equal(validateContentPack({ version: 2, levels: [extraLevel()] }, current()).ok, false);
  assert.equal(validateContentPack({ version: 1, action: () => {} }, current()).ok, false);
  assert.equal(
    validateContentPack(JSON.parse('{"version":1,"__proto__":{"polluted":true}}'), current()).ok,
    false,
  );
  assert.equal({}.polluted, undefined);
});

test('dynamic buffs reject unsupported operator semantics and preserve repeated multipliers', () => {
  const makeBuff = (stat, op, value) => ({
    id: 'content-effect-check',
    name: '扩展增益',
    maxRank: 2,
    art: 'docs/design/concepts/growth-weapons-plants.png',
    effects: [{ stat, op, value }],
  });
  for (const [stat, op, value] of [
    ['maxHp', 'addPercent', 0.2],
    ['heal', 'add', 20],
    ['seedRegen', 'addPercent', 0.2],
    ['burst', 'multiply', 1.2],
    ['burst', 'add', 0.5],
    ['terrainDamage', 'multiply', 1.2],
  ])
    assert.equal(registerContentPack({ version: 1, buffs: [makeBuff(stat, op, value)] }).ok, false);
  assert.equal(
    registerContentPack({ version: 1, buffs: [makeBuff('damage', 'multiply', 1.2)] }).ok,
    true,
  );
  const game = createGame('ruins');
  startGame(game);
  game.upgrades.push('content-effect-check', 'content-effect-check');
  game.spawnTimer = 1000;
  // Normal auto fire also fires into an empty courtyard, using the same stat resolver.
  return import('../src/simulation.mjs').then(({ step }) => {
    step(game, 1 / 60);
    assert.ok(Math.abs(game.bullets[0].damage - 19 * 1.2 * 1.2) < 1e-9);
  });
});

test('hundreds of map definitions load atomically and use unchanged simulation and progression', () => {
  const levels = Array.from({ length: 300 }, (_, index) =>
    extraLevel(`garden-${index + 12}`, index + 12),
  );
  const source = { version: 1, levels };
  const levelsIdentity = LEVELS;
  assert.equal(registerContentPack(source).ok, true);
  assert.equal(LEVELS, levelsIdentity);
  assert.equal(Object.values(LEVELS).length, 311);
  source.levels[0].name = 'mutated input';
  assert.equal(LEVELS['garden-12'].name, '扩展庭院');
  assert.ok(Object.isFrozen(LEVELS['garden-12']));
  const profile = createProfile({
    completed: Object.values(LEVELS)
      .filter((level) => level.order < 311)
      .map((level) => level.id),
  });
  assert.equal(isLevelUnlocked(profile, 'garden-311'), true);
  const game = createGame('garden-311', 7, profile);
  startGame(game);
  assert.equal(game.levelId, 'garden-311');
  assert.equal(game.phase, 'playing');
  assert.equal(game.duration, LEVELS['garden-311'].duration);
  const duplicate = registerContentPack({ version: 1, levels: [extraLevel('garden-12', 312)] });
  assert.equal(duplicate.ok, false);
});
