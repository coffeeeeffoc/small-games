// Shared progression rules. Ranked results are awarded only by the match server.
export const RANK_TITLES = Object.freeze([
  '新卒',
  '伍长',
  '什长',
  '百夫长',
  '校尉',
  '都尉',
  '将军',
  '统帅',
  '传说',
]);
export const EXPERIENCE = Object.freeze({
  pve: Object.freeze({ victory: 20, defeat: 8, draw: 12 }),
  matched: Object.freeze({ victory: 100, defeat: 35, draw: 50 }),
});
const integer = (value, max = 1000000000) =>
  Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
const modeStats = (value) => {
  const wins = integer(value?.wins),
    losses = integer(value?.losses),
    draws = integer(value?.draws);
  return { games: wins + losses + draws, wins, losses, draws };
};
export function normalizeCareer(value) {
  return {
    version: 1,
    xp: integer(value?.xp),
    pve: modeStats(value?.pve),
    matched: modeStats(value?.matched),
    recent: (Array.isArray(value?.recent) ? value.recent : [])
      .filter(
        (r) =>
          r &&
          typeof r.id === 'string' &&
          r.id.length <= 160 &&
          Object.hasOwn(EXPERIENCE, r.mode) &&
          Object.hasOwn(EXPERIENCE[r.mode], r.outcome),
      )
      .slice(0, 20)
      .map((r) => ({
        id: r.id,
        mode: r.mode,
        outcome: r.outcome,
        xp: integer(r.xp, 100),
        reason: typeof r.reason === 'string' ? r.reason.slice(0, 40) : '',
        elapsed: integer(r.elapsed, 3600),
      })),
    settledIds: [
      ...new Set(
        (Array.isArray(value?.settledIds) ? value.settledIds : []).filter(
          (id) => typeof id === 'string' && id.length > 0 && id.length <= 160,
        ),
      ),
    ].slice(-512),
  };
}
export function getRank(experience = 0) {
  const xp = integer(experience),
    maxLevel = RANK_TITLES.length * 5;
  let level = 1,
    floor = 0;
  while (level < maxLevel && xp >= floor + 100 + 30 * (level - 1)) {
    floor += 100 + 30 * (level - 1);
    level++;
  }
  const tier = RANK_TITLES[Math.floor((level - 1) / 5)],
    division = ((level - 1) % 5) + 1;
  const nextLevelXp = level === maxLevel ? 0 : 100 + 30 * (level - 1);
  const levelXp = xp - floor;
  return {
    level,
    name: `${tier} ${division}`,
    tier,
    division,
    xp,
    levelXp,
    nextLevelXp,
    progress: nextLevelXp ? Math.min(1, levelXp / nextLevelXp) : 1,
    maxLevel,
  };
}
export function careerWinRate(career, mode = 'matched') {
  const stats = normalizeCareer(career)[mode];
  return stats?.games ? stats.wins / stats.games : null;
}
export function applyCareerResult(value, result) {
  const career = normalizeCareer(value),
    previousRank = getRank(career.xp);
  const finish = (gained = 0, duplicate = false) => {
    const rank = getRank(career.xp);
    return {
      career,
      gained,
      previousRank,
      rank,
      promoted: rank.level > previousRank.level,
      duplicate,
    };
  };
  if (!result || result.practice) return finish();
  const { id, mode, outcome, reason = '', elapsed = 0 } = result;
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    id.length > 160 ||
    !Object.hasOwn(EXPERIENCE, mode) ||
    !Object.hasOwn(EXPERIENCE[mode], outcome)
  )
    throw new TypeError('A career result requires an id, valid mode and outcome');
  if (career.settledIds.includes(id)) return finish(0, true);
  // Surrender/disconnection records the loss but never grants farming experience.
  const gained =
    outcome !== 'victory' && ['abandoned', 'expired', 'disconnected', 'surrender'].includes(reason)
      ? 0
      : EXPERIENCE[mode][outcome];
  career.xp = integer(career.xp + gained);
  career[mode].games++;
  career[mode][{ victory: 'wins', defeat: 'losses', draw: 'draws' }[outcome]]++;
  career.settledIds.push(id);
  career.settledIds = career.settledIds.slice(-512);
  career.recent.unshift({
    id,
    mode,
    outcome,
    xp: gained,
    reason: String(reason).slice(0, 40),
    elapsed: integer(elapsed, 3600),
  });
  career.recent = career.recent.slice(0, 20);
  return finish(gained);
}
