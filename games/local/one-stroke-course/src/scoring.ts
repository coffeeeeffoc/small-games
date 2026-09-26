import type { Level } from './levels';
export const clamp01=(x: number): number=>Math.min(1,Math.max(0,x));
export type Score = { base: number; stars: number; ink: number; time: number; total: number };
export function scoreRun(level: Level,stars: number,usedInk: number,runTime: number): Score {
  if(!(level.inkBudget>level.parInk&&level.slowTime>level.parTime)) throw new Error('评分参数无效');
  if(![stars,usedInk,runTime].every(Number.isFinite)||!Number.isInteger(stars)||stars<0||stars>3||usedInk<0||runTime<0) throw new Error('成绩数据无效');
  const ink=Math.round(10*clamp01((level.inkBudget-usedInk)/(level.inkBudget-level.parInk)));
  const time=Math.round(10*clamp01((level.slowTime-runTime)/(level.slowTime-level.parTime)));
  return {base:50,stars:stars*10,ink,time,total:50+stars*10+ink+time};
}
export function advice(stars: number,usedInk: number,seconds: number,level: Level): string {
  const notes: string[]=[];
  if(stars<3) notes.push(`还有 ${3-stars} 颗星星没拿到，可以调整高度或起跳`);
  if(usedInk>level.parInk) notes.push(`墨水比参考目标多 ${Math.ceil(usedInk-level.parInk)}，试着拉直多余弯路`);
  if(seconds>level.parTime) notes.push(`比目标时间慢 ${(seconds-level.parTime).toFixed(1)} 秒，缓坡更容易保持速度`);
  return notes.join('；') || '本次已拿齐星星，并达到墨水和时间目标。试试另一种画法？';
}
