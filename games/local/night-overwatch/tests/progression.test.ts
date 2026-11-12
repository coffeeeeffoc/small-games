import { assetFixture } from './progression-fixture.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import { createDuel, configureDuel, commandDuel, advanceDuel, viewDuel } from '../assets/scripts/core/Duel.ts';
import { createNightReplay, applyNightReplay, nightReplayResult } from '../assets/scripts/core/Replay.ts';
import { ECONOMY, RECIPES, campaignReward, CATALOG, PACKAGES, POOLS, WHEEL_PRIZES, eligibleDrops, GROWTH_VERSION, practiceLoadout, validLoadout, levelProgress, attackPreview, type Effect } from '../assets/scripts/core/Progression.ts';
import { FIRE_ZONE, MAP, PROTECTED, UNITS, WEAPONS } from '../assets/scripts/core/Data.ts';
import { muzzlePosition, shotPosition } from '../assets/scripts/core/Flight.ts';
import { bestTrainingRecord, readTrainingRecord } from '../assets/scripts/core/TrainingRecords.ts';
const setup = (effects: Effect[]) => {
  const sim=new Simulation('training-60');sim.applyLoadout({version:GROWTH_VERSION,level:1,effects,skipped:[]});sim.start();
  sim.units=sim.units.filter(u=>u.friendly);sim.convoy='holding';sim.addUnit('turret',{x:150,z:90});return sim;
};
test('slot limits deduplicate effects and all sources share level-gated contents',()=>{
  assert(validLoadout({mods:['burst-match','twin-match'],weapon:'drone-match',skill:'emp-permanent'}));
  assert(!validLoadout({mods:['power-match','power-permanent'],weapon:null,skill:null}));
  assert(!validLoadout({mods:['burst-match','twin-match','rate-match'],weapon:null,skill:null}));
  assert(!validLoadout({mods:[],weapon:'emp-match',skill:null}));
  assert.deepEqual(POOLS.general,POOLS.gold);
  assert(eligibleDrops(CATALOG,3,11,[]).length===0);
  assert.deepEqual(eligibleDrops(CATALOG,3,12,[]).map(p=>p.effect),['burst']);
  assert.deepEqual(eligibleDrops(CATALOG,3,15,['burst']).map(p=>p.effect),['twin']);
  assert(eligibleDrops(CATALOG,1,1,[]).some(p=>p.effect==='tracking'));assert(eligibleDrops(CATALOG,2,1,[]).some(p=>p.effect==='emp'));assert(!eligibleDrops(CATALOG,1,50,['tracking']).some(p=>p.category==='skill'));
  assert.deepEqual(PACKAGES.map(p=>p.quantity),[1,3,5,10,20]);
  const minCost=Math.min(...PACKAGES.map(p=>p.coins/p.quantity));
  assert(CATALOG.filter(p=>p.term==='match').every(p=>p.sell<minCost));
  assert(levelProgress(1000).level>levelProgress(0).level);
});
test('all level and permanent ownership combinations stay below package cost, including currency substitutes',()=>{
  const gear=CATALOG.filter(p=>p.term==='match');
  const recycle=(p:typeof gear[number])=>(p.sell*ECONOMY.termOdds.match+CATALOG.find(other=>other.effect===p.effect&&other.term==='24h')!.sell*ECONOMY.termOdds['24h'])/100;
  let maximum=0;
  for(let level=1;level<=50;level++)for(let mask=0;mask<1<<gear.length;mask++){
    const owned=gear.filter((_,i)=>mask&(1<<i)).map(p=>p.effect);
    const value=POOLS.general.weights.reduce((sum,weight,tier)=>{const items=eligibleDrops(CATALOG,tier,level,owned);const bundle=ECONOMY.bundleTiers[tier],value=(items.length?bundle.coins+items.reduce((n,p)=>n+recycle(p),0)/items.length:POOLS.general.coinDrops[tier])+bundle.fragments*ECONOMY.fragmentSell;return sum+weight*value/100;},0);
    maximum=Math.max(maximum,value);
    assert(value<=130.1+1e-9);assert(value<160);
  }
  assert.equal(WHEEL_PRIZES.reduce((sum,p)=>sum+p.weight,0),100);
  assert(Math.abs(maximum-130.1)<1e-9);
  assert.deepEqual(ECONOMY.termOdds,{match:90,'24h':10});
  assert.deepEqual(POOLS.general.weights,[60,25,12,3]);
  assert.equal(GROWTH_VERSION,'night-growth-v1');
  assert.equal(ECONOMY.version,'night-rewards-v4');
});
test('two bursts and twin trajectories pay one round and heat charge, cannot fire for free, preserve snapshot',()=>{
  const sim=setup(['burst','twin']);sim.choose(1);sim.setAim({x:-80,z:-40});
  assert(sim.fire());assert.equal(sim.shots.length,4);assert.equal(sim.guns[1].ammo,119);assert.equal(sim.guns[1].heat,15);assert.equal(sim.ammoSpent,1);
  assert.deepEqual(sim.shots.map(s=>s.damageMultiplier),[1,.6,.6,.6]);
  assert.equal(new Set(sim.shots.map(s=>s.born)).size,2);
  assert.equal(new Set(sim.shots.map(s=>JSON.stringify(s.origin))).size,3);
  assert.equal(sim.events.filter(e=>e.type==='shot').length,2);
  sim.step(.06);assert.equal(sim.events.filter(e=>e.type==='shot').length,2);
  sim.step(.06);assert.equal(sim.events.filter(e=>e.type==='shot').length,4);
  assert(sim.events.filter(e=>e.type==='shot').slice(2).every(e=>e.time===.1));
  sim.guns[1].cooldown=0;sim.guns[1].ammo=1;assert(sim.fire());assert.equal(sim.guns[1].ammo,0);assert.equal(sim.ammoSpent,2);
  sim.guns[1].cooldown=0;assert(!sim.fire());assert.equal(sim.ammoSpent,2);
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
      assert.deepEqual(points[0],sim.aim);
      assert.deepEqual(sim.shots[0].origin,muzzlePosition(sim.aircraft,weapon));
      if (points.length===4) for (const axis of ['x','z'] as const)
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
    sim.ammoSpent=1;
    const p=PROTECTED[0];sim.setAim({x:p.x+p.radius+WEAPONS[1].radius+.1,z:p.z});
    Object.assign(sim.aircraft,{x:sim.aim.x-100,z:sim.aim.z-100});
    assert.equal(sim.reason(),'protected');assert(!sim.fire());assert.deepEqual(sim.guns[1],gun);
    assert.equal(sim.shots.length,0);
    sim.setAim({x:-80,z:-40});const beforeFire=sim.checkpoint();assert(sim.fire());
    const shot=sim.shots[1],dx=shot.x-sim.aim.x,dz=shot.z-sim.aim.z,length=Math.hypot(dx,dz);
    const radius=WEAPONS[1].radius+UNITS.escort.radius;
    const point={x:sim.aim.x+dx/length*(radius+length*.5),z:sim.aim.z+dz/length*(radius+length*.5)};
    const friend=sim.addUnit('escort',point,true);Object.assign(friend,point);sim.units=[friend];
    const warning=Simulation.restore(beforeFire);warning.units=[friend];
    assert(warning.friendlyRisk,'Warning includes a friend outside the original blast disk');
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
  assert(drone.drones.every(d=>Math.abs(Math.hypot(d.x-origin.x,d.z-origin.z)-6)<1e-8&&d.y===origin.y));
  drone.units=drone.units.filter(u=>u.friendly);const enemy=drone.addUnit('turret',{x:20,z:20});
  for(const d of drone.drones)Object.assign(d,{x:20,z:0,y:20,nextAttack:0});
  drone.height=(_x,z)=>z>8&&z<12?200:0;
  const hp=enemy.hp;drone.step(.1);assert.equal(enemy.hp,hp);assert.equal(drone.drones.reduce((n,d)=>n+d.budget,0),432);
});
test('skills repeat after effect and cooldown, pause freezes and advertisements never refill cooldown',()=>{
  const sim=setup(['tracking']);assert(sim.useSkill());assert.equal(sim.skillRemaining,20);assert.equal(sim.skillCooldown,110);
  assert(!sim.grantBuff('tracking'));sim.pause('manual',true);sim.step(.1);assert.equal(sim.skillCooldown,110);
  sim.pause('manual',false);sim.time=61;assert(!sim.useSkill());assert(sim.grantBuff('tracking'));assert.equal(sim.skill.readyAt,110);
  sim.buff=undefined;sim.time=110;assert(sim.useSkill());assert.equal(sim.skill.readyAt,220);
  const checkpoint=Simulation.restore(sim.checkpoint());assert.equal(checkpoint.skill.readyAt,220);
});
test('EMP holds movement while allowing attacks and leaves projectiles intact; immunity prevents chaining',()=>{
  const sim=setup(['emp']);const unit=sim.addUnit('light',{x:-80,z:-40});sim.choose(1);sim.setAim(unit);sim.fire();
  const count=sim.shots.length,x=unit.x,z=unit.z,attack=unit.attack;assert(sim.useSkill());sim.step(.1);
  assert.equal(unit.x,x);assert.equal(unit.z,z);assert(unit.attack<attack);assert.equal(sim.shots.length,count);
  sim.skill.readyAt=0;sim.time=16;assert(sim.useSkill());assert.equal(unit.rootedUntil,15);assert.equal(unit.immuneUntil,23);
});
test('duel ownership isolates tracking and EMP and survives checkpoints',()=>{
  const state=configureDuel(createDuel(11),[
    {version:GROWTH_VERSION,level:6,effects:['tracking','power'],skipped:[]},
    {version:GROWTH_VERSION,level:10,effects:['emp'],skipped:[]},
  ]);
  commandDuel(state,0,[{command:'useSkill',args:[]}]);
  assert.equal(viewDuel(state,0).simulation.skill.readyAt,110);assert.equal(viewDuel(state,1).simulation.skill.readyAt,0);
  commandDuel(state,1,[{command:'useSkill',args:[]}]);advanceDuel(state,1000);
  assert.equal(viewDuel(state,1).simulation.skill.readyAt,75);
  assert(state.simulation.units.filter(u=>u.group===0).every(u=>u.rootedUntil===15));
  assert(state.simulation.units.filter(u=>u.group===1).every(u=>!u.rootedUntil));
});
test('special weapons require entitlement; laser is continuous and bounded, drones expire without budget renewal',()=>{
  const base=setup([]);base.choose(5);assert.notEqual(base.selected,5);assert(!base.hasWeapon(4));
  const laser=setup(['laser']);const target=laser.addUnit('heavy',{x:-80,z:-40});target.hp=1000;
  Object.assign(laser.aircraft,{x:-80,z:-40,y:100});laser.choose(5);laser.setAim(target);
  assert(laser.fire());assert.equal(target.hp,1000);laser.step(.1);assert(Math.abs(target.hp-993.2)<1e-6);assert.equal(laser.guns[5].ammo,5);assert(!laser.fire());
  const drone=setup(['drone']);drone.choose(4);assert(drone.fire());assert.equal(drone.drones.length,3);
  const budget=drone.drones.reduce((n,d)=>n+d.budget,0);assert.equal(budget,432);
  drone.time=13;drone.step(.1);assert.equal(drone.drones.length,3);for(let i=0;i<200&&drone.drones.length;i++)drone.step(.1);assert.equal(drone.drones.length,0);assert.equal(drone.guns[4].ammo,2);
});
test('server replay accepts skill input only through server-fixed entitlement',()=>{
  const state=createNightReplay('campaign','corridor-01'),sim=Simulation.restore(state.simulation);
  sim.applyLoadout({version:GROWTH_VERSION,level:6,effects:['tracking'],skipped:[]});state.simulation=sim.checkpoint();
  applyNightReplay(state,[{input:{command:'useSkill',args:[]},ticks:0},{input:{},ticks:2}]);
  assert.equal(state.assisted,false);assert.equal(state.simulation.skill.readyAt,110);
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

test('all regular weapons retain their primary trajectory and one-charge cadence with a bounded secondary budget',()=>{
  for(const effects of [[],['burst'],['twin'],['burst','twin']] as Effect[][])for(let weapon=0;weapon<4;weapon++){
    const base=setup([]),sim=setup(effects);
    for(const actor of [base,sim]){actor.choose(weapon);actor.setAim({x:-80,z:-40});actor.guns[weapon].ammo=1;assert(actor.fire());}
    const primary=sim.shots[0],plain=base.shots[0];
    assert.deepEqual(primary.origin,plain.origin);assert.deepEqual(primary.velocity,plain.velocity);assert.equal(primary.due,plain.due);
    assert.equal(primary.damageMultiplier,1);assert.equal(sim.guns[weapon].ammo,0);assert.equal(sim.ammoSpent,1);
    assert.equal(sim.guns[weapon].heat,base.guns[weapon].heat);assert.equal(sim.guns[weapon].cooldown,base.guns[weapon].cooldown);
    const budget=sim.shots.reduce((sum,shot)=>sum+shot.damageMultiplier!,0);
    assert(Math.abs(budget-(effects.length===2?2.8:effects.length===1?1.6:1))<1e-8);
    const preview=attackPreview(effects);assert.equal(preview.shots,sim.shots.length);
    assert(sim.shots.slice(1).every(shot=>shot.strength===preview.secondaryStrength));
  }
});

test('tracking never multiplies one ammo into four full-damage hits',()=>{
  const sim=setup(['burst','twin','tracking']);sim.height=()=>0;sim.choose(2);
  const enemy=sim.units.find(u=>!u.friendly)!;enemy.y=0;enemy.hp=1000;sim.setAim(enemy);
  assert(sim.useSkill());assert(sim.fire());
  while(sim.shots.length&&sim.time<20)sim.step(1/60);
  assert.equal(sim.shots.length,0);assert(Math.abs(1000-enemy.hp-WEAPONS[2].damage*2.8)<1e-6);
  assert.equal(sim.ammoSpent,1);assert.equal(sim.hitShots,4);
});

test('accelerated bursts stay within their cycle, preserve heat rate and resume delayed events once',()=>{
  const base=setup([]),sim=setup(['burst','twin']);
  for(const actor of [base,sim]){actor.loadout.level=15;actor.buff={kind:'rate',remaining:60};actor.choose(0);actor.setAim({x:-80,z:-40});actor.setFire('held',true);}
  const delay=sim.shots[2].born-sim.shots[0].born;
  assert(delay>0&&delay<sim.guns[0].cooldown&&delay<.1);
  sim.pause('manual',true);const before=sim.checkpoint();sim.step(.1);assert.deepEqual(sim.checkpoint(),before);sim.pause('manual',false);sim.setFire('held',true);
  for(let i=0;i<12;i++){base.step(1/60);sim.step(1/60);}
  for(const actor of [base,sim])actor.setFire('held',false);
  assert.equal(sim.ammoSpent,base.ammoSpent);assert.equal(sim.fired,base.fired*4);assert.equal(sim.guns[0].heat,base.guns[0].heat);
  const restored=Simulation.restore(sim.checkpoint());for(let i=0;i<10;i++){sim.step(1/60);restored.step(1/60);}
  assert.deepEqual(restored.checkpoint(),sim.checkpoint());assert.equal(sim.events.filter(event=>event.type==='shot').length,sim.fired);
});

test('incendiary secondaries widen short-lived coverage within 160/280 percent fuel and never stack burn damage',()=>{
  for(const effects of [['burst'],['twin'],['burst','twin']] as Effect[][]){
    const sim=setup(effects);sim.height=()=>0;sim.choose(3);sim.setAim({x:-80,z:-40});assert(sim.fire());
    const projectiles=[...sim.shots],end=Math.max(...projectiles.map(shot=>shot.due))+.02;
    while(sim.time<end)sim.step(1/60);
    assert.equal(sim.fireZones.length,projectiles.length);
    const primary=sim.fireZones.find(zone=>zone.id===projectiles[0].id)!;
    assert.equal(primary.radius,WEAPONS[3].radius);assert.equal(primary.expires-primary.born,FIRE_ZONE.duration);
    const fuel=sim.fireZones.reduce((sum,zone)=>sum+zone.expires-zone.born,0);
    assert(Math.abs(fuel-FIRE_ZONE.duration*(effects.length===2?2.8:1.6))<1e-8);
    const side=sim.fireZones.find(zone=>zone.id===projectiles[1].id)!,dx=side.x-primary.x,dz=side.z-primary.z,range=Math.hypot(dx,dz);
    const edge={x:primary.x+dx/range*(primary.radius+range*.5),z:primary.z+dz/range*(primary.radius+range*.5)};
    assert(Math.hypot(edge.x-side.x,edge.z-side.z)<side.radius);
    assert(Math.hypot(edge.x-primary.x,edge.z-primary.z)>primary.radius);
    const unit=sim.addUnit('turret',primary);Object.assign(unit,{x:primary.x,z:primary.z,y:0,hp:1000});
    const hp=unit.hp;sim.step(.1);assert(Math.abs(hp-unit.hp-FIRE_ZONE.damagePerSecond*.1)<1e-8);
    const expires=Math.max(...sim.fireZones.filter(zone=>zone!==primary).map(zone=>zone.expires));
    while(sim.time<=expires+.02)sim.step(1/60);
    assert.deepEqual(sim.fireZones.map(zone=>zone.id),[primary.id]);
  }
});

test('ammo counters migrate old checkpoints per pilot and ranked participation counts attacks, not projectiles',()=>{
  const sim=setup(['burst','twin']);sim.choose(1);sim.setAim({x:-80,z:-40});assert(sim.fire());
  const old=sim.checkpoint();delete (old as Partial<typeof old>).ammoSpent;
  old.duelStats[0].fired=7;old.duelStats[1].fired=11;
  for(const stats of old.duelStats)delete (stats as Partial<typeof stats>).ammoSpent;
  const restored=Simulation.restore(old);assert.equal(restored.ammoSpent,4);assert.deepEqual(restored.duelStats.map(stats=>stats.ammoSpent),[7,11]);
  sim.hitShots=1;assert(!nightReplayResult({simulation:sim.checkpoint(),assisted:false}).participated);
  for(let i=0;i<2;i++){sim.guns[1].cooldown=0;assert(sim.fire());}
  assert(nightReplayResult({simulation:sim.checkpoint(),assisted:false}).participated);
  const duel=configureDuel(createDuel(11),[0,1].map(()=>({version:GROWTH_VERSION,level:1,effects:['burst','twin'],skipped:[]})));
  commandDuel(duel,0,[{command:'fire',args:[]}]);assert.equal(viewDuel(duel,0).simulation.ammoSpent,1);assert.equal(viewDuel(duel,1).simulation.ammoSpent,0);
  commandDuel(duel,1,[{command:'fire',args:[]}]);assert.equal(viewDuel(duel,0).simulation.ammoSpent,1);assert.equal(viewDuel(duel,1).simulation.ammoSpent,1);
});


test('drone formation attacks distinct targets beyond the old budget, then crashes without damage',()=>{
  const sim=setup(['drone']);sim.height=()=>0;sim.units=sim.units.filter(u=>u.friendly);
  const targets=[-15,0,15].map(x=>sim.addUnit('turret',{x,z:-40}));
  for(const target of targets){target.hp=target.maxHp=1000;target.y=0;target.attack=999;}
  sim.choose(4);assert(sim.fire());
  assert.equal(new Set(sim.drones.map(d=>d.x+','+d.z)).size,3);
  for(const drone of sim.drones)Object.assign(drone,{x:0,z:-40,y:16,nextAttack:0});
  for(let i=0;i<80;i++)sim.step(.1);
  assert.equal(sim.drones.length,3);assert.equal(new Set(sim.drones.map(d=>d.target)).size,3);
  assert(targets.every(t=>t.hp<976),'every drone keeps attacking beyond four old hits');
  assert.equal(new Set(sim.drones.map(d=>d.x+','+d.z)).size,3);
  sim.time=12;const hp=targets.map(t=>t.hp),y=sim.drones.map(d=>d.y),budget=sim.drones.map(d=>d.budget);
  sim.step(.1);assert(sim.drones.every((d,i)=>d.y<y[i]&&d.budget===budget[i]&&d.target===undefined));
  assert.deepEqual(targets.map(t=>t.hp),hp);
  const restored=Simulation.restore(sim.checkpoint());restored.height=()=>0;
  sim.pause('manual',true);const frozen=sim.drones.map(d=>({...d}));sim.step(.1);assert.deepEqual(sim.drones,frozen);sim.pause('manual',false);
  for(let i=0;i<20;i++){sim.step(.1);restored.step(.1);}
  assert.equal(sim.drones.length,0);assert.deepEqual(restored.drones,sim.drones);
  assert.deepEqual(targets.map(t=>t.hp),hp);assert.deepEqual(restored.units.map(u=>u.hp),sim.units.map(u=>u.hp));
  assert.equal(sim.events.filter(e=>e.type==='impact'&&e.weapon===4&&e.damage===undefined).length,3);
});

test('EMP lasts fifteen seconds and pauses without shortening the effect',()=>{
  const sim=setup(['emp']),unit=sim.addUnit('light',{x:-80,z:-40});
  assert(sim.useSkill());assert.equal(sim.skillRemaining,15);assert.equal(sim.skillCooldown,75);
  sim.time=10.5;const position={x:unit.x,z:unit.z};sim.step(.1);
  assert.deepEqual({x:unit.x,z:unit.z},position);assert(sim.skillRemaining>1);
  sim.pause('manual',true);const remaining=sim.skillRemaining;sim.step(.1);assert.equal(sim.skillRemaining,remaining);sim.pause('manual',false);
  sim.time=15.1;sim.step(.1);assert.equal(sim.skillRemaining,0);assert.notDeepEqual({x:unit.x,z:unit.z},position);
  assert(CATALOG.filter(p=>p.effect==='emp').every(p=>p.name.includes('电磁干扰')&&p.description.includes('15 秒')));
});


test('high-altitude drones without legal targets finish crashing before the next launch is ready',()=>{
  const sim=setup(['drone']);sim.units=sim.units.filter(u=>u.friendly);sim.addUnit('turret',PROTECTED[0]);
  sim.aircraft.y=230;sim.choose(4);assert(sim.fire());
  for(let i=0;i<200;i++)sim.step(.1);
  assert.equal(sim.drones.length,0);assert.equal(sim.guns[4].cooldown,0);assert(sim.fire());assert.equal(sim.drones.length,3);
});


test('reward curves keep first-clear bonuses finite and milestones balanced',()=>{
  assert.equal(ECONOMY.campaign.length,120);
  assert.deepEqual(RECIPES.map(r=>[r.effect,r.match,r.permanent]),[['drone',10,120],['laser',12,160],['tracking',4,20],['emp',6,40]]);
  assert.throws(()=>campaignReward(0));assert.throws(()=>campaignReward(121));
  let coins=0,xp=0,weapon=0,skill=0;
  for(let level=1;level<=120;level++){
    const first=campaignReward(level,true),repeat=campaignReward(level);
    assert.equal(first.fragments-repeat.fragments,4);
    if(first.fragment==='fragment:weapon'||levelProgress(xp).level>=10)weapon+=first.fragments;else skill+=first.fragments;
    coins+=first.coins;xp+=first.xp;
    if(level===10)assert.deepEqual([coins,xp,weapon,skill],[4275,2670,30,30]);
    if(level===30)assert.deepEqual([coins,xp,weapon,skill],[17325,9810,96,84]);
  }
  assert.deepEqual([coins,xp,weapon,skill],[150300,71640,636,84]);
});

test('crafting then selling never beats selling the materials directly',()=>{
  for(const recipe of RECIPES){
    const product=CATALOG.find(p=>p.effect===recipe.effect&&p.term==='match');assert(product);
    assert(product.sell<=recipe.match*ECONOMY.fragmentSell,recipe.effect+' must not create a recycling arbitrage');
    assert(recipe.permanent>recipe.match,'permanent unlock remains a longer-term collection target');
  }
});


test('tracking has the same 20-second window at every level and expires before reuse',()=>{
  for(const level of [5,6,10,15,50]){
    const sim=setup(['tracking']);sim.applyLoadout({version:GROWTH_VERSION,level,effects:['tracking'],skipped:[]});
    assert(sim.useSkill());assert.equal(sim.skillRemaining,20);assert.equal(sim.skill.readyAt,110);
    sim.time=19.99;assert(sim.trackingActive);sim.time=20;assert(!sim.trackingActive);assert(!sim.useSkill());
    sim.time=109.99;assert(!sim.useSkill());sim.time=110;assert(sim.useSkill());assert.equal(sim.skill.activeUntil,130);
  }
});
