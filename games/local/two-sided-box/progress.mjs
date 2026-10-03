export const STORAGE_KEY = 'two-sided-box-v1';

export function readProgress(storage, levels) {
  const progress = { selected: 0, sound: true, best: {} };
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return progress;
    if (Number.isInteger(saved.selected) && saved.selected >= 0 && saved.selected < levels.length)
      progress.selected = saved.selected;
    progress.sound = saved.sound !== false;
    if (saved.best && typeof saved.best === 'object' && !Array.isArray(saved.best)) {
      progress.best = Object.fromEntries(
        levels.flatMap((level) => {
          const best = saved.best[level.id];
          return Object.hasOwn(saved.best, level.id) &&
            Number.isInteger(best) &&
            best > 0 &&
            best < 10000
            ? [[level.id, best]]
            : [];
        }),
      );
    }
  } catch {
    /* Storage is optional. */
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
