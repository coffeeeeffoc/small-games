import { CRAFTS, MISSIONS } from './content.ts';
import type { CraftId } from './content.ts';
import type { State } from './rules.ts';
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export type Completion = { best: number; medal: number; time: number };
export type Progress = {
  version: 2;
  best: number;
  muted: boolean;
  reduced: boolean;
  sensitivity: number;
  selectedCraft: CraftId;
  completed: Record<string, Completion>;
};
const key = 'nullrange-progress-v1';
const score = (v: unknown) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 10000000 ? v : 0;
const defaults = (): Progress => ({
  version: 2,
  best: 0,
  muted: false,
  reduced: false,
  sensitivity: 1,
  selectedCraft: 'falcon',
  completed: {},
});
export const missionUnlocked = (p: Progress, id: string) => {
  const i = MISSIONS.findIndex((m) => m.id === id);
  return i === 0 || (i > 0 && !!p.completed[MISSIONS[i - 1].id]);
};
export const craftUnlocked = (p: Progress, id: string) => {
  const c = CRAFTS.find((c) => c.id === id);
  return !!c && (!c.unlock || !!p.completed[c.unlock]);
};
export const rating = (s: State) =>
  s.status === 'won'
    ? 1 + Number(s.player.hull / s.craft.hull >= 0.5) + Number(s.player.hull / s.craft.hull >= 0.8)
    : 0;
const validRecord = (r: Completion | undefined, limit: number): r is Completion =>
  !!r &&
  [1, 2, 3].includes(r.medal) &&
  Number.isSafeInteger(r.time) &&
  r.time > 0 &&
  r.time <= limit * 60 &&
  score(r.best) === r.best;
function load(storage?: StoragePort, p = defaults()) {
  p.best = score(Number(storage?.getItem('nullrange-cn-best')));
  p.muted = storage?.getItem('nullrange-cn-muted') === 'true';
  const data = JSON.parse(storage?.getItem(key) ?? 'null');
  if (data?.version === 1 || data?.version === 2) {
    p.best = Math.max(p.best, score(data.best));
    if (typeof data.muted === 'boolean') p.muted = data.muted;
    if (typeof data.reduced === 'boolean') p.reduced = data.reduced;
    if ([0.7, 1, 1.3].includes(data.sensitivity)) p.sensitivity = data.sensitivity;
    if (data.version === 2) {
      for (const m of MISSIONS) {
        const r = Object.hasOwn(data.completed || {}, m.id) ? data.completed[m.id] : null;
        if (validRecord(r, m.timeLimit))
          p.completed[m.id] = { best: r.best, medal: r.medal, time: r.time };
      }
      if (craftUnlocked(p, data.selectedCraft)) p.selectedCraft = data.selectedCraft;
    }
  }
  return { progress: p, data };
}
export function readProgress(storage?: StoragePort): Progress {
  const p = defaults();
  try {
    load(storage, p);
  } catch {}
  return p;
}
function mergeRecord(a: Completion | undefined, b: Completion): Completion {
  return a
    ? {
        best: Math.max(a.best, b.best),
        medal: Math.max(a.medal, b.medal),
        time: Math.min(a.time, b.time),
      }
    : { ...b };
}
export function saveProgress(
  storage: StoragePort | undefined,
  p: Progress,
  field: 'best' | 'muted' | 'reduced' | 'sensitivity' | 'selectedCraft' | 'completed',
  missionId?: string,
) {
  if (!storage) return false;
  try {
    const { progress: latest, data } = load(storage);
    if (data !== null && data.version !== 1 && data.version !== 2) return false;
    // Flush valid in-memory wins in unlock order after a transient storage failure.
    for (const m of MISSIONS) {
      const r = p.completed?.[m.id];
      if (missionUnlocked(latest, m.id) && validRecord(r, m.timeLimit)) {
        latest.completed[m.id] = mergeRecord(latest.completed[m.id], r);
        latest.best = Math.max(latest.best, r.best);
      }
    }
    if (field === 'best') latest.best = Math.max(latest.best, score(p.best));
    else if ((field === 'muted' || field === 'reduced') && typeof p[field] === 'boolean')
      latest[field] = p[field];
    else if (field === 'sensitivity' && [0.7, 1, 1.3].includes(p.sensitivity))
      latest.sensitivity = p.sensitivity;
    else if (field === 'selectedCraft' && craftUnlocked(latest, p.selectedCraft))
      latest.selectedCraft = p.selectedCraft;
    else if (
      field === 'completed' &&
      missionId &&
      MISSIONS.some((m) => m.id === missionId) &&
      missionUnlocked(latest, missionId)
    ) {
      const r = p.completed[missionId],
        m = MISSIONS.find((m) => m.id === missionId)!;
      if (!validRecord(r, m.timeLimit)) return false;
    } else return false;
    storage.setItem(key, JSON.stringify(latest));
    Object.assign(p, latest);
    return true;
  } catch {
    return false;
  }
}
export function recordVictory(
  storage: StoragePort | undefined,
  p: Progress,
  s: State,
  practice: boolean,
) {
  if (practice || s.status !== 'won' || s.tick <= 0 || !missionUnlocked(p, s.mission.id))
    return false;
  const r = { best: score(s.score), medal: rating(s), time: s.tick };
  p.completed[s.mission.id] = mergeRecord(p.completed[s.mission.id], r);
  p.best = Math.max(p.best, r.best);
  // Memory progress survives unavailable storage; a failed read never overwrites stored bytes.
  saveProgress(storage, p, 'completed', s.mission.id);
  return true;
}
