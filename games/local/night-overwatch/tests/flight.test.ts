import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import {
  FLIGHT, MAP, MISSION, ROUTE_LENGTH, TERRAIN, UNITS, WEAPONS,
  aircraft, distance, patrolPoint, routePoint, terrainHeight,
} from '../assets/scripts/core/Data.ts';
import { ballisticLaunch, muzzlePosition } from '../assets/scripts/core/Flight.ts';

const tick = (s: Simulation, seconds: number, dt = 1 / 60) => {
  for (let i = 0; i < Math.ceil(seconds / dt); i++) s.step(dt);
};
const isolated = () => {
  const s = new Simulation();
  s.start();
  s.units = s.units.filter((u) => u.friendly);
  s.convoy = 'holding';
  return s;
};
const near = (a: number, b: number, tolerance = 1e-6) => assert(Math.abs(a - b) < tolerance, `${a} ≈ ${b}`);

test('aircraft is live simulation state and pauses freeze its orbit', () => {
  const s = new Simulation();
  s.start();
  assert(s.aircraft, 'flight must have persistent state, not aircraft(time) decoration');
  const first = { ...s.aircraft };
  assert.equal(first.x, 0);
  assert.equal(first.z, FLIGHT.radius);
  assert.equal(first.y, FLIGHT.altitude);
  assert.equal(first.yaw, -Math.PI / 2);
  assert.equal(first.heading, 270);
  assert.equal(first.direction, 1);
  const legacy = aircraft(0);
  near(legacy.x, first.x);
  near(legacy.z, first.z);
  assert.equal(legacy.heading, first.heading);
  s.step(0.1);
  assert(s.aircraft.x < first.x, 'clockwise flight starts westward from the southern orbit');
  assert(s.aircraft.z < first.z);
  s.pause('manual', true);
  const frozen = JSON.stringify(s.aircraft);
  s.setOrbitDirection(-1);
  s.adjustAltitude(20);
  s.adjustRadius(20);
  s.step(0.1);
  assert.equal(JSON.stringify(s.aircraft), frozen);
});

test('arrival cannot succeed while a threat is still alive', () => {
  const s = new Simulation();
  assert.equal(s.threatsRemaining, 24, 'unspawned contacts also count');
  s.start();
  s.progress = 10000;
  s.step(0.01);
  assert.equal(s.phase, 'playing');
  assert(s.threatsRemaining >= 24);
  const enemy = s.units.find((u) => !u.friendly)!;
  s.units.forEach((u) => { if (!u.friendly && u !== enemy) u.hp = 0; });
  s.step(0.01);
  assert.equal(s.convoy, 'arrived');
  assert.equal(s.phase, 'playing');
  assert.equal(s.threatsRemaining, 1);
  enemy.hp = 0;
  s.step(0.01);
  assert.equal(s.phase, 'success');
});

test('height/radius change smoothly, reverse orbit without teleporting, and bound invalid input', () => {
  const s = isolated();
  const initial = { ...s.aircraft };
  s.adjustAltitude(20);
  s.adjustRadius(20);
  assert.deepEqual(s.aircraft, initial);
  s.step(0.1);
  assert(s.aircraft.y > initial.y && s.aircraft.y <= initial.y + FLIGHT.climbRate * 0.1);
  assert(s.aircraft.radius > initial.radius && s.aircraft.radius <= initial.radius + FLIGHT.radiusRate * 0.1);
  assert(s.aircraft.pitch > 0);
  near(Math.hypot(s.aircraft.x, s.aircraft.z), s.aircraft.radius);
  tick(s, 20);
  near(s.aircraft.altitude, initial.altitude + 20, 0.05);
  near(s.aircraft.radius, initial.radius + 20, 0.05);
  near(s.aircraft.heading, (s.aircraft.yaw * 180 / Math.PI % 360 + 360) % 360);
  const before = { ...s.aircraft };
  s.setOrbitDirection(-1);
  assert.equal(s.aircraft.x, before.x);
  assert.equal(s.aircraft.y, before.y);
  assert.equal(s.aircraft.z, before.z);
  tick(s, 5);
  const angle = Math.atan2(s.aircraft.z, s.aircraft.x);
  tick(s, 1);
  assert(Math.atan2(s.aircraft.z, s.aircraft.x) < angle);
  s.adjustAltitude(Infinity);
  s.adjustRadius(NaN);
  assert(Object.values(s.aircraft).every(Number.isFinite));
  s.adjustAltitude(-10000);
  s.adjustRadius(-10000);
  tick(s, 80);
  assert(s.aircraft.altitude >= FLIGHT.minAltitude && s.aircraft.altitude < FLIGHT.minAltitude + 1);
  assert(s.aircraft.radius >= FLIGHT.minRadius && s.aircraft.radius < FLIGHT.minRadius + 1);
});

