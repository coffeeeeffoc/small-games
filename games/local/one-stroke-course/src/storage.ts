import { RULES_VERSION, type Level, type Point } from './levels';
import { validateGeometry } from './geometry';
export type Draft = { version: 1; templateId: string; points: Point[]; rulesVersion: string; tested: boolean; best: number | null };
export const draftKey=(id: string): string=>`one-stroke:draft:${id}`;
export function newDraft(level: Level,points: Point[]): Draft {
  return {version:1,templateId:level.id,points:points.map(p=>({...p})),rulesVersion:RULES_VERSION,tested:false,best:null};
}
export function decodeDraft(text: string,level: Level): Draft {
  const data: unknown=JSON.parse(text);
  if(!data || typeof data!=='object') throw new Error('草稿格式错误');
  const d=data as Record<string,unknown>;
  if(d.version!==1 || d.templateId!==level.id || !Array.isArray(d.points) || d.points.length>200 || !d.points.every(p=>p&&typeof p==='object'&&typeof p.x==='number'&&typeof p.y==='number')) throw new Error('草稿格式或版本不兼容');
  const points=d.points as Point[], check=validateGeometry(points,level);
  if(!check.ok) throw new Error(check.reason);
  const current=d.rulesVersion===RULES_VERSION;
  const best=current&&typeof d.best==='number'&&Number.isInteger(d.best)&&d.best>=0&&d.best<=100 ? d.best : null;
  return {...newDraft(level,points),tested:current&&d.tested===true,best};
}
export function saveDraft(draft: Draft): void { localStorage.setItem(draftKey(draft.templateId),JSON.stringify(draft)); }
export function loadDraft(level: Level): Draft | null {
  const text=localStorage.getItem(draftKey(level.id));
  return text ? decodeDraft(text,level) : null;
}
