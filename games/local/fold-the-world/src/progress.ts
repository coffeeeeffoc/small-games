import { TEXT } from './strings';
import { levels } from './levels';
export interface Progress { unlocked: number; best: Record<string, number>; muted: boolean }
export const freshProgress = (): Progress => ({unlocked:1,best:{},muted:false});
export const legacyStorageKey = 'fold-the-world-v1';
const unchanged: Record<string,number> = {1:1,3:4,4:2,6:3,7:6,8:7,9:11};
const completionTargets: Record<string,number> = {...unchanged,10:16,11:13,12:18,13:21,14:14,15:25,16:23};
function parseProgress(value: string | null, count: number): Progress | null {
  try {
    const raw: unknown = JSON.parse(value ?? 'null');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const data = raw as Record<string,unknown>, best: Record<string,number> = {};
    if (data.best && typeof data.best === 'object' && !Array.isArray(data.best)) for (const [k,v] of Object.entries(data.best)) {
      if (/^[1-9]\d*$/.test(k) && Number(k)<=count && typeof v === 'number' && Number.isInteger(v) && v>=0 && v<=10000) best[k]=v;
    }
    const saved=typeof data.unlocked==='number' && Number.isInteger(data.unlocked) && data.unlocked>=1 && data.unlocked<=count ? data.unlocked : 1;
    return {unlocked:Math.min(count,Math.max(saved,...Object.keys(best).map(k=>Number(k)+1))),best,muted:data.muted===true};
  } catch { return null; }
}
export function readProgress(storage: Pick<Storage,'getItem'>, onMigration?: (progress: Progress)=>void): Progress {
  let current: Progress | null, legacy: Progress | null;
  try {
    current=parseProgress(storage.getItem(TEXT.storageKey),levels.length);
    if(current)return current;
    legacy=parseProgress(storage.getItem(legacyStorageKey),16);
  } catch { return freshProgress(); }
  if(!legacy)return freshProgress();
  const migrated: Progress={unlocked:legacy.unlocked,best:{},muted:legacy.muted};
  for(const [old,folds] of Object.entries(legacy.best)){
    if(unchanged[old])migrated.best[String(unchanged[old])]=folds;
    if(completionTargets[old])migrated.unlocked=Math.max(migrated.unlocked,completionTargets[old]+(unchanged[old]?1:0));
    if(old==='16')migrated.unlocked=Math.max(migrated.unlocked,26);
  }
  migrated.unlocked=Math.min(levels.length,migrated.unlocked);
  onMigration?.(migrated);
  return migrated;
}
export function saveProgress(storage: Pick<Storage,'setItem'>, progress: Progress): boolean {
  try { storage.setItem(TEXT.storageKey,JSON.stringify(progress)); return true; } catch { return false; }
}
export function recordWin(progress: Progress, index: number, folds: number): void {
  progress.unlocked = Math.max(progress.unlocked,Math.min(levels.length,index+2));
  const key = String(index+1);
  progress.best[key] = Math.min(progress.best[key] ?? Infinity,folds);
}
