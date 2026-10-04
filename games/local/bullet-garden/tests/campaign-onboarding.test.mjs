import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, LEVEL_ORDER, ENEMIES, BOONS, SKILLS, UPGRADES, WEATHER } from '../src/config.mjs';
import { createProfile } from '../src/progression.mjs';
import {
  createGame,
  startGame,
  step,
  chooseUpgrade,
  configureLoadout,
  castSkill,
  getAvailableEnemies,
  getRunLevel,
} from '../src/simulation.mjs';
import { eligibleUpgrades, acquireBoon } from '../src/loadout.mjs';

const profileAt = (level) => createProfile({ xp: (35 * (level - 1) ** 2 + 195 * (level - 1)) / 2 });

function stageSpecies(level) {
  const kinds = new Set(level.spawn.composition.flatMap((tier) => Object.keys(tier.weights)));
  if (level.encounter) kinds.add(level.encounter.kind);
  for (const kind of kinds) {
    for (const ability of ENEMIES[kind].abilities ?? []) {
      if (ability.type === 'brood') kinds.add(ability.kind);
      if (ability.type === 'bossPhases') kinds.add(ability.summonKind);
    }
  }
  return kinds;
}

test('campaign introduces at most one species per stage including leaders, bosses, and their summons', () => {
  const observed = new Set();
  for (const id of LEVEL_ORDER) {
    const level = LEVELS[id];
    const species = stageSpecies(level);
    const introduced = [...species].filter((kind) => !observed.has(kind));
    assert.equal(introduced.length, 1, `${id}: ${introduced.join(', ')}`);
    assert.equal(introduced[0], level.introducedEnemy);
    for (const kind of species) {
      assert.ok(ENEMIES[kind].unlockStage <= level.order);
      assert.ok(ENEMIES[kind].unlockLevel <= level.unlockLevel);
      observed.add(kind);
    }
  }
  assert.deepEqual(
    [...observed].sort(),
    Object.keys(ENEMIES).sort(),
    'every existing species remains reachable',
  );
  assert.deepEqual([...stageSpecies(LEVELS.ruins)], ['sprout']);
  assert.deepEqual(getAvailableEnemies('skyreach', 1), ['sprout']);
  assert.deepEqual(getAvailableEnemies('ruins', 20, true), ['sprout']);
});

test('introductory stage is short and naturally survivable without skills or permanent purchases', () => {
  for (const seed of [7, 42, 81]) {
    const state = startGame(createGame('ruins', seed));
    assert.equal(state.duration, 60);
    assert.deepEqual(state.skillSlots, []);
    assert.deepEqual(state.availableBoons, ['shrub']);
    for (let frame = 0; frame < 4800 && ['playing', 'upgrade'].includes(state.phase); frame += 1) {
      if (state.phase === 'upgrade') {
        const choice = ['attack-power', 'attack-speed', 'wild-heart', 'boon-shrub'].find((id) =>
          state.upgradeChoices.includes(id),
        );
        assert.ok(choice);
        assert.equal(chooseUpgrade(state, choice), true);
      }
      step(state, 1 / 60, { autoFire: true });
      assert.ok(state.enemies.every((enemy) => enemy.kind === 'sprout'));
    }
    assert.equal(state.phase, 'won');
    assert.ok(state.player.hp >= 60);
    assert.ok(state.kills >= 10);
    assert.ok(state.time >= state.duration, 'the existing final-enemy clear phase remains intact');
    assert.equal(state.enemies.filter((enemy) => enemy.hp > 0).length, 0);
  }
});

