import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import { createDuel, configureDuel, commandDuel, advanceDuel, viewDuel } from '../assets/scripts/core/Duel.ts';
import { createNightReplay, applyNightReplay } from '../assets/scripts/core/Replay.ts';
import { CATALOG, PACKAGES, POOLS, GROWTH_VERSION, validLoadout, levelProgress, type Effect } from '../assets/scripts/core/Progression.ts';
import { PROTECTED, WEAPONS } from '../assets/scripts/core/Data.ts';
import { muzzlePosition } from '../assets/scripts/core/Flight.ts';
import { bestTrainingRecord, readTrainingRecord } from '../assets/scripts/core/TrainingRecords.ts';
const setup = (effects: Effect[]) => {
  const sim=new Simulation('training-60');sim.applyLoadout({version:GROWTH_VERSION,level:1,effects,skipped:[]});sim.start();
  sim.units=sim.units.filter(u=>u.friendly);sim.convoy='holding';sim.addUnit('turret',{x:150,z:90});return sim;
};
test('slot limits deduplicate effects across terms and source pools cannot yield gold-exclusive mods',()=>{
  assert(validLoadout({mods:['burst-match','twin-match'],weapon:'drone-match',skill:'emp-permanent'}));
  assert(!validLoadout({mods:['power-match','power-permanent'],weapon:null,skill:null}));
  assert(!validLoadout({mods:['burst-match','twin-match','rate-match'],weapon:null,skill:null}));
  assert(!validLoadout({mods:[],weapon:'emp-match',skill:null}));
  assert(POOLS.general.effects.every(e=>!['burst','twin'].includes(e)));
  assert.deepEqual(PACKAGES.map(p=>p.quantity),[1,3,5,10,20]);
  const minCost=Math.min(...PACKAGES.map(p=>p.coins/p.quantity));
  assert(CATALOG.filter(p=>p.term==='match').every(p=>p.sell<minCost));
  assert(levelProgress(1000).level>levelProgress(0).level);
});
test('two bursts and twin trajectories pay four rounds and heat, cannot fire for free, preserve snapshot',()=>{
  const sim=setup(['burst','twin']);sim.choose(1);sim.setAim({x:-80,z:-40});
  assert(sim.fire());assert.equal(sim.shots.length,4);assert.equal(sim.guns[1].ammo,116);assert.equal(sim.guns[1].heat,60);
  assert.equal(new Set(sim.shots.map(s=>s.born)).size,2);
  assert.equal(new Set(sim.shots.map(s=>JSON.stringify(s.origin))).size,2);
  assert.equal(sim.events.filter(e=>e.type==='shot').length,2);
  sim.step(.06);assert.equal(sim.events.filter(e=>e.type==='shot').length,2);
  sim.step(.06);assert.equal(sim.events.filter(e=>e.type==='shot').length,4);
  assert(sim.events.filter(e=>e.type==='shot').slice(2).every(e=>e.time===.1));
  sim.guns[1].cooldown=0;sim.guns[1].ammo=3;assert(!sim.fire());assert.equal(sim.guns[1].ammo,3);
  assert.deepEqual(Simulation.restore(sim.checkpoint()).loadout,sim.loadout);
});
test('rate advertisement expiry preserves personal tracking and a delayed guided round only moves after birth',()=>{
  const sim=setup(['burst','tracking']);sim.choose(1);sim.setAim(sim.units.find(u=>!u.friendly)!);
  assert(sim.useSkill());assert(sim.fire());sim.buff={kind:'rate',remaining:.01};sim.step(.01);
  assert(sim.trackingActive);assert.equal(sim.shots.filter(s=>s.guidance).length,2);
  const delayed=sim.shots.find(s=>s.born===.1)!;assert.deepEqual(delayed.guidance!.position,delayed.origin);
  sim.step(.08);sim.step(.02);
  const p=delayed.guidance!.position;
  assert(Math.hypot(p.x-delayed.origin.x,p.y-delayed.origin.y,p.z-delayed.origin.z)<=WEAPONS[1].speed*.011);
  const restored=Simulation.restore(sim.checkpoint());restored.step(.02);
  assert.equal(restored.events.filter(e=>e.type==='shot').length,2);
});
test('special weapons and EMP reject friendly/protected targets and terrain blocks drone or laser damage',()=>{
  const laser=setup(['laser']);laser.choose(5);const friend=laser.units.find(u=>u.friendly)!;
  laser.setAim(friend);assert(!laser.fire());
  const protectedTarget=laser.addUnit('turret',PROTECTED[0]);laser.setAim(protectedTarget);assert(!laser.fire());
  const target=laser.addUnit('heavy',{x:-80,z:-40});Object.assign(laser.aircraft,{x:-80,z:0,y:100});laser.setAim(target);
  laser.height=()=>200;assert(!laser.fire());
  const emp=setup(['emp']);const protectedEnemy=emp.addUnit('light',PROTECTED[0]);Object.assign(protectedEnemy,{x:PROTECTED[0].x,z:PROTECTED[0].z});
  assert(emp.useSkill());assert.equal(protectedEnemy.rootedUntil,undefined);
  const drone=setup(['drone']);drone.choose(4);const origin=muzzlePosition(drone.aircraft,4);assert(drone.fire());
  assert.deepEqual({x:drone.drones[0].x,y:drone.drones[0].y,z:drone.drones[0].z},origin);
  drone.units=drone.units.filter(u=>u.friendly);const enemy=drone.addUnit('turret',{x:20,z:20});
  for(const d of drone.drones)Object.assign(d,{x:20,z:0,y:20,nextAttack:0});
  drone.height=(_x,z)=>z>8&&z<12?200:0;
  const hp=enemy.hp;drone.step(.1);assert.equal(enemy.hp,hp);assert.equal(drone.drones.reduce((n,d)=>n+d.budget,0),72);
});
test('skills repeat after effect and cooldown, pause freezes and advertisements never refill cooldown',()=>{
  const sim=setup(['tracking']);assert(sim.useSkill());assert.equal(sim.skillRemaining,60);assert.equal(sim.skillCooldown,150);
  assert(!sim.grantBuff('tracking'));sim.pause('manual',true);sim.step(.1);assert.equal(sim.skillCooldown,150);
  sim.pause('manual',false);sim.time=61;assert(!sim.useSkill());assert(sim.grantBuff('tracking'));assert.equal(sim.skill.readyAt,150);
  sim.buff=undefined;sim.time=150;assert(sim.useSkill());assert.equal(sim.skill.readyAt,300);
  const checkpoint=Simulation.restore(sim.checkpoint());assert.equal(checkpoint.skill.readyAt,300);
});
test('EMP holds movement while allowing attacks and leaves projectiles intact; immunity prevents chaining',()=>{
  const sim=setup(['emp']);const unit=sim.addUnit('light',{x:-80,z:-40});sim.choose(1);sim.setAim(unit);sim.fire();
  const count=sim.shots.length,x=unit.x,z=unit.z,attack=unit.attack;assert(sim.useSkill());sim.step(.1);
  assert.equal(unit.x,x);assert.equal(unit.z,z);assert(unit.attack<attack);assert.equal(sim.shots.length,count);
  sim.skill.readyAt=0;sim.time=5;assert(sim.useSkill());assert.equal(unit.rootedUntil,4);assert.equal(unit.immuneUntil,12);
});
test('duel ownership isolates tracking and EMP and survives checkpoints',()=>{
  const state=configureDuel(createDuel(11),[
    {version:GROWTH_VERSION,level:6,effects:['tracking','power'],skipped:[]},
    {version:GROWTH_VERSION,level:10,effects:['emp'],skipped:[]},
  ]);
  commandDuel(state,0,[{command:'useSkill',args:[]}]);
  assert.equal(viewDuel(state,0).simulation.skill.readyAt,150);assert.equal(viewDuel(state,1).simulation.skill.readyAt,0);
  commandDuel(state,1,[{command:'useSkill',args:[]}]);advanceDuel(state,1000);
  assert.equal(viewDuel(state,1).simulation.skill.readyAt,49);
  assert(state.simulation.units.filter(u=>u.group===0).every(u=>u.rootedUntil===4));
  assert(state.simulation.units.filter(u=>u.group===1).every(u=>!u.rootedUntil));
});
test('special weapons require entitlement; laser is immediate but bounded, drones expire without budget renewal',()=>{
  const base=setup([]);base.choose(5);assert.notEqual(base.selected,5);assert(!base.hasWeapon(4));
  const laser=setup(['laser']);const target=laser.addUnit('heavy',{x:-80,z:-40});target.hp=1000;
  Object.assign(laser.aircraft,{x:-80,z:-40,y:200});laser.choose(5);laser.setAim(target);
  assert(laser.fire());assert(target.hp<1000&&target.hp>900);assert.equal(laser.guns[5].ammo,5);assert(!laser.fire());
  const drone=setup(['drone']);drone.choose(4);assert(drone.fire());assert.equal(drone.drones.length,3);
  const budget=drone.drones.reduce((n,d)=>n+d.budget,0);assert.equal(budget,72);
  drone.time=13;drone.step(.1);assert.equal(drone.drones.length,0);assert.equal(drone.guns[4].ammo,2);
});
test('server replay accepts skill input only through server-fixed entitlement',()=>{
  const state=createNightReplay('campaign','corridor-01'),sim=Simulation.restore(state.simulation);
  sim.applyLoadout({version:GROWTH_VERSION,level:6,effects:['tracking'],skipped:[]});state.simulation=sim.checkpoint();
  applyNightReplay(state,[{input:{command:'useSkill',args:[]},ticks:0},{input:{},ticks:2}]);
  assert.equal(state.assisted,false);assert.equal(state.simulation.skill.readyAt,150);
  assert.throws(()=>applyNightReplay(state,[{input:{command:'applyLoadout',args:[]},ticks:0}]));
});