test('distance, height and weapon speed determine a frozen three-dimensional gravity arc', () => {
  const s = isolated();
  const nearTarget = { x: 90, z: 0 }, farTarget = { x: -95, z: -50 };
  assert(s.flightTime(0, farTarget) > s.flightTime(0, nearTarget));
  assert(s.flightTime(2, farTarget) > s.flightTime(1, farTarget));
  assert(s.flightTime(1, farTarget) > s.flightTime(0, farTarget));
  const low = ballisticLaunch({ x: 145, y: 60, z: 0 }, farTarget, WEAPONS[1].speed)!;
  const high = ballisticLaunch({ x: 145, y: 180, z: 0 }, farTarget, WEAPONS[1].speed)!;
  assert(high.duration > low.duration);
  s.setAim(farTarget);
  s.choose(1);
  const duration = s.flightTime();
  assert(duration > 1);
  assert(s.fire());
  const shot = s.shots[0];
  assert.deepEqual(shot.origin, muzzlePosition(s.aircraft));
  near(shot.due - shot.born, duration);
  near(Math.hypot(shot.velocity.x, shot.velocity.y, shot.velocity.z), WEAPONS[1].speed);
  assert.deepEqual(s.shotPosition(shot, shot.born), shot.origin);
  const end = s.shotPosition(shot, shot.due);
  near(end.x, farTarget.x);
  near(end.z, farTarget.z);
  near(end.y, terrainHeight(end.x, end.z));
  const mid = s.shotPosition(shot, shot.born + duration / 2);
  near(mid.y - (shot.origin.y + shot.targetY) / 2, FLIGHT.gravity * duration * duration / 8);
  const frozen = JSON.stringify(shot);
  s.adjustAltitude(20);
  s.adjustRadius(20);
  s.setOrbitDirection(-1);
  s.setAim({ x: 40, z: -20 });
  tick(s, 1);
  assert.equal(JSON.stringify(shot), frozen);
  assert(s.fire());
  assert.notDeepEqual(s.shots[1].origin, shot.origin);
});

test('aiming at a fast target misses; leading by the solved flight time hits its current position', () => {
  for (const lead of [false, true]) {
    const s = isolated();
    const enemy = s.addUnit('light', { x: -20, z: -25 });
    s.choose(0);
    let aim = { x: enemy.x, z: enemy.z };
    if (lead) for (let i = 0; i < 10; i++)
      aim = patrolPoint(enemy.origin, s.flightTime(0, aim));
    s.setAim(aim);
    assert(s.fire());
    const shot = s.shots[0];
    tick(s, shot.due + 0.02);
    assert.equal(enemy.hp, lead ? UNITS.light.hp - WEAPONS[0].damage : UNITS.light.hp);
    assert.equal(s.events.filter((e) => e.type === 'impact').length, 1);
    assert.equal(s.events.at(-1)?.outcome, lead ? 'hit' : 'miss');
    assert.equal(s.shots.length, 0);
  }
});

test('terrain intercepts before the aim point, emits the real contact and never damages through a hill', () => {
  const impacts = [];
  for (const dt of [1 / 60, 0.1]) {
    const s = isolated();
    Object.assign(s.aircraft, { x: -100, y: FLIGHT.minAltitude, z: 23, yaw: 0, pitch: 0 });
    const enemy = s.addUnit('turret', { x: 100, z: 23 });
    s.setAim(enemy);
    assert(s.fire());
    const shot = s.shots[0];
    tick(s, shot.due + 0.2, dt);
    const event = s.events.find((e) => e.type === 'impact')!;
    assert(event?.intercepted);
    assert(event.time < shot.due);
    assert(distance(event, enemy) > 30);
    near(event.y!, terrainHeight(event.x, event.z));
    const contact = s.shotPosition(shot, event.time);
    near(contact.x, event.x);
    near(contact.y, event.y!);
    assert.equal(event.shot, shot.id);
    assert.equal(enemy.hp, enemy.maxHp);
    assert.equal(s.shots.length, 0);
    tick(s, 1, dt);
    assert.equal(s.events.filter((e) => e.type === 'impact').length, 1);
    impacts.push(event);
  }
  near(impacts[0].time, impacts[1].time);
  near(impacts[0].x, impacts[1].x);
});

test('four friendly groups stay dispersed and enemies attack living local targets', () => {
  const s = isolated();
  const groups = [0, 1, 2, 3].map((group) => s.units.find((u) => u.group === group)!);
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++)
    assert(distance(groups[i], groups[j]) > 40);
  for (const target of groups) s.addUnit('turret', { x: target.x, z: target.z - 0.5 });
  tick(s, MISSION.warmup + 0.1);
  for (const target of groups) {
    assert(target.hp < target.maxHp);
    const event = s.events.find((e) => e.type === 'attack' && e.unit === target.id);
    assert(event?.target);
    near(event.target.x, target.x);
    near(event.target.z, target.z);
  }
  const post = groups[1];
  const attacker = s.units.find((u) => !u.friendly && distance(u, post) < 10)!;
  post.hp = 0;
  attacker.attack = 0;
  tick(s, 0.1);
  assert(s.events.filter((e) => e.type === 'attack').at(-1)?.unit !== post.id);
  const retained = s.units.filter((u) => u.friendly && u.group! > 0).map((u) => ({ x: u.x, z: u.z }));
  s.convoy = 'moving';
  tick(s, 3);
  assert.deepEqual(s.units.filter((u) => u.friendly && u.group! > 0).map((u) => ({ x: u.x, z: u.z })), retained);
});

