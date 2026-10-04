import test from 'node:test';
import assert from 'node:assert/strict';
import { BOONS, SKILLS, UPGRADES, WEAPONS } from '../src/catalog.mjs';
import { createProfile } from '../src/progression.mjs';
import {
  createRunLoadout,
  configureLoadout,
  selectSkill,
  upgradeBonus,
  eligibleUpgrades,
  gainRunExperience,
  drawUpgradeChoices,
  acquireBoon,
  GAME_SPEEDS,
  normalizeGameSpeed,
} from '../src/loadout.mjs';

const state = (level = 1) => ({
  ...createRunLoadout(),
  dev: true,
  levelId: 'ruins',
  phase: 'ready',
  permanent: { level },
  profile: createProfile(),
  upgrades: [],
});

test('all existing dev terrain, skills and weapon builds remain in the catalogue', () => {
  for (const id of ['shrub', 'trench', 'frost', 'poison']) assert.ok(BOONS[id]);
  assert.deepEqual(Object.keys(SKILLS), ['blast', 'gale', 'cart', 'horse', 'laser']);
  assert.deepEqual(
    WEAPONS.map((entry) => entry.id),
    [
      'attack-power',
      'attack-speed',
      'multishot',
      'burst',
      'ricochet',
      'ice-shot',
      'fire-shot',
      'explosive-shot',
      'split-shot',
      'split-explosion',
    ],
  );
  assert.equal(new Set(UPGRADES.map((entry) => entry.id)).size, UPGRADES.length);
});

test('preparation keeps two distinct skill slots and rejects changes atomically during combat', () => {
  const game = state();
  for (const skills of [['blast', 'blast'], ['constructor', 'gale'], ['laser'], null]) {
    const before = structuredClone(game);
    assert.equal(configureLoadout(game, { skills }), false);
    assert.deepEqual(game, before);
  }
  assert.equal(configureLoadout(game, { skills: ['horse', 'laser'] }), true);
  assert.deepEqual(game.skillSlots, [
    { kind: 'horse', energy: 0 },
    { kind: 'laser', energy: 0 },
  ]);
  game.phase = 'playing';
  const before = structuredClone(game);
  assert.equal(configureLoadout(game, { skills: ['blast', 'gale'] }), false);
  assert.deepEqual(game, before);
  assert.equal(selectSkill(game, 1), true);
  assert.equal(game.selectedSkill, 1);
  assert.equal(selectSkill(game, 2), false);
  assert.equal(selectSkill(game, 0.5), false);
});

test('normal preparation keeps its automatic skills and rejects manual overrides', () => {
  const game = state(6);
  game.dev = false;
  const before = structuredClone(game);
  assert.equal(configureLoadout(game, { skills: ['horse', 'laser'] }), false);
  assert.deepEqual(game, before);
});

test('fresh run loadouts preserve chosen skills while clearing terrain, energy and run XP', () => {
  const fresh = createRunLoadout(['cart', 'laser'], 12);
  assert.deepEqual(fresh.loadout.skills, ['cart', 'laser']);
  assert.deepEqual(fresh.boons, []);
  assert.deepEqual(fresh.boonTimers, {});
  assert.deepEqual(fresh.progression, { level: 1, xp: 0, nextXp: 12, pending: 0, queue: [] });
  assert.deepEqual(fresh.skillEffects, []);
  assert.deepEqual(fresh.burstQueue, []);
  assert.ok(fresh.skillSlots.every((slot) => slot.energy === 0));
  assert.deepEqual(createRunLoadout(['missing', 'blast']).loadout.skills, ['blast', 'gale']);
  const beginner = createRunLoadout([]);
  assert.deepEqual(beginner.loadout.skills, []);
  assert.deepEqual(beginner.skillSlots, []);
  assert.equal(selectSkill(beginner, 0), false);
  assert.deepEqual(createRunLoadout(['blast']).skillSlots, [{ kind: 'blast', energy: 0 }]);
});

test('kill XP carries overflow and queued upgrade levels without touching permanent XP or coins', () => {
  const game = state();
  game.profile.xp = 670;
  game.profile.coins = 99;
  const before = structuredClone(game.profile);
  assert.equal(gainRunExperience(game, 70), 3);
  assert.deepEqual(game.progression, { level: 4, xp: 4, nextXp: 42, pending: 3, queue: [2, 3, 4] });
  assert.deepEqual(game.profile, before);
  assert.equal(gainRunExperience(game, NaN), 0);
  assert.equal(gainRunExperience(game, -1), 0);
});

