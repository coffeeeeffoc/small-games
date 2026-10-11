import { levels, getLevel, evaluateChallenges } from './levels.mjs';
export const saveKey = 'flick-arena-v1';
const nonnegative = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : 0);
export function readSave(value) {
  if (!value || value.version !== 1) return { version: 1, played: 0, wins: 0, sound: true };
  const save = {
    version: 1,
    played: nonnegative(value.played),
    wins: Math.min(nonnegative(value.wins), nonnegative(value.played)),
    sound: value.sound !== false,
  };
  if (value.theme !== undefined)
    save.theme = ['wood', 'jade', 'moon', 'gold'].includes(value.theme) ? value.theme : 'wood';
  if (value.campaign && typeof value.campaign === 'object') {
    const records = {};
    for (const level of levels) {
      const record = value.campaign.levels?.[level.id];
      if (!record || !nonnegative(record.stars)) continue;
      // A stored victory plus explicit goal IDs is the source of truth for accumulated stars.
      const goals = [
        ...new Set(
          (Array.isArray(record.goals) ? record.goals : []).filter((id) =>
            level.challenges.some((goal) => goal.id === id),
          ),
        ),
      ];
      records[level.id] = {
        stars: 1 + goals.length,
        goals,
        bestShots:
          Number.isSafeInteger(record.bestShots) && record.bestShots > 0 ? record.bestShots : null,
      };
    }
    save.campaign = {
      levels: records,
      settled: (Array.isArray(value.campaign.settled) ? value.campaign.settled : [])
        .filter((key) => typeof key === 'string' && key.length < 160)
        .slice(-100),
    };
  }
  return save;
}
export function settle(save, winner) {
  return { ...save, played: save.played + 1, wins: save.wins + (winner === 0 ? 1 : 0) };
}
export function isLevelUnlocked(save, idOrIndex) {
  const level = getLevel(idOrIndex);
  return Boolean(level && (!level.requires || save.campaign?.levels?.[level.requires]?.stars > 0));
}
export function nextLevel(save) {
  return (
    levels.find(
      (level) => isLevelUnlocked(save, level.id) && !save.campaign?.levels?.[level.id]?.stars,
    ) ?? levels.at(-1)
  );
}
export function totalStars(save) {
  return levels.reduce((sum, level) => sum + (save.campaign?.levels?.[level.id]?.stars ?? 0), 0);
}
// Replays/resumes of one finished seeded match must never award or count it a second time.
export function settleCampaign(save, level, state) {
  level = typeof level === 'string' || typeof level === 'number' ? getLevel(level) : level;
  if (
    !level ||
    state.phase !== 'over' ||
    state.layout !== level.id ||
    !isLevelUnlocked(save, level.id)
  )
    return save;
  const key = `${level.id}:${state.seed}:${state.shots}`;
  if (save.campaign?.settled?.includes(key)) return save;
  const result = evaluateChallenges(level, state);
  const campaign = {
    levels: { ...save.campaign?.levels },
    settled: [...(save.campaign?.settled ?? []), key].slice(-100),
  };
  if (result.won) {
    const previous = campaign.levels[level.id];
    const goals = [
      ...new Set([
        ...(previous?.goals ?? []),
        ...result.goals.filter((goal) => goal.complete).map((goal) => goal.id),
      ]),
    ];
    campaign.levels[level.id] = {
      stars: 1 + goals.length,
      goals,
      bestShots: Math.min(previous?.bestShots ?? Infinity, state.playerShots),
    };
  }
  return { ...settle(save, state.winner), campaign };
}
