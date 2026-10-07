import { migrateProgress } from './src/core/index.mjs';

const KEY = 'tianxia-chalu:v1';
export function readSave(storage) {
  const fallback = {
    ...migrateProgress(null),
    tutorial: false,
    settings: { sound: true, difficulty: 'normal', serverUrl: '', online: false },
  };
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    const data = JSON.parse(target?.getItem(KEY) ?? 'null');
    if (!data || data.version !== 1) return fallback;
    return {
      ...fallback,
      ...migrateProgress(data),
      tutorial: data.tutorial === true,
      settings: {
        ...fallback.settings,
        sound: data.settings?.sound !== false,
        difficulty: ['easy', 'normal', 'hard'].includes(data.settings?.difficulty)
          ? data.settings.difficulty
          : 'normal',
        serverUrl: typeof data.settings?.serverUrl === 'string' ? data.settings.serverUrl : '',
        online: data.settings?.online === true,
      },
    };
  } catch {
    return fallback;
  }
}
export function writeSave(data, storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    if (typeof target?.setItem !== 'function') return false;
    target.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
