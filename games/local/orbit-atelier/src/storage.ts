import { createState, type State } from './core.ts';
import { LEVELS } from './levels.ts';

export const SAVE_KEY = 'orbit-atelier.v1';
export type Run = { state: State; moves: number; hints: number };
export type Progress = {
  version: 1;
  medals: Record<string, number>;
  settings: { sound: boolean; vibration: boolean; reducedMotion: boolean };
  run: Run | null;
};
export function freshProgress(): Progress {
  return {
    version: 1,
    medals: {},
    settings: { sound: true, vibration: false, reducedMotion: false },
    run: null,
  };
}
const integer = (value: unknown, limit: number) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= limit;

/** Rebuild saved attempts from current level content; never trust saved geometry. */
export function parseProgress(raw: string | null): Progress {
  const result = freshProgress();
  if (!raw) return result;
  try {
    const data = JSON.parse(raw);
    if (data?.version !== 1) return result;
    for (const level of LEVELS) {
      const score = data.medals?.[level.id];
      if (integer(score, 3) && score > 0) result.medals[level.id] = score;
    }
    // Unlocks are sequential even if a stale or manually edited save has holes.
    let gap = false;
    for (const level of LEVELS) {
      if (gap) delete result.medals[level.id];
      if (!result.medals[level.id]) gap = true;
    }
    for (const key of ['sound', 'vibration', 'reducedMotion'] as const)
      if (typeof data.settings?.[key] === 'boolean') result.settings[key] = data.settings[key];
    const level = LEVELS.find((entry) => entry.id === data.run?.state?.levelId);
    if (
      !level ||
      LEVELS.indexOf(level) > unlockedIndex(result) ||
      !integer(data.run.moves, 100000) ||
      !integer(data.run.hints, 100000)
    )
      return result;
    const state = createState(level);
    const saved = data.run.state.rings;
    if (!Array.isArray(saved) || saved.length !== state.rings.length) return result;
    for (const ring of state.rings) {
      const matches = saved.filter((entry: { id?: unknown }) => entry?.id === ring.id);
      const entry = matches[0];
      if (
        matches.length !== 1 ||
        typeof entry.angle !== 'number' ||
        !Number.isFinite(entry.angle) ||
        typeof entry.removed !== 'boolean'
      )
        return result;
      ring.angle = Math.atan2(Math.sin(entry.angle), Math.cos(entry.angle));
      ring.removed = entry.removed;
    }
    state.releasedCount = state.rings.filter((ring) => ring.removed).length;
    if (state.releasedCount < state.rings.length)
      result.run = { state, moves: data.run.moves, hints: data.run.hints };
  } catch {
    /* Corrupt or unavailable storage falls back to a playable new game. */
  }
  return result;
}
export function unlockedIndex(progress: Progress): number {
  const first = LEVELS.findIndex((level) => !progress.medals[level.id]);
  return first < 0 ? LEVELS.length - 1 : first;
}
export function settle(progress: Progress, run: Run): number {
  if (run.state.rings.some((ring) => !ring.removed)) return 0;
  const medal = run.hints ? 1 : run.moves <= run.state.rings.length * 2 ? 3 : 2;
  progress.medals[run.state.levelId] = Math.max(progress.medals[run.state.levelId] ?? 0, medal);
  progress.run = null;
  return medal;
}
