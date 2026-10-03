/** Only puzzle outcomes and preferences are stored; route edits stay ephemeral. */
export const PROGRESS_KEY = 'echo-weaver-progress-v1';

const unsafeIds = new Set(['__proto__', 'constructor', 'prototype']);
const validId = (id) =>
  typeof id === 'string' && id.length > 0 && id.length <= 160 && !unsafeIds.has(id);
const validAttempts = (value) => Number.isSafeInteger(value) && value > 0;
const emptyProgress = () => ({
  version: 1,
  selected: 0,
  completed: {},
  sound: false,
  locale: 'zh',
});

function cleanCompleted(completed, allowedIds) {
  const result = {};
  if (!completed || typeof completed !== 'object' || Array.isArray(completed)) return result;
  for (const [id, outcome] of Object.entries(completed)) {
    if (!validId(id) || (allowedIds && !allowedIds.has(id))) continue;
    if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) continue;
    if (validAttempts(outcome.attempts)) result[id] = { attempts: outcome.attempts };
  }
  return result;
}

/** Broken, old, or denied browser storage never prevents a player from playing. */
export function readProgress(storage, levels = []) {
  const fallback = emptyProgress();
  try {
    const raw = storage?.getItem(PROGRESS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.version !== 1)
      return fallback;
    const knownLevels = Array.isArray(levels) ? levels : [];
    const ids = new Set(knownLevels.map((level) => level?.id).filter(validId));
    return {
      version: 1,
      selected:
        Number.isSafeInteger(parsed.selected) &&
        parsed.selected >= 0 &&
        parsed.selected < knownLevels.length
          ? parsed.selected
          : 0,
      completed: cleanCompleted(parsed.completed, ids),
      sound: parsed.sound === true,
      locale: parsed.locale === 'en' ? 'en' : 'zh',
    };
  } catch {
    return fallback;
  }
}

/** Return false on private-mode/quota failures; callers can keep in-memory progress. */
export function persistProgress(storage, progress) {
  try {
    if (
      !storage ||
      typeof storage.setItem !== 'function' ||
      !progress ||
      typeof progress !== 'object'
    )
      return false;
    const snapshot = {
      version: 1,
      selected:
        Number.isSafeInteger(progress.selected) && progress.selected >= 0 ? progress.selected : 0,
      completed: cleanCompleted(progress.completed),
      sound: progress.sound === true,
      locale: progress.locale === 'en' ? 'en' : 'zh',
    };
    storage.setItem(PROGRESS_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}