test('XP upgrade eligibility enforces terrain ownership, prerequisites, rank and permanent plant unlocks', () => {
  const game = state();
  let ids = eligibleUpgrades(game).map((entry) => entry.id);
  assert.ok(ids.includes('boon-shrub'));
  assert.equal(ids.includes('terrain-heart'), false);
  assert.equal(ids.includes('split-explosion'), false);
  assert.equal(ids.includes('boon-sunflower'), false);
  assert.equal(acquireBoon(game, 'sunflower'), false);
  assert.equal(acquireBoon(game, 'shrub'), true);
  assert.equal(acquireBoon(game, 'shrub'), false);
  game.upgrades.push('boon-shrub', 'split-shot', ...Array(5).fill('attack-power'));
  ids = eligibleUpgrades(game).map((entry) => entry.id);
  assert.equal(ids.includes('terrain-heart'), false);
  assert.equal(ids.includes('split-explosion'), false);
  assert.equal(ids.includes('boon-shrub'), false);
  assert.equal(ids.includes('attack-power'), false);
  game.permanent.level = 2;
  ids = eligibleUpgrades(game).map((entry) => entry.id);
  assert.ok(ids.includes('terrain-heart'));
  assert.ok(ids.includes('boon-sunflower'));
  assert.equal(ids.includes('split-explosion'), false);
  game.permanent.level = 6;
  ids = eligibleUpgrades(game).map((entry) => entry.id);
  assert.ok(ids.includes('split-explosion'));
  for (const plant of ['sunflower', 'stormreed', 'bloomturret'])
    assert.ok(ids.includes(`boon-${plant}`));
  assert.equal(ids.includes('turret-heart'), false);
  assert.equal(acquireBoon(game, 'bloomturret'), true);
  game.upgrades.push('boon-bloomturret');
  assert.ok(eligibleUpgrades(game).some((entry) => entry.id === 'turret-heart'));
});

test('first-time players only see basic growth and combat XP cannot unlock later mechanisms', () => {
  const game = state();
  game.progression.level = 12;
  assert.deepEqual(
    eligibleUpgrades(game).map((entry) => entry.id),
    ['attack-power', 'attack-speed', 'wild-heart', 'boon-shrub'],
  );
  for (const boon of ['trench', 'frost', 'poison', 'ice', 'mushroom', 'stormreed'])
    assert.equal(acquireBoon(game, boon), false);

  game.permanent.level = 2;
  let ids = eligibleUpgrades(game).map((entry) => entry.id);
  for (const id of ['multishot', 'boon-sunflower', 'boon-trench', 'energy-cycle'])
    assert.ok(ids.includes(id));
  for (const id of ['burst', 'ice-shot', 'boon-ice', 'boon-mushroom', 'split-shot'])
    assert.equal(ids.includes(id), false);

  game.permanent.level = 5;
  ids = eligibleUpgrades(game).map((entry) => entry.id);
  assert.ok(ids.includes('split-shot'));
  assert.ok(ids.includes('boon-stormreed'));
  assert.equal(ids.includes('boon-bloomturret'), false);
  assert.equal(ids.includes('split-explosion'), false);
});

test('weighted chooser guarantees weapon and terrain categories and grows from 3 to 4 choices at run level 5', () => {
  const game = state();
  game.progression.pending = 1;
  game.progression.queue = [2];
  const first = drawUpgradeChoices(game, () => 0.37);
  assert.equal(first.length, 3);
  assert.equal(new Set(first).size, first.length);
  assert.ok(first.some((id) => UPGRADES.find((entry) => entry.id === id).category === 'weapon'));
  assert.ok(first.some((id) => id.startsWith('boon-')));
  game.progression.level = 5;
  game.progression.queue = [5];
  const later = drawUpgradeChoices(game, () => 0.37);
  assert.equal(later.length, 4);
  game.upgrades = UPGRADES.flatMap((entry) => Array(entry.maxRank).fill(entry.id));
  assert.deepEqual(
    drawUpgradeChoices(game, () => 0.37),
    [],
  );
});

test('weapon and plant effects aggregate by their effect keys and speed keeps current dev values', () => {
  const game = state(6);
  game.upgrades.push('attack-power', 'attack-power', 'attack-speed', 'sunflower-heart');
  assert.equal(upgradeBonus(game, 'damage'), 0.5);
  assert.equal(upgradeBonus(game, 'fireRate'), 0.18);
  assert.equal(upgradeBonus(game, 'sunflowerHeal'), 0.4);
  assert.equal(upgradeBonus(game, 'missing'), 0);
  assert.deepEqual(GAME_SPEEDS, [1, 2, 3, 5]);
  assert.equal(normalizeGameSpeed('3'), 3);
  assert.equal(normalizeGameSpeed(4), 1);
  assert.equal(normalizeGameSpeed(NaN), 1);
});
