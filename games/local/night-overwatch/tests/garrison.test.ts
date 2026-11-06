import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, type Shot } from '../assets/scripts/core/Simulation.ts';
import { MISSIONS } from '../assets/scripts/core/MissionCatalog.ts';
import { UNITS, WEAPONS, MISSION, garrisonPoints, landPoint } from '../assets/scripts/core/Data.ts';
import { createDuel, viewDuel } from '../assets/scripts/core/Duel.ts';

function scene(height=(x:number,_z:number)=>0){
  const sim=new Simulation('training-60');sim.duelMode=true;sim.phase='playing';sim.units=[];sim.height=height;return sim;
}
function shot(id=1,y=.42):Shot{return {id,weapon:0,born:0,due:1,origin:{x:0,y,z:0},velocity:{x:180,y:0,z:0},x:180,z:0,targetY:0,side:0};}
test('garrisons retain armor, stand still and expose symmetric duel formations',()=>{
  assert.deepEqual(MISSIONS.slice(0,3).map(m=>m.events.filter(e=>e.kind==='infantry').length),[12,18,24]);
  assert.equal(MISSIONS.at(-1)!.events.filter(e=>e.kind==='infantry').length,48);
  assert.equal(MISSIONS.at(-1)!.events.filter(e=>e.kind!=='infantry').length,96);
  assert.equal(UNITS.infantry.speed,0);assert.equal(WEAPONS[0].speed,180);assert.equal(WEAPONS[0].damage,8);assert.equal(WEAPONS[0].radius,.5);
  const duel=createDuel(7),view=viewDuel(duel,0).simulation;
  for(const group of [0,1]){const units=view.units.filter(u=>u.group===group);assert.equal(units.length,32);assert.equal(units.filter(u=>u.kind==='infantry').length,24);}
});
test('rapid sweeps hit upper torso before the aim point, preserve terrain and nearest-body ordering',()=>{
  for(const mode of ['torso','friendly','hill','two']){
    const sim=scene(mode==='hill'?(x)=>x>=.7?2:0:undefined);
    const first=sim.addUnit('infantry',{x:1.5,z:0},mode==='friendly');first.group=mode==='friendly'?0:1;first.attack=1000;
    const second=sim.addUnit('infantry',{x:2.6,z:0});second.group=1;second.attack=1000;
    sim.shots=[shot()];sim.step(1/60);
    assert.equal(first.hp,mode==='hill'?16:8,mode);assert.equal(second.hp,16,mode);
    assert.equal(sim.shots.length,0);assert.equal(sim.events.filter(e=>e.type==='impact').length,1);
    if(mode==='friendly')assert.equal(sim.friendlyDamage,8);
  }
});
test('a later round in the same tick passes a body already killed by the first round',()=>{
  const sim=scene(),first=sim.addUnit('infantry',{x:1,z:0}),second=sim.addUnit('infantry',{x:2,z:0});
  first.group=second.group=1;first.hp=8;first.attack=second.attack=1000;
  sim.shots=[shot(1),shot(2)];sim.step(1/60);
  assert.equal(first.hp,0);assert.equal(second.hp,8);assert.equal(sim.shots.length,0);assert.equal(sim.hitShots,2);
});


test('shared garrison deployment preserves every solo and duel coordinate used for scenery clearance',()=>{
 const points=garrisonPoints(48);
 for(const [i,p]of points.entries()){const anchor=MISSION.events[[0,5,13,17][i%4]],rank=Math.floor(i/4);assert.deepEqual(p,{x:anchor.x+(rank%3-1)*2.2,z:anchor.z+4+Math.floor(rank/3)*2.2});}
 for(const mission of MISSIONS){const events=mission.events.filter(e=>e.kind==='infantry');assert.deepEqual(events.map(({x,z})=>({x,z})),points.slice(0,events.length));}
 for(const map of ['valley','highland'] as const){
  const mission=MISSIONS.find(m=>m.map===map)!,sim=new Simulation(mission.id);sim.start();assert.deepEqual(sim.units.filter(u=>u.kind==='infantry').map(({x,z})=>({x,z})),points.slice(0,mission.events.filter(e=>e.kind==='infantry').length).map(p=>landPoint(p,map)));
  const duel=viewDuel(createDuel(map==='valley'?2:1),0).simulation;
  for(const side of [0,1]){const expected=Array.from({length:24},(_,i)=>{const sign=side===0?-1:1,sector=i%4,rank=Math.floor(i/4);return {x:(48+(sector%2)*44+(rank%3-1)*2.2)*sign,z:(-45+Math.floor(sector/2)*90+Math.floor(rank/3)*2.2)*sign};});assert.deepEqual(garrisonPoints(24,side),expected);assert.deepEqual(duel.units.filter(u=>u.kind==='infantry'&&u.group===side).map(({x,z})=>({x,z})),expected);}
 }
});
