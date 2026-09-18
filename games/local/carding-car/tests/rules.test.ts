import assert from 'node:assert/strict';
import test from 'node:test';
import { createKart, driveKart, collideKart } from '../assets/scripts/KartPhysics.ts';
import { createTrack, projectOnTrack, pointAt } from '../assets/scripts/TrackGenerator.ts';
import { createProgress, advanceCheckpoint } from '../assets/scripts/CheckpointSystem.ts';
import { updateLap } from '../assets/scripts/LapSystem.ts';
import { RaceManager } from '../assets/scripts/RaceManager.ts';
import { aiInput } from '../assets/scripts/KartAI.ts';
import { clamp } from '../assets/scripts/KartConfig.ts';

test('steering moves toward the requested screen side from the chase camera', () => {
  for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    for (const steer of [-1, 1]) {
      for (const drift of [false, true]) {
        const kart = createKart(0, 0, heading);
        kart.speed = 20;
        for (let frame = 0; frame < 60; frame++)
          driveKart(kart, { steer, throttle: 1, brake: false, drift }, 1 / 60);
        // Camera looks along forward (+Z at heading 0); screen-right is forward cross up.
        const screenRightTravel = -Math.cos(heading) * kart.x + Math.sin(heading) * kart.z;
        assert.ok(
          screenRightTravel * steer > 1,
          `heading ${heading}, steer ${steer}, drift ${drift}`,
        );
      }
    }
  }
});

test('holding drift on a straight cannot earn a boost', () => {
  const kart = createKart(0, 0, 0);
  for (let i = 0; i < 360; i++)
    driveKart(kart, { steer: 0, throttle: 1, brake: false, drift: true }, 1 / 60);
  driveKart(kart, { steer: 0, throttle: 1, brake: false, drift: false }, 1 / 60);
  assert.ok(kart.speed > 20, 'the kart really accelerated');
  assert.equal(kart.charge, 0);
  assert.equal(kart.boost, 0);
});

test('kart contact and rough corner inputs cannot strand checkpoint progress', () => {
  const contact = new RaceManager();
  contact.phase = 'racing';
  for (let i = 0; i < 2; i++) {
    const s = 30 - i * 0.06,
      p = pointAt(contact.track, s),
      d = contact.drivers[i];
    Object.assign(d.kart, createKart(p.x, p.z, p.heading));
    d.kart.speed = 30;
    d.progress.s = s;
    d.progress.distance = s;
    d.safe = { ...p, s };
  }
  for (let f = 0; f < 180; f++)
    contact.step({ steer: 0, throttle: 1, brake: false, drift: false }, 1 / 60);
  assert.ok(contact.drivers[0].progress.s > 60);
  const race = new RaceManager();
  race.start();
  const d = race.drivers[0];
  for (let f = 0; f < 1800; f++) {
    const input = aiInput(d.kart, race.track, false, d.progress.s);
    input.steer = clamp(input.steer + Math.sin(f / 30) * 0.45, -1, 1);
    if (f % 210 < 18) input.drift = true;
    if (f % 487 < 80) input.brake = true;
    race.step(input, 1 / 60);
  }
  assert.ok(d.progress.distance > 350, 'ordinary rough driving must keep making legal progress');
});

test('four drivers can race full laps through both branches without stuck progress', () => {
  const race = new RaceManager();
  race.start();
  for (let frame = 0; frame < 60 * 220 && race.phase !== 'finished'; frame++) {
    const d = race.drivers[0];
    race.step(aiInput(d.kart, race.track, false, d.progress.s), 1 / 60);
  }
  assert.equal(race.phase, 'finished');
  assert.ok(race.drivers.every((d) => d.progress.laps >= 2));
  assert.ok(race.boosts >= 3);
  assert.ok(race.collisions < 6);
  const before = race.drivers[0].progress.distance;
  race.recover(0);
  assert.equal(race.drivers[0].progress.distance, before, 'recovery cannot gain distance');
});

test('failing the narrow shortcut returns to its entrance without gaining checkpoints', () => {
  const race = new RaceManager();
  race.start();
  const d = race.drivers[0];
  for (let f = 0; f < 60 * 50 && d.progress.distance < race.track.shortcutStart + 60; f++) {
    race.step(aiInput(d.kart, race.track, true, d.progress.s), 1 / 60);
  }
  assert.ok(
    d.progress.s > race.track.shortcutStart + 30 && d.progress.s < race.track.shortcutEnd - 20,
  );
  const before = d.progress.distance,
    gate = d.progress.nextGate;
  let reset = false;
  for (let f = 0; f < 180; f++) {
    race.step({ steer: 1, throttle: 1, brake: false, drift: false }, 1 / 60);
    if (race.resets) {
      reset = true;
      break;
    }
  }
  assert.ok(reset, 'shortcut wall contact should recover at the entrance');
  assert.ok(d.progress.distance < before);
  assert.equal(d.progress.nextGate, gate);
  assert.equal(d.progress.laps, 0);
});

