import { LEVELS } from './config.mjs';

const PROFILE_VERSION = 1;
const MAX_SETTLED_RUNS = 128;
const ART = 'docs/design/concepts/growth-weapons-plants.png';
const amount = (value, fallback = 0) =>
  Number.isFinite(value)
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(value)))
    : fallback;

const definitions = [
  {
    id: 'attack',
    name: '攻击力',
    description: '普通枪械伤害 +8%。',
    unlockLevel: 1,
    maxRank: 20,
    baseCost: 35,
    costGrowth: 1.35,
    icon: 'shot',
    effects: [{ stat: 'damage', op: 'addPercent', value: 0.08 }],
  },
  {
    id: 'fireRate',
    name: '攻速',
    description: '射击频率 +6%。',
    unlockLevel: 1,
    maxRank: 15,
    baseCost: 35,
    costGrowth: 1.35,
    icon: 'shot',
    effects: [{ stat: 'fireRate', op: 'addPercent', value: 0.06 }],
  },
  {
    id: 'health',
    name: '生命力',
    description: '生命上限 +15，出发时恢复满血。',
    unlockLevel: 1,
    maxRank: 20,
    baseCost: 30,
    costGrowth: 1.32,
    icon: 'heart',
    effects: [{ stat: 'maxHp', op: 'add', value: 15 }],
  },
  {
    id: 'armor',
    name: '护甲',
    description: '护甲 +3，减少受到的伤害。',
    unlockLevel: 2,
    maxRank: 15,
    baseCost: 45,
    costGrowth: 1.4,
    icon: 'ice',
    effects: [{ stat: 'armor', op: 'add', value: 3 }],
  },
  {
    id: 'seedMastery',
    name: '种植精通',
    description: '植物伤害、治疗和耐久 +8%。',
    unlockLevel: 1,
    maxRank: 20,
    baseCost: 40,
    costGrowth: 1.35,
    icon: 'leaf',
    effects: [{ stat: 'seedPower', op: 'addPercent', value: 0.08 }],
  },
  {
    id: 'pet',
    name: '芽灵助手',
    description: '助手伤害 +25%，攻击频率 +5%。',
    unlockLevel: 5,
    maxRank: 10,
    baseCost: 90,
    costGrowth: 1.45,
    icon: 'flower',
    effects: [
      { stat: 'petDamage', op: 'addPercent', value: 0.25 },
      { stat: 'petFireRate', op: 'addPercent', value: 0.05 },
    ],
  },
  {
    id: 'weaponDamage',
    name: '枪械伤害',
    description: '花火步枪伤害 +10%。',
    unlockLevel: 2,
    maxRank: 10,
    baseCost: 70,
    costGrowth: 1.5,
    icon: 'shot',
    effects: [{ stat: 'damage', op: 'addPercent', value: 0.1 }],
  },
  {
    id: 'weaponRate',
    name: '枪械连发',
    description: '花火步枪射击频率 +8%。',
    unlockLevel: 3,
    maxRank: 10,
    baseCost: 75,
    costGrowth: 1.5,
    icon: 'shot',
    effects: [{ stat: 'fireRate', op: 'addPercent', value: 0.08 }],
  },
  {
    id: 'weaponPierce',
    name: '枪械穿透',
    description: '普通子弹可额外穿过 1 个敌人。',
    unlockLevel: 4,
    maxRank: 3,
    baseCost: 120,
    costGrowth: 1.7,
    icon: 'shot',
    effects: [{ stat: 'pierce', op: 'add', value: 1 }],
  },
];

const GROWTH_STATS = new Set([
  'damage',
  'fireRate',
  'maxHp',
  'armor',
  'seedPower',
  'pierce',
  'petDamage',
  'petFireRate',
]);
const GROWTH_OPERATIONS = new Set(['add', 'addPercent']);
const freezeGrowth = (definition) =>
  Object.freeze({
    ...definition,
    description: definition.description ?? '',
    icon: definition.icon ?? 'leaf',
    displayStats: Object.freeze([...new Set(definition.effects.map((effect) => effect.stat))]),
    effects: Object.freeze(definition.effects.map((effect) => Object.freeze({ ...effect }))),
  });

