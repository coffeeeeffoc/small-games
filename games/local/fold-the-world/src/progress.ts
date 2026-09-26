import { TEXT } from './strings';
import { levels } from './levels';
export interface Progress { unlocked: number; best: Record<string, number>; muted: boolean }
export const freshProgress = (): Progress => ({unlocked:1,best:{},muted:false});
export function readProgress(storage: Pick<Storage,'getItem'>): Progress {
  try {
    const raw: unknown = JSON.parse(storage.getItem(TEXT.storageKey) ?? 'null');
    if (!raw || typeof raw !== 'object') return freshProgress();
    const data = raw as Record<string,unknown>, best: Record<string,number> = {};
    if (data.best && typeof data.best === 'object') for (const [k,v] of Object.entries(data.best)) {
      if (/^[1-9]\d*$/.test(k) && Number(k)<=levels.length && typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10000) best[k] = v;
    }
    const saved=typeof data.unlocked === 'number' && Number.isInteger(data.unlocked)?data.unlocked:1;
    return {unlocked:Math.min(levels.length,Math.max(1,saved,...Object.keys(best).map(k=>Number(k)+1))),best,muted:data.muted===true};
  } catch { return freshProgress(); }
}
export function saveProgress(storage: Pick<Storage,'setItem'>, progress: Progress): boolean {
  try { storage.setItem(TEXT.storageKey,JSON.stringify(progress)); return true; } catch { return false; }
}
export function recordWin(progress: Progress, index: number, folds: number): void {
  progress.unlocked = Math.max(progress.unlocked,Math.min(levels.length,index+2));
  const key = String(index+1);
  progress.best[key] = Math.min(progress.best[key] ?? Infinity,folds);
}
