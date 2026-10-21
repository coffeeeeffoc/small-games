import { CATALOG, LEVELS, getSpec } from './content.ts';
import type { Match } from './engine.ts';
import { TICK_RATE } from './engine.ts';

export interface Progress {
  version: 2;
  unlockedLevel: number;
  unlockedIds: string[];
  medals: Record<string, number>;
  maxLevels: Record<string, number>;
  uses: Record<string, number>;
  tutorialStep: number;
  sound: boolean;
  vibration: boolean;
  settledMatchIds: string[];
  assistedMatchIds: string[];
  legacyWins: number;
}
export interface Settlement {
  settled: boolean;
  unlocks: string[];
  medals: number;
}
const integer = (n: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= min && n <= max;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const validMatchId = (value: unknown): value is string =>
  typeof value === 'string' && /^mf-[a-z0-9-]+$/.test(value);
export function createProgress(): Progress {
  return {
    version: 2,
    unlockedLevel: 1,
    unlockedIds: CATALOG.filter((s) => s.unlock === 0).map((s) => s.id),
    medals: {},
    maxLevels: {},
    uses: {},
    tutorialStep: 0,
    sound: true,
    vibration: true,
    settledMatchIds: [],
    assistedMatchIds: [],
    legacyWins: 0,
  };
}
export function readProgress(input: unknown): Progress {
  const progress = createProgress();
  let data: unknown = input;
  try {
    if (typeof data === 'string') data = JSON.parse(data);
  } catch {
    return progress;
  }
  if (!object(data)) return progress;
  if (typeof data.sound === 'boolean') progress.sound = data.sound;
  if (typeof data.vibration === 'boolean') progress.vibration = data.vibration;
  if (integer(data.legacyWins)) progress.legacyWins = data.legacyWins;
  else if (integer(data.wins)) progress.legacyWins = data.wins;
  else if (object(data.wins))
    progress.legacyWins = Object.values(data.wins).reduce<number>(
      (sum, value) => (integer(value) ? Math.min(Number.MAX_SAFE_INTEGER, sum + value) : sum),
      0,
    );
  if (data.version !== 2) return progress;
  if (integer(data.unlockedLevel, 1, LEVELS.length)) progress.unlockedLevel = data.unlockedLevel;
  // Unlocks are reconstructed from the verified level range, never from arbitrary recipe IDs.
  progress.unlockedIds = CATALOG.filter((s) => s.unlock < progress.unlockedLevel).map((s) => s.id);
  if (integer(data.tutorialStep, 0, 6)) progress.tutorialStep = data.tutorialStep;
  if (object(data.medals))
    for (const level of LEVELS) {
      const count = data.medals[level.id];
      if (level.number <= progress.unlockedLevel && integer(count, 1, 3))
        progress.medals[level.id] = count;
    }
  if (object(data.uses))
    for (const key of progress.unlockedIds) {
      const count = data.uses[key];
      if (integer(count)) progress.uses[key] = count;
    }
  if (object(data.maxLevels))
    for (const key of progress.unlockedIds) {
      const value = data.maxLevels[key];
      if (
        integer(value, 1) &&
        Number.isSafeInteger(Math.round(getSpec(key).hp * (1 + (value - 1) * 0.45)))
      )
        progress.maxLevels[key] = value;
    }
  if (Array.isArray(data.settledMatchIds))
    progress.settledMatchIds = [...new Set(data.settledMatchIds.filter(validMatchId))];
  if (Array.isArray(data.assistedMatchIds))
    progress.assistedMatchIds = [
      ...new Set(
        data.assistedMatchIds.filter(
          (id): id is string => validMatchId(id) && progress.settledMatchIds.includes(id),
        ),
      ),
    ];
  return progress;
}
export function isUnlocked(progress: Progress, levelId: string): boolean {
  return LEVELS.some((l) => l.id === levelId && l.number <= progress.unlockedLevel);
}
export function settleProgress(progress: Progress, match: Match): Settlement {
  const result: Settlement = { settled: false, unlocks: [], medals: 0 };
  const level = LEVELS.find((l) => l.id === match.levelId);
  if (
    !level ||
    match.practice ||
    match.phase === 'running' ||
    !isUnlocked(progress, match.levelId) ||
    !validMatchId(match.id) ||
    progress.settledMatchIds.includes(match.id)
  )
    return result;
  if (!['won', 'lost', 'draw'].includes(match.phase)) return result;
  if (
    (match.phase === 'won' && (match.winner !== 0 || match.sides[1].crystalHp !== 0)) ||
    (match.phase === 'lost' && (match.winner !== 1 || match.sides[0].crystalHp !== 0)) ||
    (match.phase === 'draw' &&
      (match.winner !== null || match.sides.some((s) => s.crystalHp !== 0)))
  )
    return result;
  progress.settledMatchIds.push(match.id);
  if (match.assisted) progress.assistedMatchIds.push(match.id);
  if (match.tutorial) progress.tutorialStep = Math.max(progress.tutorialStep, match.tutorialStep);
  for (const [key, value] of Object.entries(match.maxLevels)) {
    if (progress.unlockedIds.includes(key) && integer(value, 1)) {
      progress.maxLevels[key] = Math.max(progress.maxLevels[key] || 0, value);
      progress.uses[key] = Math.min(Number.MAX_SAFE_INTEGER, (progress.uses[key] || 0) + 1);
    }
  }
  result.settled = true;
  if (match.phase !== 'won') return result;
  result.medals =
    1 +
    Number(match.sides[0].crystalHp / match.sides[0].maxCrystalHp >= level.medals.health) +
    Number(match.tick / TICK_RATE <= level.medals.seconds);
  progress.medals[level.id] = Math.max(progress.medals[level.id] || 0, result.medals);
  result.unlocks = level.unlocks.filter((id) => !progress.unlockedIds.includes(id));
  progress.unlockedLevel = Math.max(
    progress.unlockedLevel,
    Math.min(LEVELS.length, level.number + 1),
  );
  progress.unlockedIds = CATALOG.filter((s) => s.unlock < progress.unlockedLevel).map((s) => s.id);
  return result;
}
