const KEY = 'surprise-kept.progress.v1';
const blank = () => ({ version: 1, completed: {}, lastLevel: null, run: null, sound: true });

export function readProgress(storage) {
  try {
    storage ??= globalThis.localStorage;
    const data = JSON.parse(storage.getItem(KEY));
    if (
      !data ||
      data.version !== 1 ||
      typeof data.completed !== 'object' ||
      Array.isArray(data.completed)
    )
      return blank();
    const result = blank();
    for (const [id, record] of Object.entries(data.completed || {})) {
      if (
        /^[a-z0-9-]+$/i.test(id) &&
        Number.isInteger(record?.steps) &&
        record.steps >= 0 &&
        record.steps < 10000
      )
        result.completed[id] = { steps: record.steps };
    }
    result.lastLevel = typeof data.lastLevel === 'string' ? data.lastLevel : null;
    result.sound = data.sound !== false;
    if (
      data.run &&
      typeof data.run.levelId === 'string' &&
      Array.isArray(data.run.actions) &&
      data.run.actions.length <= 500
    )
      result.run = data.run;
    return result;
  } catch {
    return blank();
  }
}

export function saveProgress(progress, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}
