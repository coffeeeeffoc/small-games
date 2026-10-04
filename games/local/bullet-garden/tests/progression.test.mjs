import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/config.mjs';
import {
  UPGRADE_DEFINITIONS,
  PERMANENT_UPGRADES,
  createProfile,
  levelFromXp,
  profileStats,
  upgradeCost,
  purchaseUpgrade,
  settleLevel,
  isLevelUnlocked,
  registerGrowthDefinitions,
} from '../src/progression.mjs';

function terminal(overrides = {}) {
  return {
    levelId: 'ruins',
    phase: 'won',
    runId: 'test-run',
    coins: 20,
    time: 300,
    duration: 300,
    ...overrides,
  };
}

test('save import strips unknown data, clamps ranks, and stays JSON serializable', () => {
  const source = {
    version: 0,
    xp: Infinity,
    coins: -9,
    completed: ['ruins', 'ruins', 'removed-map'],
    settledRuns: ['a', 'a', '', 123],
    selectedLevelId: 'removed-map',
    upgrades: { attack: 999, health: -5, armor: 1.8, missing: 7 },
  };
  const profile = createProfile(JSON.stringify(source));
  assert.equal(profile.version, 1);
  assert.equal(profile.xp, 0);
  assert.equal(profile.coins, 0);
  assert.deepEqual(profile.completed, ['ruins']);
  assert.deepEqual(profile.settledRuns, ['a']);
  assert.equal(profile.upgrades.attack, UPGRADE_DEFINITIONS.attack.maxRank);
  assert.equal(profile.upgrades.health, 0);
  assert.equal(profile.upgrades.armor, 1);
  assert.equal('missing' in profile.upgrades, false);
  assert.equal(profile.selectedLevelId, 'ruins');
  assert.deepEqual(JSON.parse(JSON.stringify(profile)), profile);
  assert.deepEqual(createProfile('{broken'), createProfile());
  assert.deepEqual(createProfile([]), createProfile());
});

test('experience thresholds are exact and large imports do not need a level loop', () => {
  assert.deepEqual(levelFromXp(0), { level: 1, earned: 0, required: 115 });
  assert.deepEqual(levelFromXp(114), { level: 1, earned: 114, required: 115 });
  assert.deepEqual(levelFromXp(115), { level: 2, earned: 0, required: 150 });
  assert.equal(levelFromXp(670).level, 5);
  const high = levelFromXp(Number.MAX_SAFE_INTEGER);
  assert.ok(Number.isSafeInteger(high.level) && high.level > 1000000);
  assert.ok(high.earned >= 0 && high.earned < high.required);
  assert.equal(levelFromXp(-1).level, 1);
  assert.equal(levelFromXp(NaN).level, 1);
});

test('every growth definition has finite bounds, effects, and its prior concept art', () => {
  assert.equal(PERMANENT_UPGRADES.length, 9);
  for (const definition of PERMANENT_UPGRADES) {
    assert.equal(UPGRADE_DEFINITIONS[definition.id], definition);
    assert.ok(definition.maxRank > 0 && definition.costGrowth >= 1);
    assert.ok(definition.effects.length > 0);
    assert.ok(definition.art.endsWith('growth-weapons-plants.png'));
  }
});

test('purchase is atomic at insufficient funds, locks, unknown IDs, and maximum rank', () => {
  const profile = createProfile({ coins: 34 });
  for (const [id, reason] of [
    ['attack', 'insufficient-coins'],
    ['pet', 'locked'],
    ['missing', 'unknown-upgrade'],
    ['constructor', 'unknown-upgrade'],
    ['__proto__', 'unknown-upgrade'],
  ]) {
    const before = structuredClone(profile);
    assert.deepEqual(purchaseUpgrade(profile, id), { ok: false, reason });
    assert.deepEqual(profile, before);
  }
  assert.equal(upgradeCost(profile, 'constructor'), null);
  profile.coins = 35;
  assert.deepEqual(purchaseUpgrade(profile, 'attack'), { ok: true, cost: 35, rank: 1 });
  assert.equal(profile.coins, 0);
  assert.equal(upgradeCost(profile, 'attack'), 48);
  profile.upgrades.attack = UPGRADE_DEFINITIONS.attack.maxRank;
  profile.coins = 999;
  const before = structuredClone(profile);
  assert.deepEqual(purchaseUpgrade(profile, 'attack'), { ok: false, reason: 'maxed' });
  assert.deepEqual(profile, before);
  assert.equal(upgradeCost(profile, 'attack'), null);
});

