import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import { GROWTH_VERSION } from '../assets/scripts/core/Progression.ts';
import { LASER, PROTECTED, WEAPONS } from '../assets/scripts/core/Data.ts';
import { createDuel,configureDuel,commandDuel,advanceDuel,viewDuel } from '../assets/scripts/core/Duel.ts';
import { applyNightReplay } from '../assets/scripts/core/Replay.ts';
const loadout={version:GROWTH_VERSION,level:1,effects:['laser'] as ['laser'],skipped:[]};
function setup(kind:'heavy'|'turret'='turret'){
 const sim=new Simulation('training-60');sim.applyLoadout(loadout);sim.start();sim.convoy='holding';
 sim.units=sim.units.filter(u=>u.friendly);const target=sim.addUnit(kind,{x:-80,z:-40});target.hp=target.maxHp=1000;target.attack=999;
 Object.assign(sim.aircraft,{x:-80,z:-40,y:100});sim.choose(5);sim.setAim(target);assert(sim.fire());return {sim,target};
}
const near=(a:number,b:number)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('laser spends one shot and deals a bounded 3 second budget across dt, pauses and checkpoints',()=>{
 for(const kind of ['turret','heavy'] as const)for(const dt of [.1,1/60]){
  let {sim,target}=setup(kind);assert.equal(target.hp,1000);assert.equal(sim.guns[5].ammo,5);assert.equal(sim.guns[5].cooldownTotal,8);assert(!sim.fire());
  for(let i=0;i<Math.round(1/dt);i++)sim.step(dt);near(target.hp,1000-80*(kind==='heavy'?.85:1));
  sim.pause('manual',true);const checkpoint=sim.checkpoint();sim.step(.1);assert.deepEqual(sim.checkpoint(),checkpoint);sim.pause('manual',false);
  sim=Simulation.restore(sim.checkpoint());target=sim.units.find(u=>u.id===target.id)!;
  for(let i=0;i<Math.round(3/dt);i++)sim.step(dt);
  near(target.hp,1000-LASER.dps*LASER.duration*(kind==='heavy'?.85:1));assert.equal(sim.lasers.length,0);assert.equal(sim.hitShots,1);assert.equal(sim.hits,1);assert.equal(sim.fired,1);assert.equal(sim.ammoSpent,1);
 }
});
test('target loss, protected areas, range and terrain interrupt permanently without retargeting',()=>{
 for(const reason of ['death','protected','outside','range','terrain']){
  const {sim,target}=setup();sim.step(.1);const other=sim.addUnit('turret',{x:-82,z:-42}),hp=target.hp,otherHp=other.hp;
  if(reason==='death')target.hp=0;
  if(reason==='protected')Object.assign(target,PROTECTED[0]);
  if(reason==='outside')target.x=900;
  if(reason==='range'){(sim as any).flight.step=()=>{};Object.assign(sim.aircraft,{x:900,z:900});}
  if(reason==='terrain')sim.height=()=>1000;
  sim.setAim(other);sim.step(.1);assert.equal(sim.lasers.length,0,reason);if(reason!=='death')assert.equal(target.hp,hp);assert.equal(other.hp,otherHp);
  sim.height=()=>0;sim.step(.1);assert.equal(other.hp,otherHp);
 }
});
test('a full laser kills fixed early heavy armor and replay recovery cannot renew the budget',()=>{
 const {sim,target}=setup('heavy');target.hp=180;for(let i=0;i<27;i++)sim.step(.1);assert.equal(target.hp,0);assert.equal(sim.kills,1);
 const a=setup(),state={simulation:a.sim.checkpoint(),assisted:false};
 applyNightReplay(state,[{input:{},ticks:120}]);const saved=structuredClone(state);
 applyNightReplay(state,[{input:{},ticks:360}]);applyNightReplay(saved,[{input:{},ticks:240},{input:{},ticks:120}]);
 assert.deepEqual(state,saved);near(state.simulation.units.find(u=>u.id===a.target.id)!.hp,760);assert.equal(state.simulation.hitShots,1);
});
test('both duel pilots retain separate muzzles, damage budgets and hit ownership, settled once globally',()=>{
 const state=configureDuel(createDuel(12),[loadout,loadout]);
 const targets=[state.simulation.units.find(u=>u.group===1&&u.kind==='turret')!,state.simulation.units.find(u=>u.group===0&&u.kind==='heavy')!];
 for(const unit of state.simulation.units)unit.attack=999;for(const unit of targets)unit.hp=unit.maxHp=1000;
 for(let side=0;side<2;side++){
  const unit=targets[side];Object.assign(state.pilots[side].flight.aircraft,{x:unit.x,z:unit.z,y:100});
  commandDuel(state,side,[{command:'choose',args:[5]},{command:'setAim',args:[{x:unit.x,z:unit.z}]},{command:'fire',args:[]}]);
 }
 assert.equal(state.simulation.lasers.length,2);const origins=state.simulation.lasers.map(b=>({...b.origin}));advanceDuel(state,1000);
 near(state.simulation.units.find(u=>u.id===targets[0].id)!.hp,920);near(state.simulation.units.find(u=>u.id===targets[1].id)!.hp,932);
 for(let side=0;side<2;side++){const v=viewDuel(state,side).simulation;assert.equal(v.hitShots,1);assert.equal(v.hits,1);assert.equal(v.fired,1);assert.equal(state.pilots[side].guns[5].ammo,5);assert.notDeepEqual(state.simulation.lasers.find(b=>b.side===side)!.origin,origins[side]);}
 const copy=structuredClone(state);advanceDuel(state,3500);advanceDuel(copy,2000);advanceDuel(copy,3500);assert.deepEqual(state,copy);
 near(state.simulation.units.find(u=>u.id===targets[0].id)!.hp,760);near(state.simulation.units.find(u=>u.id===targets[1].id)!.hp,796);
});
test('cooldown metadata follows the actual cadence, overheat recovery and legacy snapshots',()=>{
 const sim=new Simulation('training-60');sim.applyLoadout({...loadout,level:15,effects:['rate','laser']});sim.start();sim.choose(0);sim.setAim({x:-80,z:-40});assert(sim.fire());
 near(sim.guns[0].cooldownTotal,WEAPONS[0].interval*.88*.95);assert.equal(sim.weaponReadiness().ratio,1);sim.guns[0].cooldown=.001;assert.equal(sim.weaponReadiness().displaySeconds,.1);
 Object.assign(sim.guns[0],{cooldown:.1,heat:94,overheated:true});near(sim.weaponReadiness().remaining,3);
 sim.choose(5);sim.guns[5].cooldown=sim.guns[5].cooldownTotal=8;near(sim.weaponReadiness().remaining,8);sim.guns[5].ammo=0;assert(sim.weaponReadiness().empty);
 const legacy:any=sim.checkpoint();delete legacy.lasers;legacy.guns.forEach(g=>delete g.cooldownTotal);const restored=Simulation.restore(legacy);assert.deepEqual(restored.lasers,[]);assert.equal(restored.guns[5].cooldownTotal,8);
});