test('three legal laps finish, while skipping gates, reversing and teleporting cannot', () => {
  const track = createTrack();
  const p = createProgress(track.length - 4);
  let finish = false;
  for (let s = -3; s <= track.length * 3 + 1; s += 1) {
    const crossed = advanceCheckpoint(p, track, s, 2, true);
    finish = updateLap(p, crossed, s / 25) || finish;
  }
  assert.equal(p.laps, 3);
  assert.equal(finish, true);
  const cheat = createProgress(0);
  advanceCheckpoint(cheat, track, track.length * 0.8, 2, true);
  assert.equal(cheat.nextGate, 0);
  assert.equal(cheat.distance, 0);
  for (let s = -1; s > -track.length; s--)
    updateLap(cheat, advanceCheckpoint(cheat, track, s, 2, true), 1);
  assert.equal(cheat.laps, 0);
});

test('the shortcut saves time only when completed cleanly', () => {
  const times: number[] = [];
  for (const mode of ['main', 'shortcut', 'failed']) {
    const race = new RaceManager(),
      d = race.drivers[0];
    const s = race.track.shortcutStart - 30,
      p = pointAt(race.track, s);
    race.phase = 'racing';
    Object.assign(d.kart, createKart(p.x, p.z, p.heading));
    d.kart.speed = 25;
    d.progress.s = d.progress.distance = s;
    d.safe = { ...p, s };
    race.drivers.slice(1).forEach((rival) => {
      rival.progress.finishedAt = 1;
    });
    for (let f = 0; f < 60 * 45 && d.progress.distance < race.track.shortcutEnd + 30; f++) {
      const input =
        mode === 'failed' && race.resets === 0 && d.progress.s > race.track.shortcutStart + 60
          ? { steer: 1, throttle: 1, brake: false, drift: false }
          : aiInput(d.kart, race.track, mode !== 'main' && race.resets === 0, d.progress.s);
      race.step(input, 1 / 60);
    }
    assert.ok(d.progress.distance >= race.track.shortcutEnd + 30);
    if (mode === 'failed') assert.equal(race.resets, 1);
    times.push(race.time);
  }
  assert.ok(times[1] < times[0] - 3, 'clean shortcut should offer a meaningful gain');
  assert.ok(times[2] > times[0] + 1, 'a failed attempt must cost more than the main route');
});

test('the closed course has a genuinely shorter legal branch and continuous ground', () => {
  const track = createTrack();
  assert.ok(track.length > 900 && track.length < 1800);
  assert.deepEqual(pointAt(track, 0), pointAt(track, track.length));
  const middle = track.shortcut[Math.floor(track.shortcut.length / 2)];
  const road = projectOnTrack(track, middle.x, middle.z);
  assert.equal(road.branch, 'shortcut');
  assert.ok(Math.abs(road.lateral) < 0.1);
  assert.ok(track.shortcutLength < track.shortcutEnd - track.shortcutStart);
  assert.ok(track.main.some((p) => p.y > 2));
});

test('wall contact removes stored drift reward and lets the kart move again', () => {
  const kart = createKart(0, 0, 0);
  kart.speed = 25;
  for (let i = 0; i < 110; i++)
    driveKart(kart, { steer: 0.6, throttle: 1, brake: false, drift: true }, 1 / 60);
  assert.equal(kart.tier, 2);
  collideKart(kart);
  assert.equal(kart.charge, 0);
  assert.equal(kart.tier, 0);
  assert.ok(kart.speed > 0 && kart.speed < 20);
  driveKart(kart, { steer: 0, throttle: 1, brake: false, drift: false }, 1 / 60);
  assert.equal(kart.boost, 0);
});

test('a sustained corner drift releases a stronger boost and then expires', () => {
  const kart = createKart(0, 0, 0);
  for (let i = 0; i < 100; i++)
    driveKart(kart, { steer: 0, throttle: 1, brake: false, drift: false }, 1 / 60);
  for (let i = 0; i < 110; i++)
    driveKart(kart, { steer: 0.6, throttle: 1, brake: false, drift: true }, 1 / 60);
  assert.equal(kart.tier, 2);
  driveKart(kart, { steer: 0, throttle: 1, brake: false, drift: false }, 1 / 60);
  assert.ok(kart.boost > 1);
  for (let i = 0; i < 35; i++)
    driveKart(kart, { steer: 0, throttle: 1, brake: false, drift: false }, 1 / 60);
  assert.ok(kart.speed > 30);
  for (let i = 0; i < 80; i++)
    driveKart(kart, { steer: 0, throttle: 1, brake: false, drift: false }, 1 / 60);
  assert.equal(kart.boost, 0);
});
