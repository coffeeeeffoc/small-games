import { SAFE_BAND, type Fold, type Level, type Rect } from './geometry';

export const SWIPE_START=10, SWIPE_COMMIT=60; // CSS pixels, independent of canvas scale.
export function blankPaper(x:number,y:number,world:readonly Rect[],body:Rect):boolean {
  return ![body,...world].some(r=>x>=r.x-6&&x<=r.x+r.w+6&&y>=r.y-6&&y<=r.y+r.h+6);
}
// Prefer the chosen crease. The opposite side can select its allowed direction
// directly; a gesture never invents a crease or creates a second fold.
export function gestureTarget(level:Level,selected:Fold,fold:Fold|null,x:number,dx:number,dy:number):{target:Fold|null;sign:number}|null {
  if(Math.abs(dx)<SWIPE_START||Math.abs(dx)<Math.abs(dy)*1.5)return null;
  const sign=Math.sign(dx);
  if(fold)return {target:null,sign};
  const direction=sign>0?'left-to-right':'right-to-left';
  const choices=level.creases.filter(c=>c.directions.includes(direction)&&(sign>0?x<c.x-SAFE_BAND:x>c.x+SAFE_BAND));
  choices.sort((a,b)=>Number(b.id===selected.crease)-Number(a.id===selected.crease)||Math.abs(a.x-x)-Math.abs(b.x-x));
  return choices[0]?{target:{crease:choices[0].id,direction},sign}:null;
}
export const swipeProgress=(dx:number,sign:number):number=>Math.max(0,Math.min(1,dx*sign/(SWIPE_COMMIT*2)));
