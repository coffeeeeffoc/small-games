export const STORAGE_KEY = 'waterline-station-v1';

/** Treat browser storage as optional and validate saves before using them. */
export function readProgress(storage, levels) {
  const progress = { selected: 0, sound: false, best: {} };
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return progress;
    if (Number.isInteger(saved.selected) && saved.selected >= 0 && saved.selected < levels.length) {
      progress.selected = saved.selected;
    }
    progress.sound = saved.sound === true;
    if (saved.best && typeof saved.best === 'object' && !Array.isArray(saved.best)) {
      progress.best = Object.fromEntries(
        levels.flatMap((level) => {
          const best = saved.best[level.id];
          return Object.hasOwn(saved.best, level.id) &&
            Number.isInteger(best) &&
            best > 0 &&
            best <= level.maxMoves + 1
            ? [[level.id, best]]
            : [];
        }),
      );
    }
  } catch {
    /* Private browsing and damaged saves must not stop play. */
  }
  return progress;
}

export function saveProgress(storage, progress) {
  try {
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}
