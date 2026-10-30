import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation, type FireZone } from '../assets/scripts/core/Simulation.ts';
import { FIRE_ZONE, MAP, PROTECTED, UNITS, WEAPONS, distance, isWater, patrolPoint } from '../assets/scripts/core/Data.ts';
import { action } from '../assets/scripts/core/Actions.ts';
import { applyNightReplay, createNightReplay, observeNightInputs, RANKED_RULE_VERSION, type ReplayFrame } from '../assets/scripts/core/Replay.ts';

const near = (a: number, b: number, tolerance = 1e-6) => assert(Math.abs(a - b) < tolerance, `${a} != ${b}`);
function advance(sim: Simulation, seconds: number) {
  for (let i = 0, count = Math.ceil(seconds / .1); i < count; i++) sim.step(seconds / count);
}
function isolated() {
  const sim = new Simulation('operation-007'); sim.start(); sim.convoy = 'holding';
  sim.units = sim.units.filter(unit => unit.friendly);
  sim.mission.events.forEach((_, i) => sim.spawned.add(i));
  sim.addUnit('turret', { x: 150, z: 90 });
  for (const unit of sim.units) unit.attack = 10000;
  return sim;
}
function zone(sim: Simulation, x: number, z: number, duration = 25): FireZone {
  const fire = { id: 9000 + sim.fireZones.length, x, z, y: sim.height(x, z), radius: 8, born: sim.time, expires: sim.time + duration };
  sim.fireZones.push(fire);
  return fire;
}

test('light patrols are seeded circles with a 90/10 size mix, smooth bounded speed and dry land', () => {
  let large = 0;
  for (let id = 1; id <= 1000; id++) {
    const origin = { x: -80, z: 30, patrolId: id };
    const a = patrolPoint(origin, 0), b = patrolPoint(origin, .1);
    const turn = Math.abs(Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading)));
    const radius = UNITS.light.speed * .1 / turn;
    if (radius >= 16 - 1e-6) { large++; assert(radius <= 24 + 1e-6); }
    else assert(radius >= 6 - 1e-6 && radius <= 8 + 1e-6);
    assert.deepEqual(a, patrolPoint(origin, 0, 'valley', id));
    assert(distance(a, b) <= UNITS.light.speed * .1);
  }
  assert(large > 860 && large < 940, String(large));
  for (const map of ['valley', 'highland'] as const) for (const x of [-160, -140, -4, 4, 140, 160]) for (const z of [-100, 0, 100]) {
    const origin = { x, z, patrolId: 22 };
    let previous = patrolPoint(origin, 0, map);
    for (let time = .1; time < 80; time += .1) {
      const p = patrolPoint(origin, time, map);
      assert(Math.abs(p.x) < MAP.halfWidth && Math.abs(p.z) < MAP.halfDepth);
      assert(!isWater(p, map, UNITS.light.radius));
      assert(distance(p, previous) <= UNITS.light.speed * .1 + 1e-6);
      assert(Math.abs(Math.atan2(Math.sin(p.heading - previous.heading), Math.cos(p.heading - previous.heading))) < .04);
      previous = p;
    }
  }
});

test('incendiary is a finite single-press weapon with a five-second reload and persistent terrain fire', () => {
  assert.deepEqual(WEAPONS.map(w => w.ammo), [Infinity, 120, 45, 12]);
  assert.deepEqual(WEAPONS.map(w => w.interval), [.12, .65, 2.4, 5]);
  assert.deepEqual(WEAPONS[1].name, ['榴弹炮', 'HE Cannon']);
  assert.deepEqual(WEAPONS[2].name, ['重型榴弹炮', 'Heavy Howitzer']);
  assert.deepEqual(action('weapon3').keys, [53]); assert.deepEqual(action('homing').keys, [52]);
  const sim = isolated(); sim.choose(3); sim.setAim({ x: -80, z: -70 });
  sim.setFire('touch', true); assert.equal(sim.fired, 1); near(sim.guns[3].cooldown, 5);
  assert(!sim.fire());
  while (sim.shots.length) sim.step(.1);
  assert.equal(sim.fireZones.length, 1);
  const fire = sim.fireZones[0], impact = sim.events.find(event => event.type === 'impact')!;
  near(fire.x, impact.x); near(fire.z, impact.z); near(fire.y, sim.height(fire.x, fire.z));
  near(fire.expires - fire.born, 25); assert.equal(fire.radius, 8);
  advance(sim, 6); assert.equal(sim.fired, 1, 'holding never repeats incendiary');
  sim.setFire('touch', false); sim.setFire('touch', true); assert.equal(sim.fired, 2);
  assert.equal(sim.guns[3].ammo, 11);
  sim.clearInput();
  advance(sim, 40); assert.equal(sim.fireZones.length, 0);
});

