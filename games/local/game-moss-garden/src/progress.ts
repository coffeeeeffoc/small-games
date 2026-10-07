import { getLevel, LEVELS } from './content.ts';
import type { Level } from './content.ts';
import { restorePuzzle, safeCount } from './rules.ts';
import type { PuzzleState } from './rules.ts';

export type Completion = { hints: number; mistakes: number; timeMs: number };
export type Save = {
  version: 1;
  completed: Record<string, Completion>;
  active: { levelId: string; puzzle: PuzzleState; elapsedMs: number } | null;
  sound: boolean;
  vibration: boolean;
};

export function createSave(): Save {
  return { version: 1, completed: {}, active: null, sound: true, vibration: true };
}

function safeTime(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(31_536_000_000, Math.floor(value))
    : 0;
}

function validStat(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0
  );
}

export function unlocked(save: Save, level: Level): boolean {
  const index = LEVELS.findIndex((item) => item.id === level.id);
  return index === 0 || (index > 0 && !!save.completed[LEVELS[index - 1].id]);
}

export function parseSave(raw: unknown): Save {
  if (typeof raw === 'string') {
    try {
      return parseSave(JSON.parse(raw));
    } catch {
      return createSave();
    }
  }
  if (!raw || typeof raw !== 'object') return createSave();
  const value = raw as Record<string, unknown>;
  const save = createSave();
  if (typeof value.sound === 'boolean') save.sound = value.sound;
  if (typeof value.vibration === 'boolean') save.vibration = value.vibration;
  if (value.version !== 1) return save;
  if (value.completed && typeof value.completed === 'object') {
    const completed = value.completed as Record<string, unknown>;
    for (const level of LEVELS) {
      const record = completed[level.id];
      // Normal progression is a completed prefix. A corrupt later record cannot
      // bypass the missing prerequisite or grant access to a locked chapter.
      if (!record || typeof record !== 'object' || Array.isArray(record)) break;
      const stats = record as Record<string, unknown>;
      if (!validStat(stats.hints) || !validStat(stats.mistakes) || !validStat(stats.timeMs)) break;
      save.completed[level.id] = {
        hints: safeCount(stats.hints),
        mistakes: safeCount(stats.mistakes),
        timeMs: safeTime(stats.timeMs),
      };
    }
  }
  if (value.active && typeof value.active === 'object') {
    const active = value.active as Record<string, unknown>;
    const level = typeof active.levelId === 'string' ? getLevel(active.levelId) : undefined;
    if (level && unlocked(save, level)) {
      const puzzle = restorePuzzle(level, active.puzzle);
      if (!puzzle.completed)
        save.active = { levelId: level.id, puzzle, elapsedMs: safeTime(active.elapsedMs) };
    }
  }
  return save;
}

/** Settle a completed board only once; a retry cannot duplicate progression. */
export function recordCompletion(
  save: Save,
  level: Level,
  puzzle: PuzzleState,
  timeMs: number,
): Save {
  if (!unlocked(save, level) || !restorePuzzle(level, puzzle).completed || save.completed[level.id])
    return save;
  return {
    ...save,
    completed: {
      ...save.completed,
      [level.id]: {
        hints: safeCount(puzzle.hints),
        mistakes: safeCount(puzzle.mistakes),
        timeMs: safeTime(timeMs),
      },
    },
    active: save.active?.levelId === level.id ? null : save.active,
  };
}