/** Stable containers allow append-only content without invalidating UI imports. */
export const PERMANENT_UPGRADES = definitions.map((definition) =>
  freezeGrowth({ ...definition, art: ART }),
);
export const UPGRADE_DEFINITIONS = Object.fromEntries(
  PERMANENT_UPGRADES.map((definition) => [definition.id, definition]),
);

/** Validate the whole addition before touching either shared registry container. */
export function registerGrowthDefinitions(additions) {
  const errors = [];
  if (!Array.isArray(additions) || additions.length === 0)
    return { ok: false, errors: ['Growth additions must be a nonempty array.'] };
  const seen = new Set(Object.keys(UPGRADE_DEFINITIONS));
  for (const [index, definition] of additions.entries()) {
    const prefix = `growth[${index}]`;
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
      errors.push(`${prefix}: expected a growth definition.`);
      continue;
    }
    if (
      typeof definition.id !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(definition.id) ||
      seen.has(definition.id)
    )
      errors.push(`${prefix}: invalid or duplicate id.`);
    else seen.add(definition.id);
    if (typeof definition.name !== 'string' || !definition.name.trim())
      errors.push(`${prefix}: name is required.`);
    if (definition.description !== undefined && typeof definition.description !== 'string')
      errors.push(`${prefix}: description must be text.`);
    for (const key of ['unlockLevel', 'maxRank', 'baseCost'])
      if (!Number.isSafeInteger(definition[key]) || definition[key] < 1)
        errors.push(`${prefix}: ${key} must be a positive integer.`);
    if (
      !Number.isFinite(definition.costGrowth) ||
      definition.costGrowth < 1 ||
      !Number.isFinite(definition.baseCost * definition.costGrowth ** (definition.maxRank - 1)) ||
      definition.baseCost * definition.costGrowth ** (definition.maxRank - 1) >
        Number.MAX_SAFE_INTEGER
    )
      errors.push(`${prefix}: cost growth must produce finite safe prices.`);
    if (
      typeof definition.art !== 'string' ||
      !definition.art.trim() ||
      definition.art.includes('..') ||
      !/\.(png|webp|jpe?g|svg)$/i.test(definition.art)
    )
      errors.push(`${prefix}: concept art is required.`);
    if (!Array.isArray(definition.effects) || !definition.effects.length) {
      errors.push(`${prefix}: at least one supported effect is required.`);
      continue;
    }
    for (const effect of definition.effects) {
      if (
        !effect ||
        !GROWTH_STATS.has(effect.stat) ||
        !GROWTH_OPERATIONS.has(effect.op) ||
        !Number.isFinite(effect.value) ||
        effect.value < 0 ||
        !Number.isFinite(effect.value * definition.maxRank)
      ) {
        errors.push(`${prefix}: unsupported stat, operation or value.`);
        continue;
      }
      if (effect.stat === 'pierce' && (effect.op !== 'add' || !Number.isSafeInteger(effect.value)))
        errors.push(`${prefix}: pierce requires an integer additive effect.`);
    }
  }
  if (errors.length) return { ok: false, errors };
  const prepared = additions.map(freezeGrowth);
  for (const definition of prepared) {
    PERMANENT_UPGRADES.push(definition);
    UPGRADE_DEFINITIONS[definition.id] = definition;
  }
  return { ok: true, added: prepared.map((definition) => definition.id) };
}

function campaign() {
  return Object.values(LEVELS).sort((a, b) => (a.order ?? 1) - (b.order ?? 1));
}

function totalXpForLevel(level) {
  const previousLevels = level - 1;
  return (35 * previousLevels * previousLevels + 195 * previousLevels) / 2;
}

/** Closed form avoids a long loop when importing a large or damaged save. */
export function levelFromXp(xp) {
  const total = amount(xp);
  const completedLevels = Math.floor((-195 + Math.sqrt(195 * 195 + 280 * total)) / 70);
  let level = completedLevels + 1;
  // Correct rounding at the exact integer boundaries of the quadratic formula.
  if (total < totalXpForLevel(level)) level -= 1;
  if (total >= totalXpForLevel(level + 1)) level += 1;
  return {
    level,
    earned: total - totalXpForLevel(level),
    required: 80 + level * 35,
  };
}

