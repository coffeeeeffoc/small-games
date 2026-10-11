import { LEVELS } from './levels.mjs';

export function readProgress(value) {
  const progress = {
    schemaVersion: 1,
    completed: [],
    bestTime: null,
    sound: true,
    reducedMotion: null,
  };
  if (!value || value.schemaVersion !== 1) return progress;
  for (const level of LEVELS) {
    if (!Array.isArray(value.completed) || !value.completed.includes(level.id)) break;
    progress.completed.push(level.id);
  }
  if (
    Number.isFinite(value.bestTime) &&
    value.bestTime > 0 &&
    progress.completed.length === LEVELS.length
  )
    progress.bestTime = value.bestTime;
  progress.sound = value.sound !== false;
  if (typeof value.reducedMotion === 'boolean') progress.reducedMotion = value.reducedMotion;
  return progress;
}

export function unlockedCount(progress) {
  return Math.min(LEVELS.length, progress.completed.length + 1);
}

export function recordProgress(progress, run, trial = false) {
  if (trial) return false;
  let changed = false;
  for (const level of LEVELS) {
    if (progress.completed.includes(level.id)) continue;
    if (!run.roomsCleared.includes(level.id)) break;
    progress.completed.push(level.id);
    changed = true;
  }
  if (
    run.phase === 'won' &&
    run.startIndex === 0 &&
    run.roomsCleared.length === LEVELS.length &&
    (progress.bestTime === null || run.time < progress.bestTime)
  ) {
    progress.bestTime = run.time;
    changed = true;
  }
  return changed;
}