test('passive effects combine while pet and penetration respect level unlocks', () => {
  const fresh = profileStats(createProfile());
  assert.equal(fresh.damage, 19);
  assert.equal(fresh.fireInterval, 0.245);
  assert.equal(fresh.maxHp, 100);
  assert.equal(fresh.petUnlocked, false);
  const upgrades = {
    attack: 2,
    weaponDamage: 1,
    fireRate: 1,
    weaponRate: 1,
    health: 2,
    armor: 2,
    seedMastery: 3,
    pet: 2,
    weaponPierce: 2,
  };
  const grown = profileStats(createProfile({ xp: 670, upgrades }));
  assert.ok(Math.abs(grown.damage - 19 * 1.26) < 1e-10);
  assert.ok(Math.abs(grown.fireInterval - 0.245 / 1.14) < 1e-10);
  assert.equal(grown.maxHp, 130);
  assert.equal(grown.armor, 6);
  assert.equal(grown.seedPower, 1.24);
  assert.equal(grown.pierce, 2);
  assert.equal(grown.petUnlocked, true);
  assert.equal(grown.petDamage, 18);
  assert.equal(grown.petRank, 2);
  const locked = profileStats(createProfile({ xp: 0, upgrades }));
  assert.equal(locked.pierce, 0);
  assert.equal(locked.petRank, 0);
  assert.equal(locked.armor, 0);
  assert.deepEqual(purchaseUpgrade(createProfile({ xp: 450, coins: 120 }), 'weaponPierce'), {
    ok: true,
    cost: 120,
    rank: 1,
  });
  assert.deepEqual(purchaseUpgrade(createProfile({ xp: 669, coins: 90 }), 'pet'), {
    ok: false,
    reason: 'locked',
  });
});

test('first clear rewards and unlocks exactly once, even after save reload', () => {
  const profile = createProfile();
  const run = terminal();
  const result = settleLevel(profile, run);
  const level = LEVELS.ruins;
  assert.equal(result.ok, true);
  assert.deepEqual(result.reward, {
    coins: (level.rewards?.coins ?? 57) + 20,
    xp: level.rewards?.xp ?? 115,
    firstClear: true,
  });
  assert.deepEqual(profile.completed, ['ruins']);
  const before = structuredClone(profile);
  assert.deepEqual(settleLevel(profile, run), { ok: false, reason: 'already-settled' });
  assert.deepEqual(profile, before);
  const reloaded = createProfile(JSON.stringify(profile));
  assert.deepEqual(settleLevel(reloaded, run), { ok: false, reason: 'already-settled' });
  const next = Object.values(LEVELS).sort((a, b) => (a.order ?? 1) - (b.order ?? 1))[1];
  if (next) {
    assert.equal(isLevelUnlocked(profile, next.id), true);
    assert.equal(result.unlockedLevelId, next.id);
    assert.equal(profile.selectedLevelId, next.id);
  }
});

test('replay and failure pay only their designed fraction and never advance on failure', () => {
  const profile = createProfile({ completed: ['ruins'] });
  const coins = LEVELS.ruins.rewards?.coins ?? 57;
  const xp = LEVELS.ruins.rewards?.xp ?? 115;
  const repeated = settleLevel(profile, terminal());
  assert.deepEqual(repeated.reward, {
    coins: Math.floor((coins + 20) * 0.35),
    xp: Math.floor(xp * 0.35),
    firstClear: false,
  });
  const fresh = createProfile();
  const failed = settleLevel(fresh, terminal({ phase: 'lost', time: 150, coins: 23 }));
  assert.deepEqual(failed.reward, { coins: 5, xp: Math.floor(xp * 0.5 * 0.25), firstClear: false });
  assert.deepEqual(fresh.completed, []);
  assert.equal(failed.unlockedLevelId, null);
});

