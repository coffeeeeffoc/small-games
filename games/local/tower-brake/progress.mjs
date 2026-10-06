export const STORAGE_KEY = 'tower-brake-v1';

const MAX_LEVELS = 8;
const SKINS = new Set(['mint', 'amber', 'ice']);
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isLevelId = (value) =>
  typeof value === 'string' && value.length > 0 && value.length <= 128 && !RESERVED_IDS.has(value);

function defaults() {
  return {
    version: 1,
    unlocked: 1,
    selected: 0,
    sound: true,
    skin: 'mint',
    best: {},
    continuedBest: {},
  };
}

function sanitizeResult(result) {
  if (
    !isRecord(result) ||
    !Number.isFinite(result.elapsed) ||
    result.elapsed <= 0 ||
    !Number.isSafeInteger(result.maxStreak) ||
    result.maxStreak < 0 ||
    result.maxStreak > 12 ||
    !Number.isSafeInteger(result.brakesUsed) ||
    result.brakesUsed < 0
  )
    return null;

  return {
    elapsed: result.elapsed,
    maxStreak: result.maxStreak,
    brakesUsed: result.brakesUsed,
  };
}

function sanitizeScores(scores, allowedIds) {
  if (!isRecord(scores)) return {};
  return Object.fromEntries(
    Object.entries(scores).flatMap(([id, value]) => {
      if (!isLevelId(id) || (allowedIds && !allowedIds.has(id))) return [];
      const result = sanitizeResult(value);
      return result ? [[id, result]] : [];
    }),
  );
}

function sanitizeProgress(saved, levels) {
  const progress = defaults();
  if (!isRecord(saved) || (saved.version !== undefined && saved.version !== 1)) return progress;

  const catalog = Array.isArray(levels) ? levels.slice(0, MAX_LEVELS) : null;
  const count = catalog ? Math.max(1, catalog.length) : MAX_LEVELS;
  const allowedIds = catalog ? new Set(catalog.map((level) => level?.id).filter(isLevelId)) : null;

  if (Number.isInteger(saved.unlocked)) {
    progress.unlocked = Math.max(1, Math.min(count, saved.unlocked));
  }
  if (Number.isInteger(saved.selected)) {
    progress.selected = Math.max(0, Math.min(progress.unlocked - 1, saved.selected));
  }
  progress.sound = saved.sound !== false;
  progress.skin = SKINS.has(saved.skin) ? saved.skin : 'mint';
  progress.best = sanitizeScores(saved.best, allowedIds);
  progress.continuedBest = sanitizeScores(saved.continuedBest, allowedIds);
  return progress;
}

/** A blocked or damaged browser store must never prevent starting a game. */
export function readProgress(storage, levels) {
  try {
    return sanitizeProgress(JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null'), levels);
  } catch {
    return defaults();
  }
}

export function saveProgress(storage, progress) {
  try {
    if (!storage || !isRecord(progress)) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(sanitizeProgress(progress)));
    return true;
  } catch {
    return false;
  }
}

/** Mutates and returns progress. Practice wins are a complete no-op. */
export function recordWin(progress, levelIndex, levelId, result, { practice = false } = {}) {
  if (
    practice ||
    !isRecord(progress) ||
    !Number.isInteger(levelIndex) ||
    levelIndex < 0 ||
    levelIndex >= MAX_LEVELS ||
    !isLevelId(levelId)
  )
    return progress;

  const score = sanitizeResult(result);
  if (!score || (result.continued !== undefined && typeof result.continued !== 'boolean')) {
    return progress;
  }

  const next = sanitizeProgress(progress);
  const scores = result.continued === true ? next.continuedBest : next.best;
  const previous = scores[levelId];
  if (!previous || score.elapsed < previous.elapsed) scores[levelId] = score;
  next.unlocked = Math.min(MAX_LEVELS, Math.max(next.unlocked, levelIndex + 2));
  Object.assign(progress, next);
  return progress;
}
