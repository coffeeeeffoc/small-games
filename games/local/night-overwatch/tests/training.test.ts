import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import { MISSIONS, TRAINING, readMissionSearch } from '../assets/scripts/core/MissionCatalog.ts';
import { WEAPONS, UNITS, distance, patrolPoint } from '../assets/scripts/core/Data.ts';
import { bestTrainingRecord, readTrainingRecord, trainingNextGoal } from '../assets/scripts/core/TrainingRecords.ts';
const tick = (sim: Simulation, seconds: number) => {
  for (let n = 0; n < Math.ceil(seconds * 60); n++) sim.step(1 / 60);
};
function completeWarmup() {
  const sim = new Simulation('training-60'); sim.start();
  const pending = new Map<number, { unit: number; damage: number }>();
  for (let frame = 0; frame < 60 * 60 && sim.phase === 'playing'; frame++) {
    for (const id of pending.keys()) if (!sim.shots.some((shot) => shot.id === id)) pending.delete(id);
    const friends = sim.units.filter((unit) => unit.friendly && unit.hp > 0);
    for (const enemy of sim.units.filter((unit) => !unit.friendly && unit.hp > 0)) {
      const inbound = [...pending.values()].filter((shot) => shot.unit === enemy.id).reduce((sum, shot) => sum + shot.damage, 0);
      if (inbound >= enemy.hp) continue;
      const gun = enemy.kind === 'heavy' ? 2 : 1;
      sim.choose(gun);
      let aim = { x: enemy.x, z: enemy.z };
      const target = friends.reduce((a, b) => distance(enemy, a) < distance(enemy, b) ? a : b);
      for (let n = 0; n < 8; n++) {
        const flight = sim.flightTime(gun, aim);
        if (enemy.kind === 'light') aim = patrolPoint(enemy.origin, sim.time - enemy.born + flight);
        if (enemy.kind === 'heavy') {
          const range = distance(enemy, target), move = Math.min(UNITS.heavy.speed * flight, Math.max(0, range - 12));
          aim = { x: enemy.x + (target.x - enemy.x) * move / range, z: enemy.z + (target.z - enemy.z) * move / range };
        }
      }
      sim.setAim(aim);
      if (sim.friendlyRisk || !sim.fire()) continue;
      pending.set(sim.shots.at(-1)!.id, { unit: enemy.id,
        damage: WEAPONS[gun].damage * (enemy.kind === 'heavy' ? WEAPONS[gun].armor : 1) });
      break;
    }
    sim.step(1 / 60);
  }
  return sim;
}

test('warmup clears three different targets through real moving aircraft ballistics and finite ammunition', (t) => {
  const sim = completeWarmup();
  t.diagnostic(JSON.stringify({ time: sim.time, phase: sim.phase, fired: sim.fired, hitShots: sim.hitShots,
    friendlyDamage: sim.friendlyDamage, ammo: sim.guns.map((gun) => gun.ammo) }));
  assert.equal(sim.phase, 'success'); assert.equal(sim.kills, 3);
  assert(sim.time < 60); assert.equal(sim.progress, 0); assert.notEqual(sim.convoy, 'arrived');
  assert.equal(sim.friendlyDamage, 0); assert.equal(sim.friendlyLosses, 0);
  assert(sim.guns[1].ammo < WEAPONS[1].ammo && sim.guns[2].ammo < WEAPONS[2].ammo);
  assert(sim.guns.every((gun) => gun.ammo >= 0));
  assert.equal(sim.training, false, 'the test-only friendly invulnerability switch is not used');
  assert(sim.hitShots <= sim.fired);
  const best = bestTrainingRecord(undefined, sim)!;
  assert.equal(best.time, sim.time);
  assert.equal(bestTrainingRecord({ ...best, time: best.time - 1 }, sim)!.time, best.time - 1);
  sim.friendlyDamage = 1;
  assert.equal(bestTrainingRecord(undefined, sim), undefined);
  assert.match(trainingNextGoal(sim)[0], /零友伤/);
});

test('pause freezes the 60-second range, and waiting or missing cannot clear it for free', () => {
  const sim = new Simulation('training-60'); sim.start();
  assert.deepEqual(sim.units.filter((unit) => !unit.friendly).map((unit) => unit.kind), ['turret', 'light', 'heavy']);
  const initial = sim.units.map((unit) => unit.hp);
  sim.pause('manual', true); tick(sim, 10);
  assert.equal(sim.time, 0);
  sim.pause('manual', false); tick(sim, 59);
  assert.equal(sim.phase, 'playing'); assert.deepEqual(sim.units.map((unit) => unit.hp), initial);
  tick(sim, 2); assert.equal(sim.phase, 'failure'); assert.equal(sim.failure, 'timeout');
  assert.equal(sim.time, 60); assert.equal(sim.threatsRemaining, 3);
  const miss = new Simulation('training-60'); miss.start(); miss.choose(1); miss.setAim({ x: 0, z: -60 });
  for (let shot = 0; shot < 8; shot++) { assert(miss.fire()); tick(miss, .9); }
  tick(miss, 60);
  assert.equal(miss.phase, 'failure'); assert.equal(miss.kills, 0); assert.equal(miss.hitShots, 0);
  assert.equal(miss.fired, 8);
});

test('friendly damage remains real and destroying an ally stops the warmup', () => {
  const sim = new Simulation('training-60'); sim.start(); sim.choose(2);
  sim.setAim(sim.rescue);
  assert.equal(sim.friendlyRisk, true);
  for (let shot = 0; shot < 4; shot++) { assert(sim.fire()); tick(sim, 3.1); }
  tick(sim, 15);
  assert.equal(sim.phase, 'failure'); assert.equal(sim.failure, 'vehicle');
  assert(sim.friendlyDamage > 0); assert(sim.friendlyLosses > 0);
  assert.equal(bestTrainingRecord(undefined, sim), undefined);
});

test('public task shortcuts choose only one known task, and the original three escort profiles remain intact', () => {
  assert.equal(TRAINING.duration, 60); assert.equal(TRAINING.events.length, 3);
  assert.equal(MISSIONS.length, 3);
  for (const mission of [...MISSIONS, TRAINING]) assert.equal(readMissionSearch('?mission=' + mission.id), mission.id);
  for (const search of ['?mission=training-60&mission=training-60', '?mission=training-60&mission=ambush-02',
    '?mission=unknown', '?mission=../training-60', '?mission=', '']) assert.equal(readMissionSearch(search), undefined);
  for (const mission of MISSIONS) {
    assert.equal(mission.mode, 'escort'); assert.equal(mission.duration, 390);
    assert.equal(mission.events.length, 24);
  }
  assert.equal(readTrainingRecord('{broken'), undefined);
  assert.equal(readTrainingRecord('{"time":10,"fired":1,"hitShots":2}'), undefined);
  assert.equal(readTrainingRecord('{"time":61,"fired":10,"hitShots":5}'), undefined);
  assert.deepEqual(readTrainingRecord('{"time":20,"fired":10,"hitShots":5}'), { time: 20, fired: 10, hitShots: 5 });
});
