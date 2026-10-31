import { LEVELS } from './campaign.js';
export const PROGRESS_KEY = 'tetracube.progress.v1';
export function createProgressStore(storage) {
  let writable = true;
  /** @type {Record<string, {stars:number,time:number}>} */
  let levels = {};
  try {
    const raw = storage.getItem(PROGRESS_KEY);
    if (raw) {
      const value = JSON.parse(raw);
      if (
        value?.version !== 1 ||
        !value.levels ||
        Array.isArray(value.levels) ||
        typeof value.levels !== 'object'
      )
        throw new Error('Invalid progress');
      for (const [id, entry] of Object.entries(value.levels)) {
        if (
          !LEVELS.some((item) => item.id === id) ||
          !Number.isInteger(entry?.stars) ||
          entry.stars < 1 ||
          entry.stars > 3 ||
          !Number.isSafeInteger(entry?.time) ||
          entry.time < 0
        )
          throw new Error('Invalid progress entry');
      }
      levels = value.levels;
    }
  } catch {
    writable = false;
  }
  return {
    get writable() {
      return writable;
    },
    get levels() {
      return structuredClone(levels);
    },
    unlocked(index) {
      return index === 0 || !!levels[LEVELS[index - 1]?.id];
    },
    complete(levelId, result) {
      if (
        !writable ||
        !LEVELS.some((item) => item.id === levelId) ||
        ![1, 2, 3].includes(result.stars) ||
        !Number.isSafeInteger(result.secondary) ||
        result.secondary < 0
      )
        return false;
      const old = levels[levelId];
      const next = {
        ...levels,
        [levelId]: {
          stars: Math.max(old?.stars || 0, result.stars),
          time: Math.min(old?.time ?? Infinity, result.secondary),
        },
      };
      try {
        storage.setItem(PROGRESS_KEY, JSON.stringify({ version: 1, levels: next }));
        levels = next;
        return true;
      } catch {
        return false;
      }
    },
  };
}
