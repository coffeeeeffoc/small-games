export const STORAGE_KEY = 'out-of-frame-progress-v1';

export function readProgress(storage, levels) {
  const empty = { completed: {}, sound: false };
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY));
    if (!value || typeof value !== 'object') return empty;
    const completed = {};
    for (const level of levels) {
      const time = value.completed?.[level.id];
      if (Number.isFinite(time) && time > 0) completed[level.id] = time;
    }
    return { completed, sound: value.sound === true };
  } catch {
    return empty;
  }
}

export function writeProgress(storage, progress) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}
