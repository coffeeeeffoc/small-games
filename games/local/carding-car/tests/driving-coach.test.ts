import assert from 'node:assert/strict';
import test from 'node:test';
import { DrivingCoach } from '../assets/scripts/DrivingCoach.ts';
import { collideKart, createKart, driveKart } from '../assets/scripts/KartPhysics.ts';
import { recordFeedback } from '../assets/scripts/RankingSystem.ts';

test('coach requires driving, charged release and an actual nitro trigger; pause cannot award a step', () => {
  const coach = new DrivingCoach();
  const kart = createKart(0, 0, 0);
  const input = { throttle: 1, steer: 0, drift: false, brake: false, nitro: false };
  const tick = (racing = true) => coach.observe(kart, input, 1 / 60, racing);
  tick();
  assert.equal(coach.step, 0);
  kart.speed = 10;
  tick();
  assert.equal(coach.step, 1);
  input.steer = 1;
  for (let i = 0; i < 22; i++) tick();
  assert.equal(coach.step, 2);
  input.drift = true;
  tick();
  assert.equal(coach.step, 2, 'holding drift alone is not a successful charge');
  kart.tier = 1;
  tick();
  assert.equal(coach.step, 3);
  kart.tier = 0;
  tick(false);
  input.drift = false;
  kart.boost = 1;
  tick();
  assert.equal(
    coach.step,
    2,
    'pause cleared the charge; unrelated boost must not complete release',
  );
  kart.tier = 1;
  input.drift = true;
  tick();
  kart.tier = 0;
  input.drift = false;
  tick();
  assert.equal(coach.step, 4);
  input.nitro = true;
  tick();
  assert.equal(coach.step, 4, 'a key without a cooldown transition is not a nitro trigger');
  kart.nitroCooldown = 6;
  tick();
  assert.equal(coach.step, 5);
  assert.match(coach.hint(false), /完成/);
  coach.enabled = false;
  coach.step = 0;
  tick();
  assert.equal(coach.step, 0);
  assert.match(recordFeedback(90), /首个/);
  assert.match(recordFeedback(89.12, 90), /快了 0.88 秒/);
  assert.match(recordFeedback(90.004, 90), /追平/);
  assert.match(recordFeedback(92.34, 90), /差 2.34 秒/);
});

test('lost drift charge returns to charging guidance and can be completed on the next bend', () => {
  for (const interruption of ['brake', 'collision', 'cancel']) {
    const coach = new DrivingCoach();
    const kart = createKart(0, 0, 0);
    const input = { throttle: 1, steer: 1, drift: true, brake: false, nitro: false };
    const tick = () => {
      driveKart(kart, input, 1 / 60);
      coach.observe(kart, input, 1 / 60, true);
    };
    const charge = () => {
      for (let i = 0; i < 600 && coach.step < 3; i++) tick();
      assert.equal(coach.step, 3, `${interruption}: driving must earn the charge`);
    };
    charge();
    if (interruption === 'brake') {
      input.brake = true;
      tick();
      input.brake = false;
    } else {
      if (interruption === 'collision') collideKart(kart);
      else Object.assign(kart, { drifting: false, charge: 0, tier: 0, driftSide: 0 });
      coach.observe(kart, input, 1 / 60, true);
    }
    assert.equal(coach.step, 2, `${interruption}: empty charge cannot be released`);
    assert.match(coach.hint(false), /蓄出蓝色火花/);
    charge();
    input.drift = false;
    tick();
    assert.equal(coach.step, 4, `${interruption}: charged release completes the retried step`);
    input.nitro = true;
    tick();
    assert.equal(coach.step, 5);
  }
});
