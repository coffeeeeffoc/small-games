import { TRACK_RADIUS, type Level, type Point, type Rect } from './levels';
export const GEOMETRY = { sampleDistance: 7, maxPoints: 200, maxInputPoints: 1600, snap: 30, minY: 130, maxY: 500 };
export const distance = (a: Point, b: Point): number => Math.hypot(a.x-b.x, a.y-b.y);
export const length = (points: Point[]): number => points.slice(1).reduce((sum, b, i) => sum + distance(points[i], b), 0);
export function pointSegment(p: Point, a: Point, b: Point): number {
  const dx=b.x-a.x, dy=b.y-a.y, t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy || 1)));
  return distance(p,{x:a.x+t*dx,y:a.y+t*dy});
}
function cross(a: Point,b: Point,c: Point): number { return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x); }
export function segmentDistance(a: Point,b: Point,c: Point,d: Point): number {
  if (cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) return 0;
  return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b));
}
function simplify(points: Point[]): Point[] {
  if (points.length<3) return points;
  let index=0, max=2;
  for (let i=1;i<points.length-1;i++) { const d=pointSegment(points[i],points[0],points.at(-1)!); if(d>max){max=d;index=i;} }
  return index ? [...simplify(points.slice(0,index+1)).slice(0,-1),...simplify(points.slice(index))] : [points[0],points.at(-1)!];
}
export function processStroke(raw: Point[]): Point[] {
  const clean=raw.filter((p,i)=>i===0 || distance(p,raw[i-1])>0.5);
  const simple=simplify(clean);
  if(simple.length<3) return simple;
  // One corner-cutting pass. Rendering, collision, budget and score all consume this result.
  const smooth: Point[]=[simple[0]];
  for(let i=0;i<simple.length-1;i++) {
    const a=simple[i],b=simple[i+1];
    smooth.push({x:a.x*.75+b.x*.25,y:a.y*.75+b.y*.25},{x:a.x*.25+b.x*.75,y:a.y*.25+b.y*.75});
  }
  smooth.push(simple.at(-1)!);
  return simplify(smooth);
}
function hitsRect(a: Point,b: Point,r: Rect): boolean {
  const pad=TRACK_RADIUS+1, x=r.x-pad,y=r.y-pad,w=r.w+2*pad,h=r.h+2*pad;
  const inside=(p: Point)=>p.x>=x&&p.x<=x+w&&p.y>=y&&p.y<=y+h;
  if(inside(a)||inside(b)) return true;
  const corners=[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
  return corners.some((p,i)=>segmentDistance(a,b,p,corners[(i+1)%4])<0.01);
}
export type Validation = { ok: boolean; reason: string; points: Point[]; usedInk: number };
export function validateGeometry(points: Point[],level: Level): Validation {
  const usedInk=length(points), result=(reason: string): Validation=>({ok:!reason,reason,points,usedInk});
  if(points.length<2||usedInk<35) return result('线条太短：请从起点连续画到终点。');
  if(points.length>GEOMETRY.maxPoints) return result('折点太多：请画得平顺一些（最多 200 点）。');
  if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))) return result('笔画数据无效，请重新画线。');
  if(distance(points[0],level.start)>0.1||distance(points.at(-1)!,level.end)>0.1) return result('还没连到终点：松手前请进入右侧圆环。');
  if(usedInk>level.inkBudget) return result(`墨水不足：超出 ${Math.ceil(usedInk-level.inkBudget)}，请减少绕路。`);
  if(points.some(p=>p.x<155||p.x>955||p.y<GEOMETRY.minY||p.y>GEOMETRY.maxY)) return result('超出绘制区域：请在虚线框内画线。');
  // ponytail: O(n²) segment checks are bounded by 200 points; use a spatial index only for larger editors.
  const cumulative=[0];
  for(let i=1;i<points.length;i++) cumulative.push(cumulative[i-1]+distance(points[i-1],points[i]));
  for(let i=0;i<points.length-1;i++) {
    if(level.challenges.some(c=>c.kind==='key'&&hitsRect(points[i],points[i+1],c.noInk))) return result('金色悬空区不能画线：请在下方搭坡，让小球跳进去取钥匙。');
    if(level.solids.some(r=>hitsRect(points[i],points[i+1],r))) return result('线条穿过实体障碍：请绕开灰色砖块。');
    if(level.hazards.some(r=>hitsRect(points[i],points[i+1],r))) return result('线条碰到尖刺：请从危险区外绕过。');
    for(let j=i+2;j<points.length-1;j++) {
      const d=segmentDistance(points[i],points[i+1],points[j],points[j+1]);
      if(d<0.01) return result('线条自交或折返重叠：请清空后重新画一笔。');
      if(cumulative[j]-cumulative[i+1]>40 && d<TRACK_RADIUS*2+6) return result('两段线靠得太近：请留出至少 18 的间距。');
    }
  }
  return result('');
}
export function finishStroke(raw: Point[],level: Level): Validation {
  if(raw.length>GEOMETRY.maxInputPoints || raw.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))
    return {ok:false,reason:'笔画数据无效或采样点过多，请重新画线。',points:[],usedInk:0};
  let points=raw.map(p=>({...p}));
  // Collapse samples inside the anchor disks before checking bounds. CSS pixel rounding
  // and a finger finishing just beyond the anchor must not invalidate an otherwise valid line.
  if(points.length && distance(points[0],level.start)<=GEOMETRY.snap){
    let first=0;while(first<points.length-1&&distance(points[first+1],level.start)<=GEOMETRY.snap)first++;
    points=points.slice(first);points[0]={...level.start};
  }
  if(points.length>1 && distance(points.at(-1)!,level.end)<=GEOMETRY.snap){
    let last=points.length-1;while(last>1&&distance(points[last-1],level.end)<=GEOMETRY.snap)last--;
    points=points.slice(0,last+1);points[last]={...level.end};
  }
  if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<155||p.x>955||p.y<GEOMETRY.minY||p.y>GEOMETRY.maxY))
    return {ok:false,reason:'超出绘制区域：请在虚线框内画线。',points,usedInk:length(points)};
  return validateGeometry(processStroke(points),level);
}
export function clientToWorld(x: number,y: number,rect: Pick<DOMRect,'left'|'top'|'width'|'height'>): Point {
  return {x:(x-rect.left)*1100/rect.width,y:(y-rect.top)*560/rect.height};
}