test('normal entry rolls only unlocked weather, maps, and skills and rejects preparation overrides', () => {
  const override = {
    weather: { kind: 'hail', wind: 1, thunder: true },
    map: 'skyreach',
    skills: ['horse', 'laser'],
  };
  const first = createGame('ruins', 123, null, override);
  assert.deepEqual(first.runConfig, {
    weather: { kind: 'sunny', wind: 0, thunder: false },
    map: 'ruins',
    skills: [],
  });
  assert.equal(configureLoadout(first, { skills: override.skills }), false);
  const variety = new Set();
  for (let seed = 1000; seed < 20000; seed += 791) {
    const state = createGame('skyreach', seed, profileAt(4));
    const repeated = createGame('skyreach', seed, profileAt(4), override);
    assert.deepEqual(
      state.runConfig,
      repeated.runConfig,
      'non-dev inputs cannot affect the automatic roll',
    );
    assert.ok(WEATHER[state.weather.kind].unlockLevel <= 4);
    assert.equal(state.weather.thunder, false);
    assert.ok(LEVELS[state.mapId].unlockLevel <= 4);
    assert.equal(state.skillSlots.length, 2);
    assert.equal(new Set(state.runConfig.skills).size, 2);
    assert.ok(state.runConfig.skills.every((kind) => SKILLS[kind].unlockPlayerLevel <= 4));
    variety.add(JSON.stringify(state.runConfig));
  }
  assert.ok(variety.size > 5);
});

test('developer settings are validated, remain stable on retry, and keep the campaign enemy gate', () => {
  const options = {
    dev: true,
    weather: { kind: 'hail', wind: 0.5, thunder: true },
    map: 'skyreach',
    skills: ['horse', 'laser'],
  };
  const state = createGame('ruins', 55, null, options);
  assert.deepEqual(state.runConfig, {
    weather: options.weather,
    map: options.map,
    skills: options.skills,
  });
  assert.deepEqual(state.availableEnemies, ['sprout']);
  const configuration = structuredClone(state.runConfig);
  const renderedLevel = getRunLevel(state);
  assert.equal(getRunLevel(state), renderedLevel, 'render cache must retain definition identity');
  assert.equal(renderedLevel.id, 'ruins');
  assert.equal(renderedLevel.visual, LEVELS.skyreach.visual);
  assert.equal(renderedLevel.duration, 60);
  startGame(state);
  step(state, 0.1);
  startGame(state);
  assert.deepEqual(state.runConfig, configuration);
  assert.equal(state.dev, true);
  assert.equal(state.runOptions.dev, true);
  assert.equal(state.time, 0);
  assert.deepEqual(state.terrain, []);
  assert.deepEqual(state.boons, []);
  assert.ok(state.skillSlots.every((slot) => slot.energy === 0));
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  const invalid = createGame('ruins', 55, null, {
    dev: true,
    weather: 'constructor',
    map: '__proto__',
    skills: ['blast', 'constructor'],
  });
  assert.ok(Object.hasOwn(WEATHER, invalid.weather.kind));
  assert.ok(Object.hasOwn(LEVELS, invalid.mapId));
  assert.ok(invalid.runConfig.skills.every((kind) => Object.hasOwn(SKILLS, kind)));
  const invalidRoll = structuredClone(invalid.runConfig);
  startGame(invalid);
  assert.deepEqual(invalid.runConfig, invalidRoll);
  assert.deepEqual(JSON.parse(JSON.stringify(invalid)), invalid);
});

test('battle XP and forged choices cannot bypass permanent growth or energy-skill unlocks', () => {
  const state = startGame(createGame());
  state.progression.level = 100;
  assert.deepEqual(
    eligibleUpgrades(state).map((entry) => entry.id),
    ['attack-power', 'attack-speed', 'wild-heart', 'boon-shrub'],
  );
  assert.equal(acquireBoon(state, 'ice'), false);
  state.phase = 'upgrade';
  state.upgradeChoices = ['boon-ice'];
  state.progression.pending = 1;
  assert.equal(chooseUpgrade(state, 'boon-ice'), false);
  state.phase = 'playing';
  state.skillSlots = [{ kind: 'laser', energy: 300 }];
  assert.equal(castSkill(state, { x: 900, y: 450 }, 0), false);
  for (let level = 1; level <= 6; level += 1) {
    const eligible = createGame('ruins', 42, profileAt(level));
    assert.ok(eligible.availableBoons.every((id) => BOONS[id].unlockPlayerLevel <= level));
    assert.ok(
      eligible.availableUpgrades.every(
        (id) => UPGRADES.find((entry) => entry.id === id).unlockPlayerLevel <= level,
      ),
    );
  }
});
