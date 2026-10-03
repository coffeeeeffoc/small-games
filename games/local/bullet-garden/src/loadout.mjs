import { BOONS, SKILLS, UPGRADES, LEVELS } from './config.mjs';

export const GAME_SPEEDS = Object.freeze([1, 2, 3, 5]);
export const normalizeGameSpeed = (speed) =>
  GAME_SPEEDS.includes(Number(speed)) ? Number(speed) : 1;

const validPair = (skills) =>
  Array.isArray(skills) &&
  skills.length === 2 &&
  skills[0] !== skills[1] &&
  skills.every((kind) => Object.hasOwn(SKILLS, kind));
const count = (state, key) => state.upgrades.filter((id) => id === key).length;
const rulesOf = (state) => ({
  firstXp: 12,
  xpStep: 10,
  fourChoicesAt: 5,
  ...LEVELS[state.levelId]?.progression,
});

/** Fresh run state never inherits terrain ownership, energy or run XP. */
export function createRunLoadout(skills = ['blast', 'gale'], firstXp = 12) {
  const pair = validPair(skills) ? [...skills] : ['blast', 'gale'];
  return {
    loadout: { skills: pair },
    boons: [],
    boonTimers: {},
    progression: {
      level: 1,
      xp: 0,
      nextXp: Math.max(1, Number.isFinite(firstXp) ? firstXp : 12),
      pending: 0,
      queue: [],
    },
    skillSlots: pair.map((kind) => ({ kind, energy: 0 })),
    selectedSkill: 0,
    skillCooldown: 0,
    skillEffects: [],
    burstQueue: [],
  };
}

/** Match dev's two distinct skill slots, with atomic validation before updates. */
export function configureLoadout(state, { skills } = {}) {
  if (!state || !['ready', 'won', 'lost'].includes(state.phase) || !validPair(skills)) return false;
  state.loadout = { skills: [...skills] };
  state.skillSlots = skills.map((kind) => ({ kind, energy: 0 }));
  state.selectedSkill = 0;
  return true;
}

export function selectSkill(state, index) {
  if (!Number.isInteger(index) || !state?.skillSlots?.[index]) return false;
  state.selectedSkill = index;
  return true;
}

/** Supports the existing numeric effects and declarative modifier arrays. */
export function upgradeBonus(state, key) {
  let total = 0;
  for (const id of state.upgrades) {
    const effects = UPGRADES.find((upgrade) => upgrade.id === id)?.effects;
    if (Array.isArray(effects)) {
      for (const effect of effects)
        if (effect.stat === key && Number.isFinite(effect.value))
          total += effect.op === 'multiply' ? effect.value - 1 : effect.value;
    } else if (effects && Number.isFinite(effects[key])) total += effects[key];
  }
  return total;
}

/** This helper is only called when an offered run XP upgrade grants ownership. */
export function acquireBoon(state, boonId) {
  if (
    !Object.hasOwn(BOONS, boonId) ||
    state.boons.includes(boonId) ||
    (state.permanent?.level ?? 1) < (BOONS[boonId].unlockPlayerLevel ?? 1)
  )
    return false;
  state.boons.push(boonId);
  state.boonTimers[boonId] = 0.6;
  return true;
}

export function eligibleUpgrades(state) {
  const allowed = rulesOf(state).upgradePool;
  const permanentLevel = state.permanent?.level ?? 1;
  return UPGRADES.filter(
    (upgrade) =>
      (!allowed || allowed.includes(upgrade.id)) &&
      permanentLevel >= (upgrade.unlockPlayerLevel ?? 1) &&
      (!upgrade.id.startsWith('boon-') || !state.boons.includes(upgrade.id.slice(5))) &&
      (!['terrain-heart', 'terrain-duration'].includes(upgrade.id) || state.boons.length > 0) &&
      count(state, upgrade.id) < (upgrade.maxRank ?? upgrade.maxStacks ?? 5) &&
      (upgrade.requires ?? []).every((required) => count(state, required) > 0),
  );
}

/** Run XP is independent of the persisted profile's campaign XP and wallet. */
export function gainRunExperience(state, experience) {
  if (!Number.isFinite(experience) || experience <= 0) return 0;
  const progression = state.progression;
  const step = Math.max(0, rulesOf(state).xpStep);
  let levelsGained = 0;
  progression.xp += experience;
  while (progression.xp >= progression.nextXp) {
    progression.xp -= progression.nextXp;
    progression.level += 1;
    progression.nextXp += step;
    progression.pending += 1;
    progression.queue.push(progression.level);
    levelsGained += 1;
  }
  return levelsGained;
}

/** Category guarantees, weighted draws and shuffle preserve the current dev flow. */
export function drawUpgradeChoices(state, random) {
  const pool = eligibleUpgrades(state);
  if (!pool.length || state.progression.pending <= 0) return [];
  const rewardLevel = state.progression.queue[0] ?? state.progression.level;
  const size = rewardLevel >= rulesOf(state).fourChoicesAt ? 4 : 3;
  const choices = [];
  const add = (candidates) => {
    if (!candidates.length) return;
    const weightOf = (entry) =>
      Number.isFinite(entry.weight) && entry.weight > 0 ? entry.weight : 1;
    let roll = random(state) * candidates.reduce((sum, entry) => sum + weightOf(entry), 0);
    let selected = candidates.at(-1);
    for (const candidate of candidates) {
      roll -= weightOf(candidate);
      if (roll <= 0) {
        selected = candidate;
        break;
      }
    }
    choices.push(selected.id);
    pool.splice(pool.indexOf(selected), 1);
  };
  for (const category of ['weapon', 'terrain'])
    add(pool.filter((entry) => entry.category === category));
  while (choices.length < size && pool.length) add(pool);
  for (let index = choices.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random(state) * (index + 1));
    [choices[index], choices[swap]] = [choices[swap], choices[index]];
  }
  return choices;
}
