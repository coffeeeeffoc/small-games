import { CATALOG, getCampaignLevels, type Campaign } from './catalog.ts';
import {
  cloneState,
  createState,
  isComplete,
  isReachableRemoval,
  normalizeAngle,
  type State,
} from './rules.ts';

export const SAVE_KEY = 'orbit-atelier.v2';
export const LEGACY_SAVE_KEY = 'orbit-atelier.v1';
export type Run = { state: State; moves: number; hints: number };
export type Progress = {
  version: 2;
  medals: Record<string, number>;
  settings: { sound: boolean; vibration: boolean; reducedMotion: boolean };
  run: Run | null;
};

export function freshProgress(): Progress {
  return {
    version: 2,
    medals: {},
    settings: { sound: true, vibration: false, reducedMotion: false },
    run: null,
  };
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;

function parse(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    return object(data) ? data : null;
  } catch {
    return null;
  }
}

/** Local index within one campaign; a new campaign never erases classic achievements. */
export function unlockedIndex(progress: Progress, campaign: Campaign = 'nova'): number {
  const levels = getCampaignLevels(campaign);
  const first = levels.findIndex((level) => !progress.medals[level.id]);
  return first < 0 ? levels.length - 1 : first;
}

/** Never deserialize coordinates, locks, targets, release counts or revision from a save. */
function rebuildRun(value: unknown, legacy: boolean): Run | null {
  if (
    !object(value) ||
    !object(value.state) ||
    !integer(value.moves, 100000) ||
    !integer(value.hints, 100000)
  )
    return null;
  const savedState = value.state;
  const level = CATALOG.find((candidate) => candidate.id === savedState.levelId);
  if (!level || (legacy && level.campaign !== 'classic')) return null;
  if (!legacy && savedState.revision !== (level.revision ?? 1)) return null;
  const state = createState(level);
  if (!Array.isArray(savedState.rings) || savedState.rings.length !== state.rings.length)
    return null;
  const entries = savedState.rings;
  const removed = new Set<string>();
  for (const ring of state.rings) {
    const matches = entries.filter((entry) => object(entry) && entry.id === ring.id);
    const entry = matches[0];
    if (
      matches.length !== 1 ||
      !object(entry) ||
      typeof entry.angle !== 'number' ||
      !Number.isFinite(entry.angle) ||
      typeof entry.removed !== 'boolean'
    )
      return null;
    ring.angle = normalizeAngle(entry.angle);
    ring.removed = entry.removed;
    if (ring.removed) removed.add(ring.id);
  }
  if (value.moves < removed.size || !isReachableRemoval(level, removed)) return null;
  state.releasedCount = removed.size;
  return { state, moves: value.moves, hints: value.hints };
}

/** Accept v2 first; if unavailable, import v1 read-only. No browser storage dependency. */
export function parseProgress(rawV2: string | null, rawV1?: string | null): Progress {
  const result = freshProgress();
  let data = parse(rawV2);
  if (data?.version !== 2 && data?.version !== 1) data = parse(rawV1);
  if (!data || (data.version !== 1 && data.version !== 2)) return result;
  const legacy = data.version === 1;
  const medals = object(data.medals) ? data.medals : {};
  for (const campaign of ['nova', 'classic'] as const) {
    if (legacy && campaign === 'nova') continue;
    let gap = false;
    for (const level of getCampaignLevels(campaign)) {
      const medal = medals[level.id];
      if (!gap && integer(medal, 3) && medal > 0) result.medals[level.id] = medal;
      else gap = true;
    }
  }
  if (object(data.settings)) {
    for (const key of ['sound', 'vibration', 'reducedMotion'] as const) {
      if (typeof data.settings[key] === 'boolean') result.settings[key] = data.settings[key];
    }
  }
  const run = rebuildRun(data.run, legacy);
  if (run && !isComplete(run.state)) {
    const level = CATALOG.find((candidate) => candidate.id === run.state.levelId)!;
    const levels = getCampaignLevels(level.campaign ?? 'nova');
    if (levels.indexOf(level) <= unlockedIndex(result, level.campaign ?? 'nova')) result.run = run;
  }
  return result;
}

/** Hint use is irreversible within an attempt, including after any number of undos. */
export function restoreUndo(current: Run, before: Run): Run {
  if (current.state.levelId !== before.state.levelId)
    return { ...current, state: cloneState(current.state) };
  return {
    state: cloneState(before.state),
    moves: before.moves,
    hints: Math.max(current.hints, before.hints),
  };
}

/** One star for completion; two without hints; three for the shortest release route. */
export function settle(progress: Progress, run: Run): number {
  const valid = rebuildRun(run, false);
  if (!valid || !isComplete(valid.state)) return 0;
  const level = CATALOG.find((candidate) => candidate.id === valid.state.levelId)!;
  const campaign = level.campaign ?? 'nova';
  if (getCampaignLevels(campaign).indexOf(level) > unlockedIndex(progress, campaign)) return 0;
  const par = level.parMoves ?? level.rings.length;
  const medal = valid.hints ? 1 : valid.state.releasedCount <= par ? 3 : 2;
  progress.medals[level.id] = Math.max(progress.medals[level.id] ?? 0, medal);
  progress.run = null;
  return medal;
}
