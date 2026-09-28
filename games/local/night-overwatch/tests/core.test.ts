import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import {
  WEAPONS,
  MAP,
  ROUTE,
  HOLD_POINTS,
  MISSION,
  ROUTE_LENGTH,
  PROTECTED,
  validateData,
} from '../assets/scripts/core/Data.ts';
import { ACTIONS, TUTORIAL } from '../assets/scripts/core/Actions.ts';
const tick = (s: Simulation, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) s.step(1 / 60);
};
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
  assert(!keys.includes(70) && !keys.includes(71));
  assert(TUTORIAL.includes('hit'));
  assert(MISSION.events.length < 20);
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
  s.choose(2);
  s.setFire('mouse', true);
  s.setFire('mouse', true);
  tick(s, 4);
  assert.equal(s.fired, 1);
  assert.equal(s.guns[2].ammo, 5);
  s.setFire('mouse', false);
  s.setFire('mouse', true);
  assert.equal(s.fired, 2);
  s.setFire('mouse', false);
  s.setFire('mouse', true);
  assert.equal(s.fired, 2);
  for (let i = 0; i < 4; i++) {
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
  tick(s, WEAPONS[1].flight + 0.05);
  assert.equal(enemy.hp, 90);
  s.setAim(enemy);
  tick(s, 0.4);
  s.fire();
  tick(s, WEAPONS[1].flight + 0.05);
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
  tick(s, WEAPONS[1].flight + 0.05);
  assert.equal(a.hp, 55);
  assert.equal(b.hp, 55);
  const heavy = s.addUnit('heavy', { x: 25, z: -20 });
  s.choose(0);
  s.setAim(heavy);
  s.fire();
  tick(s, WEAPONS[0].flight + 0.05);
  assert.equal(heavy.hp, 178.4);
});
test('protection rejects overlapping blast and its tangent without consuming ammo', () => {
  const s = start();
  s.choose(2);
  const z = PROTECTED[0];
  s.setAim({ x: z.x + z.radius + WEAPONS[2].radius, z: z.z });
  assert.equal(s.reason(), 'protected');
  assert.equal(s.fire(), false);
  assert.equal(s.guns[2].ammo, 6);
  s.setAim({ x: z.x + z.radius + WEAPONS[2].radius + 0.01, z: z.z });
  assert.equal(s.reason(), 'ready');
});
test('ordinary friendlies warn but do take damage; training immunity is explicit', () => {
  const s = start();
  s.choose(2);
  s.setAim(s.rescue);
  assert(s.friendlyRisk);
  assert(s.fire());
  tick(s, WEAPONS[2].flight + 0.05);
  assert(s.friendlyDamage >= 140);
  assert.equal(s.rescue.hp, 120);
  const training = start();
  training.training = true;
  training.choose(2);
  training.setAim(training.rescue);
  training.fire();
  tick(training, WEAPONS[2].flight + 0.05);
  assert.equal(training.rescue.hp, 260);
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
  tick(s, WEAPONS[1].flight + 0.05);
  assert.equal(s.fired, count);
});
test('critical destruction fails before arrival; timeout fails; fresh retry has no leftovers', () => {
  const s = start();
  s.progress = ROUTE_LENGTH - 0.001;
  s.rescue.hp = 0;
  s.step(1 / 60);
  assert.equal(s.phase, 'failure');
  assert.equal(s.failure, 'vehicle');
  const t = start();
  t.time = MISSION.duration - 0.001;
  t.step(1 / 60);
  assert.equal(t.failure, 'timeout');
  const fresh = new Simulation();
  assert.equal(fresh.time, 0);
  assert.equal(fresh.units.length, 2);
  assert.equal(fresh.shots.length, 0);
  assert.equal(fresh.guns[2].ammo, 6);
  assert.equal(fresh.pauses.size, 0);
});
test('first mission is winnable using all three weapons and the unmodified finite event table', () => {
  const s = start();
  let used = new Set<number>();
  for (let n = 0; n < MISSION.duration * 60 && s.phase === 'playing'; n++) {
    const enemy = s.units.find((u) => !u.friendly && u.hp > 0);
    if (enemy) {
      const gun = enemy.kind === 'heavy' ? 2 : enemy.kind === 'turret' ? 1 : 0;
      if (s.selected !== gun) s.choose(gun);
      used.add(gun);
      const future = s.time - enemy.born + WEAPONS[gun].flight;
      s.setAim(
        enemy.kind === 'light'
          ? {
              x: enemy.origin.x + Math.sin(future * 0.5) * 5,
              z: enemy.origin.z + Math.cos(future * 0.5) * 2,
            }
          : enemy,
      );
      s.fire();
    }
    s.step(1 / 60);
  }
  assert.equal(s.phase, 'success');
  assert.equal(s.convoy, 'arrived');
  assert.equal(s.spawned.size, MISSION.events.length);
  assert.equal(s.kills, MISSION.events.length);
  assert.equal(s.friendlyDamage, 0);
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
  s.fire();
  assert.equal(s.reason(), 'cooldown');
  assert(s.friendlyRisk, 'reload must not hide the friendly warning');
  const launch = JSON.stringify(s.shots[0]);
  tick(s, 0.1);
  s.setAim({ x: 5, z: 30 });
  assert.equal(JSON.stringify(s.shots[0]), launch);
  assert.equal(s.shots[0].due - s.shots[0].born, WEAPONS[2].flight);
  assert(s.shots[0].origin.y > 100);
});
