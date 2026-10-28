import { migrateProgress } from './src/core/index.mjs';
import { normalizeArmory } from './rewards.mjs';
import { normalizeCareer, getRank, careerWinRate } from './src/core/progression.mjs';

function onlineRecords(value, profile = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([origin, entry]) => {
      try {
        const url = new URL(origin);
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.origin !== origin ||
          !entry ||
          typeof entry.playerId !== 'string' ||
          entry.playerId.length > 160
        )
          return [];
        if (!profile)
          return typeof entry.token === 'string' &&
            entry.token.length >= 16 &&
            entry.token.length <= 256
            ? [[origin, { playerId: entry.playerId, token: entry.token }]]
            : [];
        const career = normalizeCareer(entry.career);
        return [
          [
            origin,
            {
              playerId: entry.playerId,
              name: String(entry.name ?? '').slice(0, 40),
              career,
              rank: getRank(career.xp),
              winRate: careerWinRate(career),
            },
          ],
        ];
      } catch {
        return [];
      }
    }),
  );
}

const KEY = 'tianxia-chalu:v1';
export function readSave(storage) {
  const fallback = {
    ...migrateProgress(null),
    tutorial: false,
    tutorials: {},
    codex: {},
    armory: normalizeArmory(null),
    career: normalizeCareer(null),
    onlineIdentity: {},
    onlineProfile: {},
    settings: { sound: true, music: true, difficulty: 'normal', serverUrl: '', online: false },
  };
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    const data = JSON.parse(target?.getItem(KEY) ?? 'null');
    if (!data || ![1, 2].includes(data.version)) return fallback;
    return {
      ...fallback,
      ...migrateProgress(data),
      tutorial: data.tutorial === true,
      tutorials: Object.fromEntries(
        Object.entries(data.tutorials ?? {}).filter(
          ([id, done]) => typeof id === 'string' && done === true,
        ),
      ),
      codex: Object.fromEntries(
        Object.entries(data.codex ?? {}).filter(
          ([id, status]) => /^(city|general|weapon):[a-z]+$/.test(id) && [1, 2].includes(status),
        ),
      ),
      armory: normalizeArmory(data.armory),
      career: normalizeCareer(data.career),
      onlineIdentity: onlineRecords(data.onlineIdentity),
      onlineProfile: onlineRecords(data.onlineProfile, true),
      settings: {
        ...fallback.settings,
        sound: data.settings?.sound !== false,
        music: data.settings?.music !== false,
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