test('a drone volley records one hit shot across repeated damage, checkpoints and duel ownership',()=>{
  const original=setup(['drone']);original.choose(4);assert(original.fire());
  const target=original.units.find(u=>!u.friendly)!;target.hp=1000;
  for(const d of original.drones)Object.assign(d,{x:target.x,z:target.z,y:target.y+20,nextAttack:0});
  original.step(.1);assert.equal(original.fired,1);assert.equal(original.hitShots,1);assert(original.hits>1);
  const restored=Simulation.restore(original.checkpoint());
  for(let i=0;i<30;i++)restored.step(.1);
  assert.equal(restored.hitShots,1);assert(restored.hits>3);
  restored.units=restored.units.filter(u=>u.friendly);restored.phase='success';
  const record=bestTrainingRecord(undefined,restored);assert(record);assert.deepEqual(readTrainingRecord(JSON.stringify(record)),record);
  const duel=configureDuel(createDuel(11),[0,1].map(()=>({version:GROWTH_VERSION,level:1,effects:['drone'],skipped:[]})));
  commandDuel(duel,1,[{command:'choose',args:[4]},{command:'fire',args:[]}]);
  const enemy=duel.simulation.units.find(u=>u.group===0)!;enemy.hp=1000;
  for(const d of duel.simulation.drones)Object.assign(d,{x:enemy.x,z:enemy.z,y:enemy.y+20,nextAttack:0});
  advanceDuel(duel,4000);
  assert.equal(viewDuel(duel,0).simulation.hitShots,0);
  assert.equal(viewDuel(duel,1).simulation.hitShots,1);
  assert.equal(viewDuel(duel,1).simulation.fired,1);
});
