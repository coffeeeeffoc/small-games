import assert from 'node:assert/strict';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import { UNITS,WEAPONS,patrolPoint } from '../assets/scripts/core/Data.ts';

/** The same legal basic-weapon planner as missions.test. No HP, ammo, clock, spawn or damage edits. */
export function lateWaveFixture(){
 const s=new Simulation('operation-120');s.start();const pending=new Map<number,{unit:number;damage:number}>(),inputs:Array<[number,number,number,boolean]>=[];let checkpoint:any;
 const distance=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
 for(let tick=0;tick<s.mission.duration*60&&s.phase==='playing';tick++){
  const fired=s.fired;for(const id of pending.keys())if(!s.shots.some(shot=>shot.id===id))pending.delete(id);
  const friends=s.units.filter(u=>u.friendly&&u.hp>0),enemies=s.units.filter(u=>!u.friendly&&u.hp>0).sort((a,b)=>Math.min(...friends.map(f=>distance(a,f)))-Math.min(...friends.map(f=>distance(b,f))));
  for(const enemy of enemies){const inbound=Array.from(pending.values()).filter(p=>p.unit===enemy.id).reduce((n,p)=>n+p.damage,0);if(inbound>=enemy.hp-1e-6)continue;
   const gun=enemy.kind==='heavy'&&s.guns[2].ammo>0?2:enemy.kind==='light'||enemy.kind==='infantry'?0:1;s.choose(gun);let aim={x:enemy.x,z:enemy.z};const target=friends.reduce((a,b)=>distance(enemy,a)<distance(enemy,b)?a:b);
   for(let i=0;i<8;i++){const flight=s.flightTime(gun,aim);if(enemy.kind==='light')aim=patrolPoint(enemy.origin,s.time-enemy.born+flight,s.mission.map);if(enemy.kind==='heavy'){const ally=target.routeOffset===undefined?target:s.routePoint(s.progress+target.routeOffset+s.mission.speed*flight),range=distance(enemy,ally),move=Math.min(UNITS.heavy.speed*flight,Math.max(0,range-12));aim={x:enemy.x+(ally.x-enemy.x)*move/range,z:enemy.z+(ally.z-enemy.z)*move/range};}}
   s.setAim(aim);const flight=s.flightTime(gun,aim);if(friends.some(f=>distance(aim,f.routeOffset===undefined?f:s.routePoint(s.progress+f.routeOffset+s.mission.speed*flight))<=WEAPONS[gun].radius+UNITS[f.kind].radius+.1))continue;if(s.friendlyRisk||!s.fire())continue;
   pending.set(s.shots.at(-1)!.id,{unit:enemy.id,damage:WEAPONS[gun].damage*(enemy.kind==='heavy'?WEAPONS[gun].armor:1)});break;
  }
  inputs.push([s.selected,s.aim.x,s.aim.z,s.fired>fired]);s.step(1/60);assert(s.units.filter(u=>!u.friendly&&u.hp>0).length<=120);
  if(!checkpoint&&s.spawned.size===192&&s.units.filter(u=>!u.friendly&&u.hp<=0).length>=70)checkpoint={ticks:inputs.length,time:s.time,spawned:s.spawned.size,dead:s.units.filter(u=>!u.friendly&&u.hp<=0).length,units:s.units.map(u=>({id:u.id,hp:u.hp,x:u.x,z:u.z}))};
 }
 assert.equal(s.phase,'success');assert.equal(s.friendlyDamage,0);assert.equal(s.friendlyLosses,0);assert.equal(s.spawned.size,192);assert(checkpoint);
 return {inputs:inputs.slice(0,checkpoint.ticks),checkpoint,complete:{phase:s.phase,time:s.time,kills:s.kills,friendlyDamage:s.friendlyDamage,friendlyLosses:s.friendlyLosses,spawned:s.spawned.size}};
}