test('unfinished, malformed, unknown, or locked runs cannot mutate progress', () => {
  const profile = createProfile();
  for (const [run, reason] of [
    [terminal({ phase: 'playing' }), 'unfinished-run'],
    [terminal({ runId: '' }), 'missing-run-id'],
    [terminal({ levelId: 'removed' }), 'unknown-level'],
    [terminal({ levelId: 'constructor' }), 'unknown-level'],
  ]) {
    const before = structuredClone(profile);
    assert.deepEqual(settleLevel(profile, run), { ok: false, reason });
    assert.deepEqual(profile, before);
  }
  const next = Object.values(LEVELS).sort((a, b) => (a.order ?? 1) - (b.order ?? 1))[1];
  if (next) {
    const before = structuredClone(profile);
    assert.equal(isLevelUnlocked(profile, next.id), false);
    assert.deepEqual(settleLevel(profile, terminal({ levelId: next.id })), {
      ok: false,
      reason: 'locked-level',
    });
    assert.deepEqual(profile, before);
  }
});

test('developer wins and losses cannot change the saved economy or consume settlement IDs', () => {
  for (const phase of ['won', 'lost']) {
    for (const flags of [{ developerRun: true }, { dev: true }, { runOptions: { dev: true } }]) {
      const profile = createProfile({
        xp: 115,
        coins: 80,
        completed: ['ruins'],
        settledRuns: ['previous-normal-run'],
        upgrades: { attack: 1, health: 1 },
      });
      const before = structuredClone(profile);
      const run = terminal({ phase, ...flags });
      assert.deepEqual(settleLevel(profile, run), { ok: false, reason: 'developer-run' });
      assert.deepEqual(
        profile,
        before,
        'XP, coins, upgrades, clears and history must be unchanged',
      );
      assert.equal(profile.settledRuns.includes(run.runId), false);
    }
  }
});

test('ordinary runs retain first-clear rewards and permanent purchases after developer preview', () => {
  const profile = createProfile({ coins: 35 });
  assert.equal(purchaseUpgrade(profile, 'attack').ok, true);
  const run = terminal({ developerRun: true });
  assert.equal(settleLevel(profile, run).reason, 'developer-run');
  const result = settleLevel(profile, {
    ...run,
    developerRun: false,
    dev: false,
    runOptions: { dev: false },
  });
  assert.equal(result.ok, true);
  assert.equal(result.reward.firstClear, true);
  assert.equal(profile.xp, LEVELS.ruins.rewards?.xp ?? 115);
  assert.equal(profile.coins, (LEVELS.ruins.rewards?.coins ?? 57) + 20);
  assert.equal(profile.upgrades.attack, 1);
  assert.ok(profileStats(profile).damage > 19);
  assert.deepEqual(profile.completed, ['ruins']);
  assert.deepEqual(profile.settledRuns, [run.runId]);
});

test('campaign first-clear XP unlocks each following stage without required replay farming', () => {
  const levels = Object.values(LEVELS).sort((a, b) => a.order - b.order);
  const profile = createProfile();
  for (const [index, level] of levels.entries()) {
    assert.equal(isLevelUnlocked(profile, level.id), true, `${level.id} must be reachable`);
    assert.ok(levelFromXp(profile.xp).level >= level.unlockLevel);
    const result = settleLevel(
      profile,
      terminal({
        levelId: level.id,
        runId: `campaign-first-${level.id}`,
        time: level.duration,
        duration: level.duration,
        coins: 0,
      }),
    );
    assert.equal(result.ok, true);
    assert.equal(result.reward.firstClear, true);
    assert.equal(result.unlockedLevelId, levels[index + 1]?.id ?? null);
    if (index === 0) assert.equal(levelFromXp(profile.xp).level, 2);
  }
  assert.deepEqual(
    profile.completed,
    levels.map((level) => level.id),
  );
});

