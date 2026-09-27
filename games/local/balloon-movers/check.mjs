import assert from 'node:assert/strict';
import {createGame,launch,step,simulate,summary,LEVELS,ropePoints} from './physics.mjs';
const pulses=(at,duration,unit=.5)=>Array.from({length:Math.ceil(duration/unit)},(_,i)=>({at:at+i*unit,duration:Math.min(unit,duration-i*unit),side:i%2?'right':'left'}));
const recipes=[pulses(6,15,1),pulses(18,16,1),pulses(18,12)];
function crosses(a,b,r){let low=0,high=1;for(const axis of ['x','y']){const d=b[axis]-a[axis],min=r.bounds.min[axis]+.75,max=r.bounds.max[axis]-.75;if(Math.abs(d)<1e-9){if(a[axis]<min||a[axis]>max)return false;}else{const u=(min-a[axis])/d,v=(max-a[axis])/d;low=Math.max(low,Math.min(u,v));high=Math.min(high,Math.max(u,v));}}return high>low&&low<1&&high>0;}
let runs=0;
function run(level,setup,events=[],trace=[]){
 const s=createGame(level,setup);launch(s);let crossed=false;
 while(s.phase==='flying'){
  const t=s.tick/120;step(s,Object.fromEntries(['left','right'].map(side=>[side,events.some(e=>e.side===side&&t>=e.at&&t<e.at+e.duration)])));
  assert(Number.isFinite(s.furniture.position.x+s.furniture.position.y+s.furniture.angle),'非有限物理状态');
  for(const b of s.balloons){assert(b.gas>=0&&b.gas<=1,'气量越界');const points=ropePoints(s,b);for(let i=0;i<2;i++)for(const wall of s.walls)crossed ||= crosses(points[i],points[i+1],wall);}
  if(s.tick%120===0)trace.push([s.furniture.position.x,s.furniture.position.y,s.furniture.angle]);
 }
 assert(!crossed,`关卡 ${level+1} 绳穿窗框: ${JSON.stringify(setup)}, ${JSON.stringify(events[0])}`);runs++;return s;
}
for(let i=0;i<3;i++){const s=run(i,LEVELS[i].setup,recipes[i]);assert.equal(s.phase,'won',`第 ${i+1} 关不可解`);assert(s.settled>=120,'没有落稳');console.log(`第 ${i+1} 关送达: ${JSON.stringify(summary(s))}`);}
const main=summary(run(2,LEVELS[2].setup,recipes[2]));assert.deepEqual(summary(run(2,LEVELS[2].setup,recipes[2])),main,'重放不一致');
for(const offset of [-.15,.15])assert.equal(run(2,LEVELS[2].setup,recipes[2].map(e=>({...e,at:e.at+offset}))).phase,'won','救险容错不足');
assert.equal(run(2,LEVELS[2].setup).phase,'lost','无操作不应自动成功');
assert.equal(run(0,{...LEVELS[0].setup,left:1,right:0}).phase,'lost','一只球不应自动抬起沙发');
const alternate={...LEVELS[2].setup,left:2,right:2};assert.equal(run(2,alternate,pulses(6,12)).phase,'won','第二种绑法不可解');
const a=[],b=[];run(2,LEVELS[2].setup,recipes[2],a);run(2,{...LEVELS[2].setup,longLeft:true,longRight:true},recipes[2],b);
const ropeDifference=Math.max(...a.slice(0,Math.min(a.length,b.length)).map((p,i)=>Math.hypot(p[0]-b[i][0],p[1]-b[i][1])));assert(ropeDifference>15,'绳长没有实质轨迹影响');
const normal=simulate(2,LEVELS[2].setup,[],720),swapped=simulate(2,{...LEVELS[2].setup,left:2,right:1},[],720);assert(Math.abs(normal.furniture.angle-swapped.furniture.angle)>.14,'换绑点没有实质姿态影响');
// A small regression sweep, including mistakes: neither late venting nor a limp tether may pass through a frame.
for(let l=0;l<3;l++)for(const long of [false,true])for(const at of [0,6,12,18,24,99])run(l,{...LEVELS[l].setup,longLeft:long,longRight:long},pulses(at,16,1));
assert.throws(()=>createGame(0,{left:4,right:2}));
console.log(`PASS · ${runs} 条轨迹 · 两种绑法 · ±0.15 秒救险 · 绳长最大轨迹差 ${ropeDifference.toFixed(1)} px · 无窗框穿绳`);
