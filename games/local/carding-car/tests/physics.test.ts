import assert from 'node:assert/strict';
import test from 'node:test';
import { KartConfig as C, angleDelta } from '../assets/scripts/KartConfig.ts';
import { createKart, driveKart, collideKart } from '../assets/scripts/KartPhysics.ts';
import { aiInput } from '../assets/scripts/KartAI.ts';
import { createTrack, pointAt } from '../assets/scripts/TrackGenerator.ts';

test('steering is controllable at low speed and drift entry never kicks toward the wrong side', () => {
  for (const steer of [-1, 1]) {
    const low = createKart(0, 0, 0),
      high = createKart(0, 0, 0);
    low.speed = 10;
    high.speed = C.maxSpeed;
    for (const kart of [low, high])
      driveKart(kart, { steer, throttle: 1, brake: false, drift: false }, 1 / 60);
    assert.ok(low.heading * steer < 0);
    assert.ok(Math.abs(low.heading) > Math.abs(high.heading));
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const kart = createKart(0, 0, heading);
      kart.speed = 25;
      for (let frame = 0; frame < 30; frame++) {
        driveKart(kart, { steer, throttle: 1, brake: false, drift: true }, 1 / 60);
        const requestedTravel = (-Math.cos(heading) * kart.x + Math.sin(heading) * kart.z) * steer;
        assert.ok(requestedTravel >= -1e-8, 'drift entry cannot move opposite to the input');
      }
      assert.ok(Math.abs(angleDelta(kart.velocityHeading, heading)) > 0.1);
    }
  }
});

test('both drift tiers release, braking cancels charge, and collisions prevent immediate re-entry', () => {
  for (const tier of [1, 2]) {
    const kart = createKart(0, 0, 0);
    kart.speed = 25;
    for (let frame = 0; frame < 180 && kart.tier < tier; frame++)
      driveKart(kart, { steer: 0.6, throttle: 1, brake: false, drift: true }, 1 / 60);
    assert.equal(kart.tier, tier);
    const braking = { ...kart },
      crashed = { ...kart };
    driveKart(kart, { steer: 0, throttle: 1, brake: false, drift: false }, 1 / 60);
    assert.equal(kart.boost, C.boostDurations[tier - 1]);
    assert.equal(kart.charge, 0);
    driveKart(braking, { steer: 0.6, throttle: 1, brake: true, drift: false }, 1 / 60);
    assert.equal(braking.boost, 0);
    assert.equal(braking.charge, 0);
    collideKart(crashed);
    driveKart(crashed, { steer: 0.6, throttle: 1, brake: false, drift: true }, 1 / 60);
    assert.equal(crashed.drifting, false);
    assert.equal(crashed.charge, 0);
  }
});

test('AI and player brakes apply the same deceleration through the shared vehicle model', () => {
  const track = createTrack(),
    p = pointAt(track, 0),
    ai = createKart(p.x, p.z, p.heading);
  ai.speed = C.maxSpeed + 4;
  const player = { ...ai },
    controls = aiInput(ai, track, false, 0);
  assert.equal(controls.brake, true);
  assert.equal(controls.throttle, 0);
  driveKart(ai, controls, 1 / 60);
  driveKart(player, { ...controls, throttle: 1 }, 1 / 60);
  assert.equal(
    ai.speed,
    player.speed,
    'brake takes priority even when the caller also holds throttle',
  );
  assert.ok(ai.speed < C.maxSpeed + 3.2);
});