/** Import only known, finite, versioned fields; storage remains an app concern. */
export function createProfile(raw = null) {
  let source = raw;
  if (typeof raw === 'string') {
    try {
      source = JSON.parse(raw);
    } catch {
      source = null;
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) source = {};
  const levels = campaign();
  const knownLevels = new Set(levels.map((level) => level.id));
  const completed = new Set(Array.isArray(source.completed) ? source.completed : []);
  const settledRuns = Array.isArray(source.settledRuns)
    ? [
        ...new Set(
          source.settledRuns.filter(
            (runId) => typeof runId === 'string' && runId.length > 0 && runId.length <= 128,
          ),
        ),
      ].slice(-MAX_SETTLED_RUNS)
    : [];
  return {
    version: PROFILE_VERSION,
    xp: amount(source.xp),
    coins: amount(source.coins),
    completed: levels.filter((level) => completed.has(level.id)).map((level) => level.id),
    settledRuns,
    upgrades: Object.fromEntries(
      PERMANENT_UPGRADES.map((definition) => [
        definition.id,
        Math.min(definition.maxRank, amount(source.upgrades?.[definition.id])),
      ]),
    ),
    equippedWeapon: 'bloom-rifle',
    equippedPet: 'sprout-helper',
    selectedLevelId: knownLevels.has(source.selectedLevelId)
      ? source.selectedLevelId
      : (levels[0]?.id ?? 'ruins'),
  };
}

/** Both level and prior clear are data-driven, including content appended later. */
export function isLevelUnlocked(profile, levelId) {
  const levels = campaign();
  const index = levels.findIndex((level) => level.id === levelId);
  if (index < 0) return false;
  if (index === 0) return true;
  const clean = createProfile(profile);
  return (
    clean.completed.includes(levels[index - 1].id) &&
    levelFromXp(clean.xp).level >= (levels[index].unlockLevel ?? 1)
  );
}

/** All configured passive effects use the same fixed-add then percent-add order. */
export function profileStats(profile) {
  const clean = createProfile(profile);
  const level = levelFromXp(clean.xp).level;
  const values = {
    damage: 19,
    fireRate: 1 / 0.245,
    maxHp: 100,
    armor: 0,
    seedPower: 1,
    pierce: 0,
    petDamage: 12,
    petFireRate: 1 / 1.15,
  };
  const additions = {},
    percentages = {};
  for (const definition of PERMANENT_UPGRADES) {
    // A corrupted low-level save cannot activate a still-locked passive effect.
    if (level < definition.unlockLevel) continue;
    const rank = clean.upgrades[definition.id];
    for (const effect of definition.effects) {
      const accumulator = effect.op === 'addPercent' ? percentages : additions;
      accumulator[effect.stat] = (accumulator[effect.stat] ?? 0) + effect.value * rank;
    }
  }
  for (const key of Object.keys(values)) {
    values[key] = (values[key] + (additions[key] ?? 0)) * (1 + (percentages[key] ?? 0));
  }
  return {
    ...values,
    level,
    damage: values.damage,
    fireInterval: 1 / values.fireRate,
    maxHp: values.maxHp,
    armor: values.armor,
    seedPower: values.seedPower,
    pierce: values.pierce,
    pellets: 1,
    weaponTier:
      clean.upgrades.weaponDamage + clean.upgrades.weaponRate + clean.upgrades.weaponPierce,
    petUnlocked: level >= UPGRADE_DEFINITIONS.pet.unlockLevel,
    petRank: level >= UPGRADE_DEFINITIONS.pet.unlockLevel ? clean.upgrades.pet : 0,
    petDamage: values.petDamage,
    petInterval: 1 / values.petFireRate,
  };
}

export function upgradeCost(profile, upgradeId) {
  if (!Object.hasOwn(UPGRADE_DEFINITIONS, upgradeId)) return null;
  const definition = UPGRADE_DEFINITIONS[upgradeId];
  const rank = createProfile(profile).upgrades[upgradeId];
  if (rank >= definition.maxRank) return null;
  return Math.ceil(definition.baseCost * definition.costGrowth ** rank);
}

/** Atomic purchase: every rejected action leaves the supplied profile untouched. */
export function purchaseUpgrade(profile, upgradeId) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile))
    return { ok: false, reason: 'invalid-profile' };
  if (!Object.hasOwn(UPGRADE_DEFINITIONS, upgradeId))
    return { ok: false, reason: 'unknown-upgrade' };
  const definition = UPGRADE_DEFINITIONS[upgradeId];
  const clean = createProfile(profile);
  if (levelFromXp(clean.xp).level < definition.unlockLevel) return { ok: false, reason: 'locked' };
  const cost = upgradeCost(clean, upgradeId);
  if (cost === null) return { ok: false, reason: 'maxed' };
  if (clean.coins < cost) return { ok: false, reason: 'insufficient-coins' };
  clean.coins -= cost;
  clean.upgrades[upgradeId] += 1;
  Object.assign(profile, clean);
  return { ok: true, cost, rank: clean.upgrades[upgradeId] };
}

