import { createState, step, DIRECTIONS } from './rules.mjs';

export const SAVE_KEY = 'tiny-signals.progress.v1';

/** The immutable rule state is also the complete undo snapshot. */
export class PlaySession {
  constructor(level) {
    this.level = level;
    this.state = createState(level);
    this.history = [];
    this.route = [];
    this.assisted = false;
  }
  move(direction) {
    if (!DIRECTIONS.includes(direction) || this.state.status !== 'playing') return false;
    this.history.push(this.state);
    this.state = step(this.level, this.state, direction);
    this.route.push(direction);
    return true;
  }
  undo() {
    if (!this.history.length) return false;
    this.state = this.history.pop();
    this.route.pop();
    return true;
  }
  restart() {
    this.state = createState(this.level);
    this.history = [];
    this.route = [];
  }
}

export function normalizeProgress(value, levels) {
  const result = { version: 1, lastLevel: 0, levels: {} };
  if (!value || value.version !== 1) return result;
  if (
    Number.isInteger(value.lastLevel) &&
    value.lastLevel >= 0 &&
    value.lastLevel < levels.length
  ) {
    result.lastLevel = value.lastLevel;
  }
  for (const level of levels) {
    const entry = value.levels?.[level.id];
    if (!entry || typeof entry !== 'object') continue;
    const valid = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 100000;
    if (!valid(entry.best)) continue;
    result.levels[level.id] = {
      best: entry.best,
      bestUnaided: valid(entry.bestUnaided) ? Math.max(entry.best, entry.bestUnaided) : null,
    };
  }
  return result;
}

export function recordWin(progress, session) {
  if (session.state.status !== 'won') return progress;
  const previous = progress.levels[session.level.id];
  const moves = session.state.turn;
  const best = Math.min(previous?.best ?? Infinity, moves);
  const bestUnaided = session.assisted
    ? (previous?.bestUnaided ?? null)
    : Math.min(previous?.bestUnaided ?? Infinity, moves);
  return { ...progress, levels: { ...progress.levels, [session.level.id]: { best, bestUnaided } } };
}
