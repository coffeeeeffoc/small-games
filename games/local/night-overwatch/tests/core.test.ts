import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import {
  WEAPONS,
  FLIGHT,
  MAP,
  ROUTE,
  HOLD_POINTS,
  MISSION,
  ROUTE_LENGTH,
  PROTECTED,
  UNITS,
  distance,
  patrolPoint,
  routePoint,
  validateData,
} from '../assets/scripts/core/Data.ts';
import { ACTIONS, TUTORIAL } from '../assets/scripts/core/Actions.ts';
const tick = (s: Simulation, seconds: number) => {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) s.step(1 / 60);
};
const settle = (s: Simulation) => tick(s, Math.max(0, ...s.shots.map((shot) => shot.due - s.time)) + 0.05);
const start = () => {
  const s = new Simulation();
  s.start();
  s.setAim({ x: -42, z: -25 });
  return s;
};
test('mission data and ActionRegistry have unique identifiers, bindings and real tutorial events', () => {
  validateData();
  assert.equal(new Set(ACTIONS.map((a) => a.id)).size, ACTIONS.length);
  const keys = ACTIONS.flatMap((a) => [...a.keys]);
  assert.equal(new Set(keys).size, keys.length);
  assert(TUTORIAL.includes('hit'));
  assert.equal(MISSION.events.length, 24);
  assert(ROUTE_LENGTH / MISSION.speed > 100);
});
test('rapid overheats, switching preserves heat, all guns cool and unlock only at 40', () => {
  const s = start();
  s.setFire('mouse', true);
  for (let i = 0; i < 300 && !s.guns[0].overheated; i++) s.step(1 / 60);
  assert(s.guns[0].overheated);
  assert.equal(s.reason(), 'overheated');
  const heat = s.guns[0].heat;
  s.choose(1);
  assert.equal(s.guns[0].heat, heat);
  assert.equal(s.held.size, 0);
  tick(s, 1);
  assert(s.guns[0].overheated);
  tick(s, 3);
  assert(!s.guns[0].overheated);
  assert(s.guns[0].heat < 40);
});
test('heavy fires once per press, respects reload and finite ammunition', () => {
  const s = start();
  s.units = s.units.filter((u) => u.friendly);
  s.convoy = 'holding';
  s.choose(2);
  s.setFire('mouse', true);
  s.setFire('mouse', true);
  tick(s, 4);
  assert.equal(s.fired, 1);
  assert.equal(s.guns[2].ammo, WEAPONS[2].ammo - 1);
  s.setFire('mouse', false);
  s.setFire('mouse', true);
  assert.equal(s.fired, 2);
  s.setFire('mouse', false);
  s.setFire('mouse', true);
  assert.equal(s.fired, 2);
  for (let i = 0; i < WEAPONS[2].ammo - 2; i++) {
    tick(s, 3.1);
    s.setFire('mouse', false);
    s.setFire('mouse', true);
  }
  assert.equal(s.guns[2].ammo, 0);
  assert.equal(s.reason(), 'empty');
});
test('burst repeats at its own cadence and cannot bypass cooldown by switching', () => {
  const s = start();
  s.choose(1);
  s.setFire('space', true);
  tick(s, 1.7);
  assert.equal(s.fired, 3);
  s.choose(0);
  s.choose(1);
  assert.equal(s.reason(), 'cooldown');
});
test('launch snapshots aim; moving out before impact avoids damage; impacts are consumed once', () => {
  const s = start();
  s.units = s.units.filter((u) => u.friendly);
  const enemy = s.addUnit('turret', { x: 0, z: -20 });
  s.setAim(enemy);
  s.choose(1);
  s.fire();
  s.setAim({ x: 40, z: 25 });
  assert.equal(s.shots[0].x, 0);
  enemy.x = 10;
  settle(s);
  assert.equal(enemy.hp, 90);
  s.setAim(enemy);
  tick(s, 0.4);
  s.fire();
  settle(s);
  assert.equal(enemy.hp, 55);
  tick(s, 0.2);
  assert.equal(enemy.hp, 55);
  assert.equal(s.shots.length, 0);
});
test('blast damages several units once each, armor resists rapid fire', () => {
  const s = start();
  s.units = s.units.filter((u) => u.friendly);
  const a = s.addUnit('turret', { x: 0, z: -20 }),
    b = s.addUnit('turret', { x: 1, z: -20 });
  s.setAim(a);
  s.choose(1);
  s.fire();
  settle(s);
  assert.equal(a.hp, 55);
  assert.equal(b.hp, 55);
  const heavy = s.addUnit('heavy', { x: 25, z: -20 });
  s.addUnit('escort', { x: 25, z: -30 }, true); // Keep this armor test stationary.
  s.choose(0);
  s.setAim(heavy);
  s.fire();
  settle(s);
  assert.equal(heavy.hp, 178.4);
});
test('protection rejects overlapping blast and its tangent without consuming ammo', () => {
  const s = start();
  s.choose(2);
  const z = PROTECTED[0];
  s.setAim({ x: z.x + z.radius + WEAPONS[2].radius, z: z.z });
  assert.equal(s.reason(), 'protected');
  assert.equal(s.fire(), false);
  assert.equal(s.guns[2].ammo, WEAPONS[2].ammo);
  s.setAim({ x: z.x + z.radius + WEAPONS[2].radius + 0.01, z: z.z });
  assert.equal(s.reason(), 'ready');
});
test('ordinary friendlies warn but do take damage; training immunity is explicit', () => {
  const s = start();
  s.units = s.units.filter((u) => u.friendly);
  s.convoy = 'holding';
  s.choose(2);
  s.setAim(s.rescue);
  assert(s.friendlyRisk);
  assert(s.fire());
  settle(s);
  assert(s.friendlyDamage >= 140);
  assert.equal(s.rescue.hp, UNITS.rescue.hp - WEAPONS[2].damage);
  const training = start();
  training.units = training.units.filter((u) => u.friendly);
  training.convoy = 'holding';
  training.training = true;
  training.choose(2);
  training.setAim(training.rescue);
  training.fire();
  settle(training);
  assert.equal(training.rescue.hp, UNITS.rescue.hp);
});
test('hold request stops at next marker; time and events keep advancing; continue does not reset route', () => {
  const s = start();
  s.units.forEach((u) => {
    if (!u.friendly) u.hp = 0;
  });
  s.command();
  assert.equal(s.convoy, 'holdRequested');
  assert(!s.completed.has('continue'));
  while (s.progress < HOLD_POINTS[0] && s.phase === 'playing') {
    s.step(1 / 60);
    s.units.forEach((u) => {
      if (!u.friendly) u.hp = 0;
    });
  }
  assert.equal(s.convoy, 'holding');
  assert.equal(s.progress, HOLD_POINTS[0]);
  const time = s.time;
  tick(s, 4);
  assert(s.time > time);
  assert.equal(s.progress, HOLD_POINTS[0]);
  s.command();
  assert.equal(s.convoy, 'moving');
  assert(s.completed.has('continue'));
  tick(s, 1);
  assert(s.progress > HOLD_POINTS[0]);
});
test('pause reasons compose, freeze every rule clock and clear held fire', () => {
  const s = start();
  s.setFire('mouse', true);
  s.pause('manual', true);
  s.pause('help', true);
  const frozen = JSON.stringify({ time: s.time, guns: s.guns, shots: s.shots, units: s.units });
  tick(s, 4);
  s.pause('help', false);
  tick(s, 3);
  assert.equal(
    JSON.stringify({ time: s.time, guns: s.guns, shots: s.shots, units: s.units }),
    frozen,
  );
  assert.equal(s.held.size, 0);
  s.pause('manual', false);
  tick(s, 0.2);
  assert.equal(s.fired, 1);
});
test('separate trigger sources do not double-fire and releasing one leaves the other active', () => {
  const s = start();
  s.setFire('touch:1', true);
  s.setFire('space', true);
  assert.equal(s.fired, 1);
  s.setFire('touch:1', false);
  tick(s, 0.3);
  assert(s.fired > 1);
  s.clearInput();
  const count = s.fired;
  settle(s);
  assert.equal(s.fired, count);
});
test('critical destruction fails before arrival; timeout fails; fresh retry has no leftovers', () => {
  const s = start();
  s.progress = ROUTE_LENGTH - 0.001;
  s.rescue.hp = 0;
  s.step(1 / 60);
  assert.equal(s.phase, 'failure');
  assert.equal(s.failure, 'vehicle');
  assert.equal(s.failedGroup, 0);
  const t = start();
  t.time = MISSION.duration - 0.001;
  t.step(1 / 60);
  assert.equal(t.failure, 'timeout');
  const fresh = new Simulation();
  assert.equal(fresh.time, 0);
  assert.equal(fresh.units.length, 12);
  assert.equal(fresh.shots.length, 0);
  assert.equal(fresh.guns[2].ammo, WEAPONS[2].ammo);
  assert.equal(fresh.pauses.size, 0);
  assert.equal(fresh.failedGroup, undefined);
});
test('prediction and finite ammunition can clear all 24 threats while all four friendly groups survive', (t) => {
  const s = start();
  const used = new Set<number>();
  const pending = new Map<number, { unit: number; damage: number }>();
  for (let n = 0; n < MISSION.duration * 60 && s.phase === 'playing'; n++) {
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
        if (enemy.kind === 'light') aim = patrolPoint(enemy.origin, s.time - enemy.born + flight);
        if (enemy.kind === 'heavy') {
          const ally = target.routeOffset === undefined ? target : routePoint(s.progress + target.routeOffset + MISSION.speed * flight);
          const range = distance(enemy, ally), move = Math.min(UNITS.heavy.speed * flight, Math.max(0, range - 12));
          aim = { x: enemy.x + (ally.x - enemy.x) * move / range, z: enemy.z + (ally.z - enemy.z) * move / range };
        }
      }
      s.setAim(aim);
      if (s.friendlyRisk || !s.fire()) continue;
      used.add(gun);
      pending.set(s.shots.at(-1)!.id, { unit: enemy.id, damage: WEAPONS[gun].damage * (enemy.kind === 'heavy' ? WEAPONS[gun].armor : 1) });
      break;
    }
    s.step(1 / 60);
  }
  t.diagnostic(JSON.stringify({ time: s.time, phase: s.phase, kills: s.kills, ammo: s.guns.map((g) => g.ammo),
    friendlyHp: s.units.filter((u) => u.friendly).map((u) => u.hp), friendlyDamage: s.friendlyDamage, rating: s.rating,
    remaining: s.units.filter((u) => !u.friendly && u.hp > 0).map((u) => ({ kind: u.kind, hp: u.hp })) }));
  assert.equal(s.phase, 'success');
  assert.equal(s.convoy, 'arrived');
  assert.equal(s.spawned.size, MISSION.events.length);
  assert.equal(s.kills + s.friendlyKills, MISSION.events.length);
  assert.equal(s.friendlyDamage, 0);
  assert.equal(s.friendlyLosses, 0);
  assert.equal(s.threatsRemaining, 0);
  assert.equal(s.training, false);
  assert.equal(s.failedGroup, undefined);
  assert.equal(used.size, 3);
  assert.equal(s.rating, 'S');
});

