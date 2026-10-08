import { LEVELS, getLevel } from './levels.mjs';
import { SHAPE_BY_ID } from './shapes.mjs';
import { RULE_VERSION, getStars } from './engine.mjs';

export const STORAGE_KEY = 'three-choose-two-progress-v1';
export const PROGRESS_VERSION = 1;
const copy = (value) => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeInteger = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;

export function createProgress() {
  return { version: PROGRESS_VERSION, unlocked: 1, records: {}, practiceBest: 0, refillBest: 0,
    settings: { sound: true, music: true, vibration: true, highContrast: false, reducedFlash: false }, currentGame: null };
}
function validState(state) {
  return object(state) && state.version === RULE_VERSION && ['level', 'endless'].includes(state.mode)
    && (state.variant === undefined || state.mode === 'endless' && ['classic', 'refill'].includes(state.variant))
    && (state.variant !== 'refill' || state.placedInGroup === 0 && state.used?.length === 0)
    && !(state.mode === 'endless' && state.ranked)
    && Array.isArray(state.board) && state.board.length === 64 && state.board.every((cell) => safeInteger(cell, 0, 5))
    && Array.isArray(state.starBoard) && state.starBoard.length === 64 && state.starBoard.every((cell) => typeof cell === 'boolean')
    && Array.isArray(state.candidates) && state.candidates.length === 3 && state.candidates.every((candidate) => SHAPE_BY_ID[candidate?.shapeId])
    && Array.isArray(state.used) && state.used.length <= 2 && new Set(state.used).size === state.used.length && state.used.every((slot) => safeInteger(slot, 0, 2))
    && safeInteger(state.group, 1) && safeInteger(state.score) && safeInteger(state.combo)
    && object(state.stats) && Object.values(state.stats).every((value) => safeInteger(value))
    && ['playing', 'lost', 'won', 'finished'].includes(state.status)
    && (state.mode !== 'level' || (getLevel(state.levelId) && object(state.config) && state.config.id === state.levelId && Array.isArray(state.config.candidates)))
    && (state.mode !== 'endless' || safeInteger(state.rng, 1, 4294967295));
}
function normalize(saved) {
  const progress = createProgress();
  if (!object(saved) || (saved.version !== undefined && saved.version !== 1)) return progress;
  if (object(saved.records)) for (const level of LEVELS) {
    const record = saved.records[level.id];
    if (object(record) && safeInteger(record.stars, 1, 3) && safeInteger(record.bestGroups, 1, level.maxGroups + 2)) {
      progress.records[level.id] = { stars: record.stars, bestGroups: record.bestGroups, continued: record.continued === true };
    }
  }
  // A stored unlock number alone cannot skip the configured sequence.
  while (progress.unlocked < LEVELS.length && progress.records[progress.unlocked]) progress.unlocked += 1;
  if (safeInteger(saved.practiceBest)) progress.practiceBest = saved.practiceBest;
  if (safeInteger(saved.refillBest)) progress.refillBest = saved.refillBest;
  if (object(saved.settings)) for (const name of Object.keys(progress.settings)) if (typeof saved.settings[name] === 'boolean') progress.settings[name] = saved.settings[name];
  if (validState(saved.currentGame) && (saved.currentGame.mode !== 'level' || saved.currentGame.levelId <= progress.unlocked)) progress.currentGame = copy(saved.currentGame);
  return progress;
}
export function readProgress(storage) {
  try { return normalize(JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null')); }
  catch { return createProgress(); }
}
export function saveProgress(storage, progress) {
  try { if (!storage) return false; storage.setItem(STORAGE_KEY, JSON.stringify(progress)); return true; }
  catch { return false; }
}
export function isLevelUnlocked(progress, id) {
  return Boolean(getLevel(id)) && Number(id) <= progress.unlocked;
}
export function totalStars(progress) {
  return LEVELS.reduce((sum, level) => sum + (progress.records[level.id]?.stars ?? 0), 0);
}
export function recordLevelResult(progress, state) {
  if (state.mode !== 'level' || state.status !== 'won' || !getLevel(state.levelId)) return progress;
  const next = copy(progress);
  const stars = getStars(state);
  const groups = Math.ceil(state.stats.placements / 2);
  const previous = next.records[state.levelId];
  next.records[state.levelId] = {
    stars: Math.max(previous?.stars ?? 0, stars),
    bestGroups: Math.min(previous?.bestGroups ?? Infinity, groups),
    continued: previous ? previous.continued && state.continued : state.continued,
  };
  while (next.unlocked < LEVELS.length && next.records[next.unlocked]) next.unlocked += 1;
  next.currentGame = null;
  return next;
}
export function recordEndlessResult(progress, state) {
  if (state.mode !== 'endless' || state.ranked || !['lost', 'finished'].includes(state.status)) return progress;
  const next = copy(progress);
  const key = state.variant === 'refill' ? 'refillBest' : 'practiceBest';
  next[key] = Math.max(next[key] ?? 0, state.score);
  next.currentGame = null;
  return next;
}
export function saveCurrentGame(progress, state) {
  const next = copy(progress);
  next.currentGame = state && validState(state) ? copy(state) : null;
  return next;
}
export function resumeState(progress) {
  return validState(progress.currentGame) ? copy(progress.currentGame) : null;
}
export function mergeProgress(local, remote) {
  const a = normalize(local), b = normalize(remote);
  const merged = { ...a, practiceBest: Math.max(a.practiceBest, b.practiceBest), refillBest: Math.max(a.refillBest, b.refillBest), records: { ...a.records } };
  for (const [id, other] of Object.entries(b.records)) {
    const own = merged.records[id];
    merged.records[id] = own ? { stars: Math.max(own.stars, other.stars), bestGroups: Math.min(own.bestGroups, other.bestGroups), continued: own.continued && other.continued } : other;
  }
  merged.unlocked = 1;
  while (merged.unlocked < LEVELS.length && merged.records[merged.unlocked]) merged.unlocked += 1;
  return merged;
}
