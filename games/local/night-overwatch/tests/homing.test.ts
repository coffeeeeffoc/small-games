import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import { PROTECTED, ZOOM_LEVELS } from '../assets/scripts/core/Data.ts';
import { aircraftCamera } from '../assets/scripts/core/CameraMath.ts';
import { readRewards, nextZoomLimit } from '../assets/scripts/core/Rewards.ts';

test('guided round pursues a moving target, freezes during ads, and hits only the locked unit', () => {
  for (const dt of [1 / 60, .1]) {
    const sim = new Simulation('training-60'); sim.start(); sim.homingAmmo = 1;
    const target = sim.units.find(u => !u.friendly && u.kind === 'light')!;
    sim.setAim(target);
    assert(sim.fireHoming()); assert.equal(sim.homingAmmo, 0);
    const shot = sim.shots[0], original = { x: target.x, z: target.z };
    const friend = sim.addUnit('escort', original, true), hp = friend.hp;
    const position = sim.shotPosition(shot);
    sim.pause('advert', true); sim.step(dt);
    assert.deepEqual(sim.shotPosition(shot), position);
    sim.pause('advert', false);
    let steered = false;
    for (let i = 0; i < 12 / dt && sim.shots.length; i++) {
      sim.step(dt);
      if (Math.hypot(shot.x - original.x, shot.z - original.z) > .1) steered = true;
    }
    assert(steered, 'guidance updates the destination after launch');
    assert.equal(target.hp, 0); assert.equal(friend.hp, hp);
    assert.equal(sim.hitShots, 1); assert.equal(sim.kills, 1);
    assert.equal(sim.events.find(e => e.type === 'impact')?.outcome, 'destroyed');
    assert.equal(sim.shots.length, 0);
  }
});

test('invalid targets never spend a round; dead or newly protected targets drop their lock', () => {
  const sim = new Simulation('training-60'); sim.homingAmmo = 2;
  assert.equal(sim.fireHoming(), false); sim.start();
  sim.setAim(sim.rescue); assert.equal(sim.fireHoming(), false);
  sim.setAim({ x: 150, z: 95 }); assert.equal(sim.fireHoming(), false);
  const target = sim.units.find(u => !u.friendly)!;
  sim.setAim(target); sim.pause('manual', true); assert.equal(sim.fireHoming(), false);
  assert.equal(sim.homingAmmo, 2); sim.pause('manual', false);
  assert(sim.fireHoming()); target.hp = 0; sim.step(1 / 60);
  assert.equal(sim.shots.length, 0); assert.equal(sim.hits, 0);
  target.hp = target.maxHp; target.kind = 'turret'; sim.setAim(target);
  assert(sim.fireHoming()); Object.assign(target, PROTECTED[0]); sim.step(1 / 60);
  assert.equal(sim.shots.length, 0); assert.equal(target.hp, target.maxHp);
  sim.homingAmmo = 1; sim.setAim(target); assert.equal(sim.fireHoming(), false);
  assert.equal(sim.homingAmmo, 1);
});

test('reward save validation and every zoom tier produces genuine optical magnification', () => {
  for (const raw of [null, 'bad', 'null', '{"ammo":-1,"zoomLimit":999}', '{"ammo":1.2,"zoomLimit":6}'])
    assert.deepEqual(readRewards(raw), { ammo: 0, zoomLimit: 5 });
  assert.deepEqual(readRewards('{"ammo":2,"zoomLimit":160}'), { ammo: 2, zoomLimit: 160 });
  const sim = new Simulation(), base = aircraftCamera(sim.aircraft, sim.aim, sim.height, 1, 844 / 390, 0);
  for (const zoom of ZOOM_LEVELS) {
    const frame = aircraftCamera(sim.aircraft, sim.aim, sim.height, zoom, 844 / 390, 0);
    const magnification = Math.tan(base.fov * Math.PI / 360) / Math.tan(frame.fov * Math.PI / 360);
    assert(Math.abs(magnification - zoom) < 1e-8);
    assert.deepEqual(frame.position, base.position);
  }
  assert.equal(nextZoomLimit(5), 10); assert.equal(nextZoomLimit(160), undefined);
});