test('fire blocks both armies without tunnelling, then expires and lets the convoy finish', () => {
  const sim = isolated(); sim.convoy = 'moving';
  const ahead = sim.routePoint(21), fire = zone(sim, ahead.x, ahead.z);
  const heavy = sim.addUnit('heavy', { x: 60, z: -70 }); heavy.attack = 10000;
  sim.addUnit('escort', { x: 95, z: -70 }, true).attack = 10000;
  const enemyFire = zone(sim, 72, -70);
  for (let i = 0; i < 240; i++) {
    const before = { ...heavy }; sim.step(.1);
    assert(distance(heavy, enemyFire) >= enemyFire.radius + UNITS.heavy.radius - 1e-6);
    assert(distance(heavy, before) <= UNITS.heavy.speed * .1 + 1e-6);
    for (const ally of sim.units.filter(unit => unit.routeOffset !== undefined))
      assert(distance(ally, fire) >= fire.radius + UNITS[ally.kind].radius - 1e-6);
  }
  const stopped = sim.progress, enemyX = heavy.x;
  advance(sim, 3); assert.equal(sim.fireZones.length, 0); assert(sim.progress > stopped); assert(heavy.x > enemyX);
  // Extraction also sweeps the complete segment, so its long step cannot jump across a fire disk.
  const exit = isolated(); const middle = exit.routePoint(100); zone(exit, middle.x, middle.z, 2);
  exit.convoy = 'moving'; exit.extractionRemaining = .1; advance(exit, 1.2);
  assert(exit.progress < 100);
  for (const ally of exit.units.filter(unit => unit.routeOffset !== undefined)) assert(distance(ally, middle) >= 8 + UNITS[ally.kind].radius);
  advance(exit, 6); assert.equal(exit.convoy, 'arrived');
});

test('engulfed vehicles escape at normal speed and blocked patrols never catch up to wall time', () => {
  const sim = isolated();
  const rover = sim.addUnit('light', { x: -80, z: -50 }); rover.attack = 10000;
  const origin = { ...rover.origin }, fire = zone(sim, rover.x, rover.z);
  let escaped = false, previousDistance = 0;
  for (let i = 0; i < 260; i++) {
    const before = { ...rover }; sim.step(.1);
    assert(distance(rover, before) <= UNITS.light.speed * .1 + 1e-6);
    if (sim.fireZones.length) {
      const range = distance(rover, fire);
      if (!escaped) assert(range >= previousDistance - 1e-6);
      else assert(range >= fire.radius + UNITS.light.radius - 1e-6);
      escaped ||= range >= fire.radius + UNITS.light.radius;
      previousDistance = range;
    }
  }
  assert(escaped); assert.deepEqual(rover.origin, origin);
  for (let i = 0; i < 100; i++) { const before = { ...rover }; sim.step(.1); assert(distance(rover, before) <= UNITS.light.speed * .1 + 1e-6); }
  const blocked = isolated(), waiting = blocked.addUnit('light', { x: -80, z: -50 }); waiting.attack = 10000;
  const ahead = patrolPoint(waiting.origin, 6, blocked.mission.map); zone(blocked, ahead.x, ahead.z);
  advance(blocked, 24);
  assert(waiting.patrolElapsed! < blocked.time - 1, 'blocked orbit phase stays behind the combat clock');
  for (let i = 0; i < 100; i++) { const before = { ...waiting }; blocked.step(.1); assert(distance(waiting, before) <= UNITS.light.speed * .1 + 1e-6); }
});

