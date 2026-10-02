export const SIZE = 720, CX = 360, CY = 360, TICKS = 1200, HZ = 60;
export const SPEED = 170, INNER = 180, OUTER = 322, HOLD = 33;
export const LEVELS = [
  { name:'留给下一次', subtitle:'你破盾，下一个你进攻', seals:[Math.PI], core:0, width:50, hp:40, waves:['outer','inner','outer'] },
  { name:'两边同时', subtitle:'让两侧火力在同一时刻相遇', seals:[Math.PI,0], core:Math.PI/2, width:27, hp:40, waves:['inner','outer','inner'] },
  { name:'四人一瞬', subtitle:'三个过去破盾，现在的你终结', seals:[Math.PI,-Math.PI/2,0], core:Math.PI/2, width:25, hp:40, waves:['outer','inner','outer'], cross:true },
];
export const DIRECTIONS = ['东','南','西','北'];
export const angleDelta = (a,b) => Math.atan2(Math.sin(a-b), Math.cos(a-b));
export const directionName = angle => DIRECTIONS[(Math.round(angle/(Math.PI/2))+4)%4];
export function normalizeInput(x=0,y=0,fire=false) {
  x = Number.isFinite(x) ? x : 0; y = Number.isFinite(y) ? y : 0;
  const n = Math.max(1, Math.hypot(x,y));
  return [Math.round(x/n*127), Math.round(y/n*127), fire ? 1 : 0];
}
export const idle = Object.freeze([0,0,0]);
export function createRound(level=0, recordings=[], gentle=true) {
  const actor = (id,tape) => ({ id,tape,x:CX,y:CY+285,hp:4,hurtUntil:0,nextShot:0,shots:0,trail:[] });
  return { level,gentle,tick:0,hp:LEVELS[level].hp,seals:LEVELS[level].seals.map(()=>0),contributors:[],
    actors:[...recordings.map(r=>actor(r.id,r.inputs)),actor(3,null)],
    input:[], events:[], status:'playing', damage:0, missing:'',trace:[], lastHit:-100 };
}
export function hazards(s, tick=s.tick) {
  const spec = LEVELS[s.level], warn = s.gentle ? 120 : 96;
  const waves = [300,630,960].map((start,i)=>({ type:spec.waves[i], start,end:start+170, warn:start-warn }));
  if (spec.cross) waves.push({type:'cross',start:510,end:568,warn:510-warn});
  return waves.filter(h=>tick>=h.warn && tick<h.end).map(h=>({...h,active:tick>=h.start}));
}
export function inHazard(a,h) {
  const r = Math.hypot(a.x-CX,a.y-CY);
  if (h.type==='outer') return r>=245;
  if (h.type==='inner') return r<=265;
  return Math.min(Math.abs(a.x-CX),Math.abs(a.y-CY))<26;
}
export function sector(s,a) {
  const l=LEVELS[s.level], angle=Math.atan2(a.y-CY,a.x-CX), width=l.width*Math.PI/180;
  const seal=l.seals.findIndex(v=>Math.abs(angleDelta(angle,v))<=width);
  if(seal>=0) return {kind:'seal',index:seal};
  if(Math.abs(angleDelta(angle,l.core))<=width) return {kind:'core'};
  return {kind:'armor'};
}
function stepActor(s,a,command) {
  if(a.hp<=0) return false;
  const [ix,iy,fire]=command, n=Math.max(127,Math.hypot(ix,iy));
  a.x+=ix/n*SPEED/HZ; a.y+=iy/n*SPEED/HZ;
  const dx=a.x-CX,dy=a.y-CY,r=Math.hypot(dx,dy),clamped=Math.max(INNER,Math.min(OUTER,r));
  if(r!==clamped){ a.x=CX+dx/r*clamped; a.y=CY+dy/r*clamped; }
  // Same arithmetic and rounding for live input and every recorded actor.
  a.x=Math.round(a.x*1e6)/1e6; a.y=Math.round(a.y*1e6)/1e6;
  if(s.tick%4===0){a.trail.push([a.x,a.y]);if(a.trail.length>15)a.trail.shift();}
  const danger=hazards(s).find(h=>h.active && inHazard(a,h));
  if(danger && s.tick>=a.hurtUntil){
    a.hp--; a.hurtUntil=s.tick+(s.gentle?45:36);
    s.events.push({type:'hurt',id:a.id,cause:danger.type});
  }
  if(a.hp>0 && fire && s.tick>=a.nextShot){a.nextShot=s.tick+15;a.shots++;return true;}
  return false;
}
export function step(s, command=idle) {
  if(s.status!=='playing') return s;
  s.events=[];
  const safe=Array.isArray(command)&&command.length===3 ? command.map((v,i)=>i===2?(v?1:0):Math.round(Math.max(-127,Math.min(127,Number(v)||0)))) : idle;
  s.input.push([...safe]);
  const shots=[];
  for(const a of s.actors){
    const input=a.tape ? (a.tape[s.tick]||idle) : safe;
    if(stepActor(s,a,input)) shots.push({a,hit:sector(s,a)});
  }
  // Resolve all seal hits before core hits: actor array order cannot change cooperation.
  for(const {a,hit} of shots){
    if(hit.kind==='seal'){s.seals[hit.index]=s.tick+HOLD;s.contributors[hit.index]=a.id;}
  }
  const open=s.tick>=240 && s.seals.every(t=>t>s.tick);
  s.missing=LEVELS[s.level].seals.filter((_,i)=>s.seals[i]<=s.tick).map(directionName).join('、');
  for(const {a,hit} of shots){
    const damage=hit.kind==='core' && open;
    if(damage){s.hp=Math.max(0,s.hp-1);s.damage++;s.lastHit=s.tick;}
    s.events.push({type:'shot',id:a.id,x:a.x,y:a.y,kind:damage?'core':hit.kind==='core'?'blocked':hit.kind,index:hit.index});
  }
  const live=s.actors.at(-1);
  s.trace.push([live.x,live.y,live.hp,live.nextShot,live.hurtUntil]);
  s.tick++;
  if(s.hp<=0) s.status='won';
  else if(live.hp<=0) s.status='lost';
  else if(s.tick>=TICKS) s.status='timeout';
  return s;
}
export function finishRecording(s,bank,replace=null) {
  if(s.status!=='timeout') return bank;
  if(replace===null && bank.length>=LEVELS[s.level].seals.length) return bank;
  const id=replace===null?Array.from({length:3},(_,i)=>i).find(i=>!bank.some(r=>r.id===i)):replace;
  const record={id,inputs:s.input.map(v=>[...v]),trace:s.trace.map(v=>[...v])};
  return [...bank.filter(r=>r.id!==id),record].sort((a,b)=>a.id-b.id);
}
export function replayDigest(a){ return [a.x,a.y,a.hp,a.nextShot,a.hurtUntil,a.shots]; }
