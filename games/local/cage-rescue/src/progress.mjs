import { LEVELS } from './levels.mjs';

export const THEMES = [
  { id: 'rescue', title: '曙光小队', subtitle: '橙黄队服 · 救援塔', required: 0 },
  { id: 'mint', title: '极光小队', subtitle: '薄荷队服 · 极光夜', required: 2 },
  { id: 'rose', title: '星火小队', subtitle: '珊瑚队服 · 紫夜城', required: 4 },
];
export function readProgress(data) {
  const result = { version: 1, completed: {}, sound: true, theme: 'rescue' };
  if (!data || data.version !== 1) return result;
  for (const level of LEVELS) {
    const record = data.completed?.[level.id];
    if (!record || !Number.isInteger(record.rescued) || record.rescued < 4 || record.rescued > 6)
      break;
    result.completed[level.id] = {
      rescued: record.rescued,
      seconds: Number.isFinite(record.seconds) && record.seconds >= 0 ? record.seconds : 0,
      lives: Number.isInteger(record.lives) ? Math.max(0, Math.min(3, record.lives)) : 0,
    };
  }
  result.sound = data.sound !== false;
  if (
    THEMES.some(
      (theme) => theme.id === data.theme && theme.required <= Object.keys(result.completed).length,
    )
  )
    result.theme = data.theme;
  return result;
}
export function unlockedCount(progress) {
  return Math.min(LEVELS.length, Object.keys(progress.completed).length + 1);
}
export function completeLevel(progress, game, trial = false) {
  if (trial || game.phase !== 'won') return false;
  const level = LEVELS[game.levelIndex ?? game.index ?? 0];
  if (!level) return false;
  const index = LEVELS.indexOf(level);
  if (index >= unlockedCount(progress)) return false;
  const previous = progress.completed[level.id];
  const record = { rescued: game.rescued, seconds: game.time, lives: game.lives };
  if (
    !previous ||
    record.rescued > previous.rescued ||
    (record.rescued === previous.rescued && record.seconds < previous.seconds)
  )
    progress.completed[level.id] = record;
  return true;
}