// Aiming feedback and map limits use the same simulation values as firing.
test('expanded route, friendly identification and launch position remain consistent', () => {
  const s = start();
  assert(ROUTE.length >= 16 && ROUTE_LENGTH > 240);
  s.setAim({ x: MAP.halfWidth - 1, z: 0 });
  assert.equal(s.reason(), 'ready');
  s.setAim({ x: MAP.halfWidth + 0.01, z: 0 });
  assert.equal(s.reason(), 'outside');
  s.choose(2);
  s.setAim(s.rescue);
  assert.equal(s.aimedUnit?.id, s.rescue.id);
  assert(s.friendlyRisk);
  const flight = s.flightTime();
  s.fire();
  assert.equal(s.reason(), 'cooldown');
  assert(s.friendlyRisk, 'reload must not hide the friendly warning');
  const launch = JSON.stringify(s.shots[0]);
  tick(s, 0.1);
  s.setAim({ x: 5, z: 30 });
  assert.equal(JSON.stringify(s.shots[0]), launch);
  assert.equal(s.shots[0].due - s.shots[0].born, flight);
  assert.equal(s.shots[0].origin.y, FLIGHT.altitude + FLIGHT.muzzle.y);
});

test('impact feedback describes actual damage and lethal rescue damage keeps its source', () => {
  const s = start();
  s.convoy = 'holding';
  s.units = s.units.filter((u) => u.friendly);
  const turret = s.addUnit('turret', { x: 0, z: -20 });
  s.choose(1);
  s.fire();
  settle(s);
  assert.equal(s.events.filter((e) => e.type === 'impact').at(-1)?.outcome, 'miss');
  tick(s, 0.3);
  s.setAim(turret);
  s.fire();
  settle(s);
  const hit = s.events.filter((e) => e.type === 'impact').at(-1)!;
  assert.equal(hit.outcome, 'hit');
  assert.equal(hit.damage, 35);
  s.choose(2);
  while (s.phase === 'playing') {
    s.setAim(s.rescue);
    assert(s.fire());
    settle(s);
  }
  assert.equal(s.phase, 'failure');
  assert.equal(s.failureCause, 'friendly');
  assert.equal(s.failedGroup, 0);
  assert(s.rescueDamage.friendly > s.rescueDamage.enemy);
  const enemy = start();
  enemy.units = enemy.units.filter((u) => u.friendly);
  enemy.convoy = 'holding';
  enemy.rescue.hp = UNITS.turret.damage * MISSION.friendlyArmor;
  enemy.addUnit('turret', { x: enemy.rescue.x - 8, z: enemy.rescue.z });
  tick(enemy, MISSION.duration);
  assert.equal(enemy.failureCause, 'enemy');
  assert.equal(enemy.failedGroup, 0);
  assert.equal(enemy.rescueDamage.friendly, 0);
  assert.equal(
    Object.values(enemy.damageByThreat).reduce((sum, damage) => sum + damage, 0),
    enemy.rescueDamage.enemy,
  );
  assert((enemy.damageByThreat.turret || 0) > 0, 'debrief attributes actual incoming damage');
});
