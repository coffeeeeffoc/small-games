import { assetFixture } from './progression-fixture.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import { createDuel, configureDuel, commandDuel, advanceDuel, viewDuel } from '../assets/scripts/core/Duel.ts';
import { createNightReplay, applyNightReplay } from '../assets/scripts/core/Replay.ts';
import { CATALOG, PACKAGES, POOLS, GROWTH_VERSION, practiceLoadout, validLoadout, levelProgress, type Effect } from '../assets/scripts/core/Progression.ts';
import { MAP, PROTECTED, UNITS, WEAPONS } from '../assets/scripts/core/Data.ts';
import { muzzlePosition, shotPosition } from '../assets/scripts/core/Flight.ts';
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

test('ordinary volleys spread real trajectories in two dimensions without leaving a hole at the reticle',()=>{
  for (const effects of [[], ['burst'], ['twin'], ['burst','twin']] as Effect[][]) {
    for (let weapon=0;weapon<4;weapon++) {
      const sim=setup(effects);sim.choose(weapon);sim.setAim({x:-80,z:-40});
      assert(sim.fire());
      const points=sim.shots.map(shot=>{
        const landing=shotPosition(shot,shot.due);
        assert(Math.hypot(landing.x-shot.x,landing.z-shot.z,landing.y-shot.targetY)<1e-7);
        assert(Math.hypot(shot.x-sim.aim.x,shot.z-sim.aim.z)<=WEAPONS[weapon].radius);
        return {x:shot.x,z:shot.z};
      });
      assert.equal(new Set(points.map(p=>JSON.stringify(p))).size,sim.attackCount);
      for (const axis of ['x','z'] as const)
        assert(Math.abs(points.reduce((sum,p)=>sum+p[axis],0)/points.length-sim.aim[axis])<1e-8);
      if (!effects.length) assert.deepEqual(points,[sim.aim]);
      if (points.length===4) {
        const [a,b,c]=points;
        assert(Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))>.1,'Four points cover area, not one line');
      }
    }
  }
});

test('spread damages a displaced target outside the original blast coverage',()=>{
  for (const [effects,offset] of [
    [['burst'],{x:0,z:4.6}], [['twin'],{x:4.6,z:0}], [['burst','twin'],{x:3.4,z:3.4}],
  ] as [Effect[],{x:number;z:number}][]) {
    const damage=(mods:Effect[])=>{
      const sim=setup(mods);sim.height=()=>0;sim.choose(1);sim.setAim({x:-80,z:-40});
      Object.assign(sim.aircraft,{x:-80,z:-140,y:100,yaw:0,bank:0,pitch:0});
      const enemy=sim.addUnit('turret',sim.aim);enemy.y=0;const hp=enemy.hp;
      assert(sim.fire());
      enemy.x+=offset.x;enemy.z+=offset.z;
      const finish=Math.max(...sim.shots.map(shot=>shot.due))+.1;
      while(sim.time<finish)sim.step(1/60);
      return hp-enemy.hp;
    };
    assert.equal(damage([]),0,'Original precise shot misses the displaced target');
    assert(damage(effects)>0,'Extra rounds cover the displacement');
  }
});

test('spread checks protected areas, map bounds and friendly warnings before paying for a volley',()=>{
  for (const effects of [['burst'],['twin'],['burst','twin']] as Effect[][]) {
    const sim=setup(effects);sim.choose(1);
    Object.assign(sim.aircraft,{x:0,z:0,y:100,yaw:0,bank:0,pitch:0});
    sim.setAim({x:MAP.halfWidth-.01,z:MAP.halfDepth-.01});
    const gun={...sim.guns[1]};
    assert.equal(sim.reason(),'outside');assert(!sim.fire());assert.deepEqual(sim.guns[1],gun);
    const p=PROTECTED[0];sim.setAim({x:p.x+p.radius+WEAPONS[1].radius+.1,z:p.z});
    Object.assign(sim.aircraft,{x:sim.aim.x-100,z:sim.aim.z-100});
    assert.equal(sim.reason(),'protected');assert(!sim.fire());assert.deepEqual(sim.guns[1],gun);
    assert.equal(sim.shots.length,0);
    sim.setAim({x:-80,z:-40});assert(sim.fire());
    const shot=sim.shots[0],dx=shot.x-sim.aim.x,dz=shot.z-sim.aim.z,length=Math.hypot(dx,dz);
    const radius=WEAPONS[1].radius+UNITS.escort.radius;
    const point={x:sim.aim.x+dx/length*(radius+length*.5),z:sim.aim.z+dz/length*(radius+length*.5)};
    const friend=sim.addUnit('escort',point,true);Object.assign(friend,point);sim.units=[friend];
    assert(sim.friendlyRisk,'Warning includes a friend outside the original blast disk');
    const plain=setup([]);plain.choose(1);plain.setAim(sim.aim);plain.units=sim.units;
    assert(!plain.friendlyRisk,'Control reticle alone does not cover that friend');
  }
});

