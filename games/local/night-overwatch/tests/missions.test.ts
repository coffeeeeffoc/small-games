import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, nextMission, missionDefinition } from '../assets/scripts/core/MissionCatalog.ts';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import { MISSION, WEAPONS, UNITS, distance, patrolPoint, routePoint } from '../assets/scripts/core/Data.ts';
const tick = (s: Simulation, seconds: number) => {
  for (let n = 0; n < Math.ceil(seconds * 60); n++) s.step(1 / 60);
};

test('mission combinations change deployment and motion while preserving weapon and escort rules', () => {
  const standard = new Simulation(); standard.start();
  assert.equal(standard.spawned.size, 24);
  assert.equal(standard.mission.events, MISSION.events, 'existing default mission is unchanged');
  const ambush = new Simulation('ambush-02'); ambush.start(); ambush.convoy = 'holding';
  assert.equal(ambush.spawned.size, 8);
  assert.equal(ambush.threatsRemaining, 24, 'unspawned waves still count toward mission completion');
  tick(ambush, 69);
  assert.equal(ambush.spawned.size, 8);
  ambush.pause('manual', true); tick(ambush, 10);
  assert.equal(ambush.spawned.size, 8, 'pausing cannot spawn reinforcements');
  ambush.pause('manual', false); tick(ambush, 1.1);
  assert.equal(ambush.spawned.size, 16, 'holding cannot indefinitely postpone the next wave');
  const patrol = new Simulation('patrol-03'); patrol.start();
  assert.equal(patrol.units.filter((u) => !u.friendly && u.kind === 'turret').length, 0);
  assert.equal(patrol.units.filter((u) => !u.friendly && u.kind === 'heavy').length, 3);
  const rover = patrol.units.find((u) => !u.friendly && u.kind === 'light')!;
  const initial = { x: rover.x, z: rover.z }; tick(patrol, 1);
  assert(distance(initial, rover) > 0.5);
  for (const s of [ambush, patrol]) {
    assert(Math.abs(s.routeLength / s.mission.speed - 240) < 1e-8);
    assert.equal(s.mission.duration, standard.mission.duration);
    assert.equal(s.rescue.maxHp, standard.rescue.maxHp);
    assert.equal(s.guns[2].ammo, WEAPONS[2].ammo);
  }
  assert.equal(nextMission(nextMission(nextMission('corridor-01'))), 'corridor-01');
  assert.equal(missionDefinition('old-or-damaged-preference').id, 'corridor-01');
});

for (const mission of MISSIONS.slice(1)) test(`${mission.name[0]} can be completed with finite ammunition and every friendly group surviving`, (t) => {
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
      const gun = enemy.kind === 'heavy' && s.guns[2].ammo > 0 ? 2 : enemy.kind === 'light' ? 0 : 1;
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
      if (s.friendlyRisk || !s.fire()) continue;
      pending.set(s.shots.at(-1)!.id, { unit: enemy.id, damage: WEAPONS[gun].damage * (enemy.kind === 'heavy' ? WEAPONS[gun].armor : 1) });
      break;
    }
    s.step(1 / 60);
  }
  t.diagnostic(JSON.stringify({ mission: mission.id, phase: s.phase, time: s.time, kills: s.kills,
    fired: s.fired, friendlyDamage: s.friendlyDamage, ammo: s.guns.map((g) => g.ammo) }));
  assert.equal(s.phase, 'success');
  assert.equal(s.threatsRemaining, 0);
  assert.equal(s.spawned.size, 24);
  assert.equal(s.friendlyDamage, 0);
  assert.equal(s.friendlyLosses, 0);
  assert.equal(s.training, false);
  assert(s.guns.every((gun) => gun.ammo >= 0));
});
