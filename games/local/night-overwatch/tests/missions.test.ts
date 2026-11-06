import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, nextMission, missionDefinition } from '../assets/scripts/core/MissionCatalog.ts';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import { MISSION, WEAPONS, UNITS, distance, patrolPoint, routePoint } from '../assets/scripts/core/Data.ts';
const tick = (s: Simulation, seconds: number) => {
  for (let n = 0; n < Math.ceil(seconds * 60); n++) s.step(1 / 60);
};

test('introductory missions use fewer stationary targets in daylight before dusk and night', () => {
  assert.deepEqual(MISSIONS.slice(0, 6).map(m => m.events.length), [16, 24, 32, 36, 40, 44]);
  assert.deepEqual(MISSIONS.slice(0, 7).map(m => m.light), ['day', 'day', 'day', 'dusk', 'dusk', 'night', 'day']);
  for (const mission of MISSIONS.slice(0, 3)) {
    const sim = new Simulation(mission.id); sim.start();
    assert.equal(sim.selected, 1);
    assert.equal(sim.spawned.size, mission.events.length);
    assert(mission.events.every(e => e.kind === 'turret'||e.kind==='infantry'));
    const before = sim.units.filter(u => !u.friendly).map(u => [u.x, u.z]); tick(sim, 1);
    assert.deepEqual(sim.units.filter(u => !u.friendly).map(u => [u.x, u.z]), before);
    assert.equal(sim.rescue.maxHp, UNITS.rescue.hp);
    assert.equal(sim.guns[1].ammo, WEAPONS[1].ammo);
  }
  const ambush = new Simulation('operation-008'); ambush.start(); ambush.convoy = 'holding';
  const initial=ambush.mission.events.filter(e=>e.time===0).length;
  assert.equal(ambush.spawned.size, initial);
  assert.equal(ambush.threatsRemaining, ambush.mission.events.length);
  ambush.pause('manual', true); tick(ambush, 80); assert.equal(ambush.spawned.size, initial);
  ambush.pause('manual', false); tick(ambush, 36.1); assert.equal(ambush.spawned.size, ambush.mission.events.length);
  assert.equal(nextMission('patrol-03'), 'operation-004');
  assert.equal(nextMission(MISSIONS.at(-1)!.id), MISSIONS.at(-1)!.id);
  assert.equal(missionDefinition('old-preference').id, 'corridor-01');
});
test('campaign grows monotonically with bounded waves and active contacts',()=>{
  assert.equal(MISSIONS.at(-1)!.events.length,144);
  MISSIONS.forEach((m,i)=>{if(i)assert(m.events.length>=MISSIONS[i-1].events.length);const waves=new Map<number,number>();for(const e of m.events.filter(e=>e.kind!=='infantry'))waves.set(e.time,(waves.get(e.time)||0)+1);if(i>=5)assert([...waves.values()].every(n=>n<=18));});
  const active=(s:Simulation)=>s.units.filter(u=>!u.friendly&&u.hp>0);
  for(const trigger of ['time','progress']){
    const s=new Simulation(MISSIONS.at(-1)!.id);s.start();s.convoy='holding';
    if(trigger==='time')s.time=250;else s.progress=1e5;
    s.step(1/60);assert.equal(active(s).length,72);assert.equal(s.mission.events.length-s.spawned.size,72);
    const spawned=s.spawned.size;s.step(1/60);assert.equal(s.spawned.size,spawned);
    active(s).find(u=>u.kind!=='infantry')!.hp=0;s.step(1/60);assert.equal(s.spawned.size,spawned+1);assert.equal(active(s).length,72);
    s.pause('manual',true);active(s).find(u=>u.kind!=='infantry')!.hp=0;s.step(1/60);assert.equal(s.spawned.size,spawned+1);
    s.pause('manual',false);s.step(1/60);assert.equal(s.spawned.size,spawned+2);assert.equal(active(s).length,72);
  }
});

for (const mission of MISSIONS) test(`${mission.name[0]} can be completed with basic weapons without resupply and every friendly group surviving`, (t) => {
  const s = new Simulation(mission.id); s.start();
  const pending = new Map<number, { unit: number; damage: number }>();
  for (let n = 0; n < s.mission.duration * 60 && s.phase === 'playing'; n++) {
    for (const id of pending.keys()) if (!s.shots.some((shot) => shot.id === id)) pending.delete(id);
    const friends = s.units.filter((u) => u.friendly && u.hp > 0);
    const enemies = s.units.filter((u) => !u.friendly && u.hp > 0).sort((a, b) =>
      Math.min(...friends.map((f) => distance(a, f))) - Math.min(...friends.map((f) => distance(b, f))));
    for (const enemy of enemies) {
      const inbound = [...pending.values()].filter((p) => p.unit === enemy.id).reduce((sum, p) => sum + p.damage, 0);
      if (inbound >= enemy.hp - 1e-6) continue;
      const gun = enemy.kind === 'heavy' && s.guns[2].ammo > 0 ? 2 : enemy.kind === 'light'||enemy.kind==='infantry' ? 0 : 1;
      s.choose(gun);
      let aim = { x: enemy.x, z: enemy.z };
      const target = friends.reduce((a, b) => distance(enemy, a) < distance(enemy, b) ? a : b);
      for (let iteration = 0; iteration < 8; iteration++) {
        const flight = s.flightTime(gun, aim);
        if (enemy.kind === 'light') aim = patrolPoint(enemy.origin, s.time - enemy.born + flight, s.mission.map);
        if (enemy.kind === 'heavy') {
          const ally = target.routeOffset === undefined ? target : s.routePoint(s.progress + target.routeOffset + s.mission.speed * flight);
          const range = distance(enemy, ally), move = Math.min(UNITS.heavy.speed * flight, Math.max(0, range - 12));
          aim = { x: enemy.x + (ally.x - enemy.x) * move / range, z: enemy.z + (ally.z - enemy.z) * move / range };
        }
      }
      s.setAim(aim);
      const flight = s.flightTime(gun, aim);
      if (friends.some(friend => distance(aim, friend.routeOffset === undefined ? friend
        : s.routePoint(s.progress + friend.routeOffset + s.mission.speed * flight)) <= WEAPONS[gun].radius + UNITS[friend.kind].radius + .1)) continue;
      if (s.friendlyRisk || !s.fire()) continue;
      pending.set(s.shots.at(-1)!.id, { unit: enemy.id, damage: WEAPONS[gun].damage * (enemy.kind === 'heavy' ? WEAPONS[gun].armor : 1) });
      break;
    }
    s.step(1 / 60);
    assert(s.units.filter(u=>!u.friendly&&u.hp>0).length<=72);assert(s.units.filter(u=>!u.friendly&&u.hp>0&&u.kind!=='infantry').length<=24);
  }
  t.diagnostic(JSON.stringify({ mission: mission.id, phase: s.phase, time: s.time, kills: s.kills,
    fired: s.fired, friendlyDamage: s.friendlyDamage, ammo: s.guns.map((g) => g.ammo) }));
  assert.equal(s.phase, 'success');
  assert.equal(s.threatsRemaining, 0);
  assert.equal(s.spawned.size, mission.events.length);
  assert.equal(s.friendlyDamage, 0);
  assert.equal(s.friendlyLosses, 0);
  assert.equal(s.training, false);
  assert(s.guns.every((gun) => gun.ammo >= 0));
});
