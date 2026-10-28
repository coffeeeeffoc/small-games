export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export type Progress = {
  version: 1;
  best: number;
  muted: boolean;
  reduced: boolean;
  sensitivity: number;
};
const key = 'nullrange-progress-v1';
const score = (v: unknown) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 10000000 ? v : 0;
const defaults = (): Progress => ({
  version: 1,
  best: 0,
  muted: false,
  reduced: false,
  sensitivity: 1,
});
function load(storage?: StoragePort, p = defaults()) {
  p.best = score(Number(storage?.getItem('nullrange-cn-best')));
  p.muted = storage?.getItem('nullrange-cn-muted') === 'true';
  const data = JSON.parse(storage?.getItem(key) || 'null');
  if (data?.version === 1) {
    p.best = Math.max(p.best, score(data.best));
    if (typeof data.muted === 'boolean') p.muted = data.muted;
    if (typeof data.reduced === 'boolean') p.reduced = data.reduced;
    if ([0.7, 1, 1.3].includes(data.sensitivity)) p.sensitivity = data.sensitivity;
  }
  return { progress: p, data };
}
export function readProgress(storage?: StoragePort): Progress {
  const p = defaults();
  try {
    load(storage, p);
  } catch {
    /* Keep any validated legacy fields; writes must re-read successfully. */
  }
  return p;
}
export function saveProgress(
  storage: StoragePort | undefined,
  p: Progress,
  field: Exclude<keyof Progress, 'version'>,
) {
  if (!storage) return false;
  try {
    // Re-read at write time: stale tabs may update only the field the user actually changed.
    const { progress: latest, data } = load(storage);
    if (data && data.version !== 1) return false;
    if (field === 'best') latest.best = Math.max(latest.best, score(p.best));
    else if ((field === 'muted' || field === 'reduced') && typeof p[field] === 'boolean')
      latest[field] = p[field];
    else if (field === 'sensitivity' && [0.7, 1, 1.3].includes(p.sensitivity))
      latest.sensitivity = p.sensitivity;
    else return false;
    storage.setItem(key, JSON.stringify(latest));
    Object.assign(p, latest);
    return true;
  } catch {
    return false;
  }
}