/** Settle terminal runs once; the browser injects a unique runId before starting. */
export function settleLevel(profile, state) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile))
    return { ok: false, reason: 'invalid-profile' };
  if (!state || !['won', 'lost'].includes(state.phase))
    return { ok: false, reason: 'unfinished-run' };
  // Enforce the preview boundary here as well as in the UI: developer runs must
  // not award currency, XP, stage clears or consume a settlement transaction ID.
  if (state.developerRun || state.dev || state.runOptions?.dev)
    return { ok: false, reason: 'developer-run' };
  if (typeof state.runId !== 'string' || state.runId.length === 0 || state.runId.length > 128)
    return { ok: false, reason: 'missing-run-id' };
  if (!Object.hasOwn(LEVELS, state.levelId)) return { ok: false, reason: 'unknown-level' };
  const level = LEVELS[state.levelId];
  const clean = createProfile(profile);
  if (clean.settledRuns.includes(state.runId)) return { ok: false, reason: 'already-settled' };
  if (!isLevelUnlocked(clean, state.levelId)) return { ok: false, reason: 'locked-level' };
  const firstClear = state.phase === 'won' && !clean.completed.includes(level.id);
  const order = level.order ?? campaign().findIndex((entry) => entry.id === level.id) + 1;
  const mapCoins = amount(level.rewards?.coins, 45 + order * 12);
  const mapXp = amount(level.rewards?.xp, 80 + order * 35);
  const killCoins = amount(state.coins);
  const survival = Number.isFinite(state.time)
    ? Math.min(1, Math.max(0, state.time / (state.duration > 0 ? state.duration : level.duration)))
    : 0;
  const won = state.phase === 'won';
  const reward = {
    coins: won
      ? Math.floor((mapCoins + killCoins) * (firstClear ? 1 : 0.35))
      : Math.floor(killCoins * 0.25),
    xp: won ? Math.floor(mapXp * (firstClear ? 1 : 0.35)) : Math.floor(mapXp * survival * 0.25),
    firstClear,
  };
  const previousLevel = levelFromXp(clean.xp).level;
  clean.coins = amount(clean.coins + reward.coins);
  clean.xp = amount(clean.xp + reward.xp);
  if (firstClear) clean.completed.push(level.id);
  clean.settledRuns.push(state.runId);
  clean.settledRuns = clean.settledRuns.slice(-MAX_SETTLED_RUNS);
  const levels = campaign();
  const next = levels[levels.findIndex((entry) => entry.id === level.id) + 1];
  const unlockedLevelId = firstClear && next && isLevelUnlocked(clean, next.id) ? next.id : null;
  if (unlockedLevelId) clean.selectedLevelId = unlockedLevelId;
  Object.assign(profile, clean);
  return {
    ok: true,
    reward,
    previousLevel,
    playerLevel: levelFromXp(clean.xp).level,
    unlockedLevelId,
  };
}
