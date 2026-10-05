import { LEVELS } from './levels.mjs';
export const SAVE_KEY = 'retreat-rally:progress:v1';
export const emptyProgress = () => ({ version: 1, medals: {}, muted: false });
export function migrateProgress(raw) {
  const result = emptyProgress();
  if (!raw || raw.version !== 1) return result;
  result.muted = raw.muted === true;
  for (const l of LEVELS) {
    const n = raw.medals?.[l.id];
    if (Number.isInteger(n) && n > 0 && n <= 3 && l.prerequisites.every((id) => result.medals[id]))
      result.medals[l.id] = n;
  }
  return result;
}
export const unlocked = (progress, level) => level.prerequisites.every((id) => progress.medals[id]);
export function recordVictory(progress, battle, practice = false) {
  if (battle.resultRecorded || battle.status !== 'won' || battle.mode !== 'campaign' || practice)
    return false;
  battle.resultRecorded = true;
  const stars = battle.casualties === 0 ? 3 : battle.casualties <= 2 ? 2 : 1;
  progress.medals[battle.level.id] = Math.max(progress.medals[battle.level.id] || 0, stars);
  return true;
}
