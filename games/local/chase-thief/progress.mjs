import { LEVELS } from './levels.mjs';

export function freshProgress() {
  return {
    version: 1,
    unlocked: [LEVELS[0].id],
    best: {},
    selected: LEVELS[0].id,
    sound: true,
    haptics: true,
  };
}

function validResult(result, level) {
  return (
    result &&
    typeof result === 'object' &&
    Number.isFinite(result.time) &&
    result.time > 0 &&
    result.time <= level.duration &&
    Number.isInteger(result.collisions) &&
    result.collisions >= 0 &&
    result.collisions < 3 &&
    Number.isInteger(result.boosts) &&
    result.boosts >= 0 &&
    result.boosts <= Math.floor(level.waves.length / 3)
  );
}

/** Storage failures and unsupported versions reset locally, without blocking play. */
export function loadProgress(raw) {
  const progress = freshProgress();
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return progress;
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.version !== 1) {
    return progress;
  }

  // A later street cannot be unlocked while a street before it remains locked.
  const savedIds = new Set(Array.isArray(data.unlocked) ? data.unlocked : []);
  for (const level of LEVELS.slice(1)) {
    if (!savedIds.has(level.id)) break;
    progress.unlocked.push(level.id);
  }
  if (typeof data.sound === 'boolean') progress.sound = data.sound;
  if (typeof data.haptics === 'boolean') progress.haptics = data.haptics;
  if (progress.unlocked.includes(data.selected)) progress.selected = data.selected;
  if (data.best && typeof data.best === 'object' && !Array.isArray(data.best)) {
    for (const level of LEVELS) {
      const result = data.best[level.id];
      if (progress.unlocked.includes(level.id) && validResult(result, level)) {
        progress.best[level.id] = {
          time: result.time,
          collisions: result.collisions,
          boosts: result.boosts,
        };
      }
    }
  }
  return progress;
}

function isBetter(result, previous) {
  if (!previous || result.time < previous.time) return true;
  if (result.time > previous.time) return false;
  if (result.collisions < previous.collisions) return true;
  return result.collisions === previous.collisions && result.boosts > previous.boosts;
}

/** Pure settlement: retries cannot duplicate rewards and practice never scores. */
export function recordWin(progress, run) {
  const next = loadProgress(progress);
  if (!run || run.practice === true || run.phase !== 'won') return next;
  const levelIndex = LEVELS.findIndex((level) => level.id === run.levelId);
  if (levelIndex < 0 || !next.unlocked.includes(run.levelId)) return next;
  const level = LEVELS[levelIndex];
  const result = {
    time: run.elapsed,
    collisions: run.collisions,
    boosts: run.boosts,
  };
  if (!validResult(result, level)) return next;

  if (isBetter(result, next.best[level.id])) next.best[level.id] = result;
  const following = LEVELS[levelIndex + 1];
  if (following && !next.unlocked.includes(following.id)) next.unlocked.push(following.id);
  next.selected = level.id;
  return next;
}