test('continuous low terrain, shared road heights and in-bounds speed-limited patrols', () => {
  for (let x = -MAP.halfWidth; x <= MAP.halfWidth; x += 5) for (let z = -MAP.halfDepth; z <= MAP.halfDepth; z += 5) {
    const y = terrainHeight(x, z);
    assert(y >= 0 && y < 12);
    assert(Math.abs(terrainHeight(x + 0.01, z) - y) < 0.01);
  }
  for (let d = 0; d <= ROUTE_LENGTH; d += 0.5) {
    const p = routePoint(d);
    near(p.y, terrainHeight(p.x, p.z) + TERRAIN.roadLift);
  }
  for (const event of MISSION.events.filter((e) => e.kind === 'light')) {
    let previous = patrolPoint(event, 0);
    for (let t = 0.1; t < 22; t += 0.1) {
      const p = patrolPoint(event, t);
      assert(distance(p, previous) <= UNITS.light.speed * 0.1 + 1e-6);
      assert(Math.abs(p.x) < MAP.halfWidth && Math.abs(p.z) < MAP.halfDepth);
      previous = p;
    }
  }
  assert(WEAPONS[0].speed / UNITS.light.speed > 20);
});

test('unreachable/invalid HUD estimates are safe and failed launches consume no ammunition or heat', () => {
  const s = isolated();
  assert.equal(s.flightTime(0, { x: 10000, z: 0 }), Infinity);
  assert.equal(s.flightTime(0, { x: NaN, z: 0 }), Infinity);
  assert.equal(s.flightTime(0, null), Infinity);
  assert.equal(s.flightTime(-1), Infinity);
  assert.equal(ballisticLaunch({ x: 0, y: 100, z: 0 }, { x: 10000, z: 0 }, 1), undefined);
  Object.assign(s.aircraft, { y: 0 });
  s.choose(2);
  s.setAim({ x: 0, z: -30 });
  const before = JSON.stringify(s.guns);
  assert.equal(s.flightTime(), Infinity);
  assert.equal(s.fire(), false);
  assert.equal(JSON.stringify(s.guns), before);
  assert.equal(s.shots.length, 0);
  assert.equal(s.fired, 0);
});

test('every outpost must retain a survivor; the last lethal hit determines group failure cause', () => {
  for (const group of [1, 2, 3]) for (const finalCause of ['friendly', 'enemy'] as const) {
    const s = isolated();
    const [first, extra, last] = s.units.filter((u) => u.group === group);
    extra.hp = 0; // Leave two survivors to isolate first-vs-last casualty attribution.
    const fireAt = (unit: typeof first) => {
      s.choose(0);
      s.setAim(unit);
      assert(s.fire());
      return s.shots.at(-1)!;
    };
    const enemyKill = (unit: typeof first) => {
      const enemy = s.addUnit('turret', { x: unit.x - 0.5, z: unit.z });
      unit.hp = UNITS.turret.damage * MISSION.friendlyArmor;
      tick(s, MISSION.warmup + 0.02);
      enemy.hp = 0;
    };
    // The first casualty comes from the opposite side, so total damage cannot identify the cause.
    if (finalCause === 'friendly') enemyKill(first);
    else {
      first.hp = WEAPONS[0].damage;
      const shot = fireAt(first);
      tick(s, shot.due - s.time + 0.02);
    }
    assert.equal(first.hp, 0);
    assert.equal(s.phase, 'playing', 'one surviving group member is enough to continue');
    assert.equal(s.failedGroup, undefined);
    assert.equal(s.failureCause, '');
    if (finalCause === 'enemy') enemyKill(last);
    else {
      last.hp = WEAPONS[0].damage;
      const shot = fireAt(last);
      while (s.time + 1 / 60 < shot.due) s.step(1 / 60);
      s.progress = ROUTE_LENGTH;
      s.convoy = 'arrived';
      assert.equal(s.threatsRemaining, 0);
      s.step(1 / 60); // Last friendly dies in the exact step that would otherwise declare success.
    }
    assert.equal(last.hp, 0);
    assert.equal(s.phase, 'failure');
    assert.equal(s.failure, 'vehicle');
    assert.equal(s.failedGroup, group);
    assert.equal(s.failureCause, finalCause);
    assert.equal(s.rescue.hp, s.rescue.maxHp);
    assert.equal(s.rating, '—');
    const fresh = new Simulation();
    assert.equal(fresh.failedGroup, undefined);
    assert.equal(fresh.failureCause, '');
  }
});
