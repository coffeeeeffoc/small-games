import assert from 'node:assert/strict';
import test from 'node:test';
import { validLoadout, modTier, priceFor, type Loadout } from '../assets/scripts/core/Armory.ts';
import { MISSIONS, missionCoins } from '../assets/scripts/core/MissionCatalog.ts';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import { createDuel, commandDuel, advanceDuel, viewDuel } from '../assets/scripts/core/Duel.ts';
import { PROTECTED } from '../assets/scripts/core/Data.ts';
import { createNightReplay, applyNightReplay, observeNightInputs, type ReplayFrame } from '../assets/scripts/core/Replay.ts';

function range(loadout: Loadout) {
  const sim = new Simulation('corridor-01', loadout); sim.start(); sim.convoy = 'holding';
  sim.units = sim.units.filter(u => u.friendly);
  for (const u of sim.units) u.attack = 9999;
  sim.addUnit('turret', { x: 130, z: -65 }).attack = 9999;
  return sim;
}
function land(sim: Simulation) { while (sim.shots.length) sim.step(1 / 60); }
test('three distinct owned-slot shapes, bounded tiers or duplicate inventory', () => {
  assert(validLoadout([]));
  for (const bad of [null, [{id:'emp',tier:4}], [{id:'power',tier:1},{id:'power',tier:2}],
    [{id:'toString',tier:1}], [{id:'spread',tier:1,charges:100}], ['invalid'], Array(4).fill({id:'duration',tier:1})])
    assert(!validLoadout(bad));
  assert.throws(() => createDuel(7, false, [[{id:'coolant',tier:1}],[]]));
});
test('loadout changes real ballistics, damage, fire duration and protected radius', () => {
  const base = range([]), sim = range([{ id:'power',tier:2 },{ id:'velocity',tier:2 }]);
  const target = sim.addUnit('heavy', {x:-80,z:-65}); target.immobileUntil = 999;
  sim.choose(1); sim.setAim(target); base.setAim(target);
  assert(sim.flightTime(1) < base.flightTime(1)); assert(sim.fire()); land(sim);
  assert(Math.abs(target.maxHp-target.hp-45.24)<.001);
  const zone = range([{id:'duration',tier:2},{id:'spread',tier:2}]); zone.choose(3);
  zone.setAim({x:PROTECTED[0].x + PROTECTED[0].radius+9, z:PROTECTED[0].z});
  assert.equal(zone.reason(),'protected'); zone.setAim(target); assert(zone.fire()); land(zone);
  assert.equal(zone.fireZones[0].radius,9.6);
  assert.equal(zone.fireZones[0].expires-zone.fireZones[0].born,31);
});
test('EMP spends one of two charges, stops driving but not firing, then movement resumes', () => {
  const sim=range([{id:'emp',tier:1}]); sim.choose(4);
  const tank=sim.addUnit('heavy',{x:-80,z:-65}), gun=sim.addUnit('turret',{x:-79,z:-65});
  const ally=sim.addUnit('escort',{x:-75,z:-65},true); ally.attack=9999;
  sim.setAim(tank); assert(sim.fire()); assert.equal(sim.guns[4].ammo,1); assert.equal(sim.guns[4].cooldown,18); assert(!sim.fire());
  land(sim); assert.equal(tank.hp,tank.maxHp); assert.equal(gun.immobileUntil,undefined); assert.equal(ally.immobileUntil,undefined);
  assert(tank.immobileUntil!>sim.time+2.4); const x=tank.x;
  tank.attack=0; tank.born=-100; ally.x=tank.x+18; sim.step(.1); assert(ally.hp<ally.maxHp);
  assert.equal(tank.x,x); sim.pause('manual',true); sim.step(.1); assert.equal(tank.x,x); sim.pause('manual',false);
  while(sim.time<tank.immobileUntil!+.15) sim.step(.1);
  assert(tank.x>x);
});
test('coolant use is exactly once and replays; duel pilots retain their purchased tiers', () => {
  const loadout: Loadout=[{id:'coolant',tier:1}];
  const sim=new Simulation('corridor-01',loadout); sim.start();
  const frames: ReplayFrame[]=[]; observeNightInputs(sim,(input,ticks)=>frames.push({input,ticks}));
  assert(!sim.useCoolant()); sim.choose(0); sim.setAim({x:-80,z:-65}); assert(sim.fire());
  const cooldown=sim.guns[0].cooldown;
  assert(sim.useCoolant()); assert.equal(sim.guns[0].heat,0); assert.equal(sim.guns[0].cooldown,cooldown);
  assert(!sim.useCoolant()); const replay=applyNightReplay(createNightReplay('campaign','corridor-01',loadout),frames);
  assert(replay.simulation.coolantUsed && replay.assisted); assert.deepEqual(replay.simulation,sim.checkpoint());
  const duel=createDuel(7,false,[[{id:'power',tier:2}], [{id:'emp',tier:1}]]);
  assert.equal(modTier(duel.pilots[0].loadout,'power'),2);
  assert.throws(()=>commandDuel(duel,0,[{command:'choose',args:[4]}]));
  commandDuel(duel,1,[{command:'choose',args:[4]},{command:'setAim',args:[{x:65,z:30}]},{command:'fire',args:[]}]);
  assert.equal(viewDuel(duel,1).simulation.guns[4].ammo,1); assert.equal(viewDuel(duel,0).simulation.guns.length,4);
  const reversed=createDuel(43,false,[[],[{id:'power',tier:2}]]);
  const target=reversed.simulation.units.find(u=>u.group===0&&u.kind==='turret')!;
  commandDuel(reversed,1,[{command:'choose',args:[1]},{command:'setAim',args:[{x:target.x,z:target.z}]},{command:'fire',args:[]}]);
  advanceDuel(reversed,(reversed.simulation.shots[0].due+.1)*1000);
  const victim=reversed.simulation.units.find(u=>u.id===target.id)!;
  assert(Math.abs(victim.maxHp-victim.hp-69.6)<.001, 'in-flight damage keeps seat 1 purchased tier while simulation is at seat 0');
});
test('separate passive upgrades do not occupy weapon slots or change unrelated guns', () => {
  const kit:Loadout=[{id:'hePower',tier:3},{id:'heVelocity',tier:3},{id:'heavyPower',tier:2},{id:'heavyVelocity',tier:2},{id:'spread',tier:3}];
  assert(validLoadout(kit));const base=range([]),sim=range(kit);
  assert.equal(sim.guns.length,4);assert.equal(sim.speed(0),base.speed(0));assert.equal(sim.speed(3),base.speed(3));
  assert.equal(sim.speed(1),base.speed(1)*1.32);assert.equal(sim.speed(2),base.speed(2)*1.22);assert.equal(sim.radius(3),10.4);
  sim.choose(0);sim.setAim({x:-80,z:-65});assert(sim.fire());assert.equal(sim.shots[0].damageScale,1);
  sim.choose(1);assert(sim.fire());assert.equal(sim.shots[1].damageScale,1.24);
  assert.equal(createNightReplay('campaign','corridor-01',kit).assisted,false);
  const rental:Loadout=[...kit.filter(x=>x.id!=='hePower'),{id:'hePower',tier:3,trial:true}];
  assert(createNightReplay('campaign','corridor-01',rental).assisted);
  const withEMP=range([...kit,{id:'emp',tier:1}]);assert.equal(withEMP.guns.length,5);
  const duel=createDuel(7,false,[rental,kit]);assert.deepEqual(duel.pilots[0].loadout,rental);assert.deepEqual(duel.pilots[1].loadout,kit);
});

test('EMP tiers persist in flight for either duel seat',()=>{
  for(const [tier,seconds] of [[1,2.5],[2,3.5],[3,4.5]] as const){
    const sim=range([{id:'emp',tier}]);sim.choose(4);const tank=sim.addUnit('heavy',{x:-80,z:-65});sim.setAim(tank);assert(sim.fire());
    const due=sim.shots[0].due;assert.equal(sim.shots[0].stunDuration,seconds);land(sim);assert(Math.abs(tank.immobileUntil!-due-seconds)<.05);
  }
  const duel=createDuel(43,false,[[{id:'emp',tier:1}],[{id:'emp',tier:3}]]);
  commandDuel(duel,1,[{command:'choose',args:[4]},{command:'setAim',args:[{x:65,z:30}]},{command:'fire',args:[]}]);
  assert.equal(duel.simulation.shots[0].stunDuration,4.5);
});


test('EMP first tier is affordable from twenty first clears with no level gate',()=>{
 const twenty=MISSIONS.slice(0,20).reduce((sum,m)=>sum+missionCoins(m.id),0);
 assert.equal(twenty,7900);assert.equal(priceFor('emp',1),twenty);
 assert.equal(priceFor('emp',2),10000);assert.equal(priceFor('emp',3),14000);
});