test('campaign gates require both a previous clear and the configured permanent level', () => {
  const levels = Object.values(LEVELS).sort((a, b) => a.order - b.order);
  const experienced = createProfile({ xp: 100000 });
  for (const [index, level] of levels.entries()) {
    if (index === 0) continue;
    assert.equal(isLevelUnlocked(experienced, level.id), false, 'XP alone cannot skip a stage');
    if (level.unlockLevel > 1) {
      const noXp = createProfile({ completed: levels.slice(0, index).map((entry) => entry.id) });
      assert.equal(
        isLevelUnlocked(noXp, level.id),
        false,
        'a clear alone cannot bypass level gates',
      );
    }
  }
});

test('new runs remain settleable while recent transaction history is bounded', () => {
  const profile = createProfile();
  for (let run = 0; run < 140; run += 1)
    assert.equal(
      settleLevel(profile, terminal({ runId: `run-${run}`, phase: 'lost', coins: 4, time: 0 })).ok,
      true,
    );
  assert.equal(profile.settledRuns.length, 128);
  assert.equal(profile.coins, 140);
  assert.equal(profile.settledRuns[0], 'run-12');
  assert.equal(settleLevel(profile, terminal({ runId: 'run-139' })).reason, 'already-settled');
});

test('growth registration rejects a whole invalid pack without changing stable containers', () => {
  const array = PERMANENT_UPGRADES;
  const registry = UPGRADE_DEFINITIONS;
  const before = [...PERMANENT_UPGRADES];
  const definition = {
    id: 'vitalRoots',
    name: '生命根系',
    description: '生命上限 +5。',
    unlockLevel: 1,
    maxRank: 3,
    baseCost: 20,
    costGrowth: 1.2,
    art: 'docs/design/concepts/growth-weapons-plants.png',
    effects: [{ stat: 'maxHp', op: 'add', value: 5 }],
  };
  for (const bad of [
    { ...definition, id: 'attack' },
    { ...definition, id: '__proto__' },
    { ...definition, id: 'unknownStat', effects: [{ stat: 'energy', op: 'add', value: 5 }] },
    { ...definition, id: 'unknownOp', effects: [{ stat: 'maxHp', op: 'script', value: 5 }] },
    { ...definition, id: 'unsafePrice', costGrowth: Infinity },
    { ...definition, id: 'missingArt', art: '' },
    { ...definition, id: 'badRank', maxRank: 0 },
  ]) {
    assert.equal(registerGrowthDefinitions([definition, bad]).ok, false);
    assert.deepEqual(PERMANENT_UPGRADES, before);
    assert.equal(Object.hasOwn(UPGRADE_DEFINITIONS, 'vitalRoots'), false);
  }
  assert.equal(PERMANENT_UPGRADES, array);
  assert.equal(UPGRADE_DEFINITIONS, registry);
});

test('registered passive growth uses existing profile migration, shop cost and combat stats', () => {
  const definition = {
    id: 'vitalRoots',
    name: '生命根系',
    description: '生命上限 +5。',
    unlockLevel: 1,
    maxRank: 3,
    baseCost: 20,
    costGrowth: 1.2,
    art: 'docs/design/concepts/growth-weapons-plants.png',
    effects: [{ stat: 'maxHp', op: 'add', value: 5 }],
  };
  assert.deepEqual(registerGrowthDefinitions([definition]), { ok: true, added: ['vitalRoots'] });
  const profile = createProfile({ coins: 30 });
  assert.equal(profile.upgrades.vitalRoots, 0);
  assert.deepEqual(purchaseUpgrade(profile, 'vitalRoots'), { ok: true, cost: 20, rank: 1 });
  assert.equal(profileStats(profile).maxHp, 105);
  assert.equal(upgradeCost(profile, 'vitalRoots'), 24);
  assert.equal(profile.coins, 10);
  assert.equal(createProfile(JSON.stringify(profile)).upgrades.vitalRoots, 1);
  assert.deepEqual(UPGRADE_DEFINITIONS.vitalRoots.displayStats, ['maxHp']);
  assert.ok(Object.isFrozen(UPGRADE_DEFINITIONS.vitalRoots.effects[0]));
  definition.effects[0].value = 500;
  assert.equal(profileStats(profile).maxHp, 105, 'registration clones definitions before freezing');
});