test('spread survives checkpoint, ranked input replay and both duel pilots deterministically',()=>{
  const direct=setup(['burst','twin']);direct.choose(1);direct.setAim({x:-80,z:-40});
  const restored=Simulation.restore(direct.checkpoint());
  const replay={simulation:direct.checkpoint(),assisted:false};
  assert(direct.fire());assert(restored.fire());
  applyNightReplay(replay,[{input:{command:'fire',args:[]},ticks:0}]);
  assert.deepEqual(restored.shots,direct.shots);assert.deepEqual(replay.simulation.shots,direct.checkpoint().shots);
  const duel=configureDuel(createDuel(11),[0,1].map(()=>({version:GROWTH_VERSION,level:1,effects:['burst','twin'],skipped:[]})));
  for (const side of [0,1]) {
    const local=Simulation.restore(viewDuel(duel,side).simulation);
    local.choose(1);assert(local.fire());
    commandDuel(duel,side,[{command:'choose',args:[1]},{command:'fire',args:[]}]);
    assert.deepEqual(duel.simulation.shots.filter(s=>s.side===side),local.checkpoint().shots.filter(s=>s.side===side));
  }
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


test('practice resolves saved loadouts without consuming stock and rejects inactive or elapsed time entitlements',()=>{
  const assets=assetFixture();assets.loadouts.solo={mods:['burst-match','twin-24h'],weapon:'laser-24h',skill:'tracking-permanent'};
  assets.active.twin=assets.serverNow+1000;const stock=structuredClone(assets.inventory);
  const load=practiceLoadout(assets,'solo');assert.deepEqual(load.effects,['burst','twin','tracking']);assert.deepEqual(load.skipped,['laser-24h']);assert.deepEqual(assets.inventory,stock);
  const sim=new Simulation('training-60');sim.applyLoadout(load);assert.equal(sim.attackCount,4);
  assert.deepEqual(practiceLoadout(assets,'solo',1001).effects,['burst','tracking']);
});

test('duel views expose only public opponent equipment and preserve each side effects',()=>{
  const duel=createDuel(22);configureDuel(duel,[{version:GROWTH_VERSION,level:3,effects:['burst','twin'],skipped:[]},{version:GROWTH_VERSION,level:1,effects:['laser','emp'],skipped:[]}]);
  const view=viewDuel(duel,0),reverse=viewDuel(duel,1);
  assert.deepEqual(view.enemyEquipment.loadout.effects,['laser','emp']);assert.deepEqual(reverse.enemyEquipment.loadout.effects,['burst','twin']);
  assert.deepEqual(Object.keys(view.enemyEquipment).sort(),['guns','loadout','selected','skill']);
});


test('ordinary weapon upgrades and level growth change the actual fired round and gun resources',()=>{
  for(const effects of [['power','rate'],['radius','cooling']] as Effect[][]){
    const sim=new Simulation('training-60');sim.applyLoadout({version:GROWTH_VERSION,level:15,effects,skipped:[]});sim.start();sim.choose(1);sim.setAim({x:-80,z:-40});
    assert(sim.fire());const shot=sim.shots[0],gun=sim.guns[1];
    assert(Math.abs(shot.damageMultiplier!-(effects.includes('power')?1.2:1.05))<1e-10);
    assert.equal(shot.radiusScale,effects.includes('radius')?1.15:1);
    assert(Math.abs(gun.cooldown-WEAPONS[1].interval*.95*(effects.includes('rate')?.88:1))<1e-10);
    assert.equal(gun.heat,WEAPONS[1].heat*(effects.includes('cooling')?.85:1));assert.equal(gun.ammo,WEAPONS[1].ammo-1);
  }
});