test('fire respects protected areas, low friendly damage, explicit training immunity and every pause', () => {
  const sim = isolated(), protectedArea = PROTECTED[0]; sim.choose(3);
  sim.setAim({ x: protectedArea.x + protectedArea.radius + 8, z: protectedArea.z });
  assert.equal(sim.reason(), 'protected'); assert(!sim.fire()); assert.equal(sim.guns[3].ammo, 13);
  const unit = sim.addUnit('turret', { x: -80, z: -70 }, true); unit.attack = 10000;
  const fire = zone(sim, unit.x, unit.z); advance(sim, 1); near(unit.maxHp - unit.hp, FIRE_ZONE.damagePerSecond);
  near(sim.friendlyDamage, .2);
  sim.training = true; const hp = unit.hp; advance(sim, 1); near(unit.hp, hp);
  for (const reason of ['manual', 'background', 'advert', 'settings', 'orientation', 'help', 'mission', 'focus', 'supply', 'countdown'] as const) {
    sim.pause(reason, true); const frozen = sim.checkpoint(); advance(sim, 2); assert.deepEqual(sim.checkpoint(), frozen); sim.pause(reason, false);
  }
  near(fire.expires, 25);
});

test('vehicles escape a three-way overlap without entering a new fire zone', () => {
  for (const kind of ['light', 'heavy'] as const) {
    const sim = isolated(), unit = sim.addUnit(kind, { x: -80, z: -50 }); unit.attack = 10000;
    for (const [x, z] of [[-84, -50], [-78, -47], [-78, -53]]) zone(sim, x, z);
    for (let i = 0; i < 240; i++) {
      const before = { ...unit }; sim.step(.1);
      assert(distance(unit, before) <= UNITS[kind].speed * .1 + 1e-6);
    }
    assert(sim.fireZones.every(fire => distance(unit, fire) >= fire.radius + UNITS[kind].radius - 1e-6));
  }
});

test('restock preserves current weapon, trigger and buff while adding only finite ammunition', () => {
  const sim = isolated(); sim.choose(3); sim.grantBuff('rate'); sim.guns[1].ammo = 0; sim.guns[2].ammo = 1; sim.guns[3].ammo = 2;
  sim.held.add('touch'); sim.grantAmmoSupply();
  assert.deepEqual(sim.guns.map(gun => gun.ammo), [Infinity, 60, 25, 8]);
  assert.equal(sim.selected, 3); assert.equal(sim.buff?.kind, 'rate'); assert(sim.held.has('touch'));
  const restored = Simulation.restore(sim.checkpoint()); assert.deepEqual(restored.checkpoint(), sim.checkpoint());
  const legacy = sim.checkpoint(); Reflect.deleteProperty(legacy, 'fireZones'); legacy.guns.pop();
  const migrated = Simulation.restore(legacy); assert.deepEqual(migrated.fireZones, []); assert.equal(migrated.guns[3].ammo, 12);
});

test('incendiary, restock, paused fire and patrol state round-trip through durable replay', () => {
  assert.equal(RANKED_RULE_VERSION, 'night-input-replay-v9');
  const sim = new Simulation('operation-007'); sim.start(); const frames: ReplayFrame[] = [];
  observeNightInputs(sim, (input, ticks) => frames.push({ input, ticks }));
  sim.choose(3); sim.setAim({ x: -80, z: -70 }); sim.setFire('touch', true);
  for (let i = 0; i < 480; i++) sim.step(1 / 60);
  assert.equal(sim.fireZones.length, 1);
  sim.pause('supply', true); sim.grantAmmoSupply(); sim.pause('supply', false); sim.beginResumeCountdown();
  for (let i = 0; i < 30; i++) sim.stepCountdown(.1);
  for (let i = 0; i < 120; i++) sim.step(1 / 60);
  let replay = createNightReplay('campaign', sim.mission.id);
  for (let i = 0; i < frames.length; i += 73) { replay = JSON.parse(JSON.stringify(replay)); applyNightReplay(replay, frames.slice(i, i + 73)); }
  assert(replay.assisted); assert.deepEqual(replay.simulation, sim.checkpoint());
  assert.throws(() => applyNightReplay(replay, [{ input: { command: 'grantAmmoSupply', args: [999] }, ticks: 0 }]));
});

test('engulfed heavy armor escapes even when its target is already in close range', () => {
  const sim = isolated(), heavy = sim.addUnit('heavy', { x: -85, z: -60 });
  const target = sim.addUnit('escort', { x: -80, z: -60 }, true); target.attack = heavy.attack = 10000;
  const fire = zone(sim, heavy.x, heavy.z), before = { ...heavy };
  sim.step(.1); assert(distance(heavy, before) > 0); assert(distance(heavy, before) <= UNITS.heavy.speed * .1 + 1e-6);
  advance(sim, 14); assert(distance(heavy, fire) >= fire.radius + UNITS.heavy.radius);
});
