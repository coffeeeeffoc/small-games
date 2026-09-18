import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTrack,
  pointAt,
  projectOnTrack,
  wrapDistance,
} from '../assets/scripts/TrackGenerator.ts';
import { racingTarget } from '../assets/scripts/RacingLine.ts';
import { advanceCheckpoint, createProgress } from '../assets/scripts/CheckpointSystem.ts';
import { updateLap } from '../assets/scripts/LapSystem.ts';
import { RaceManager } from '../assets/scripts/RaceManager.ts';
import { createKart } from '../assets/scripts/KartPhysics.ts';
import { angleDelta, clamp } from '../assets/scripts/KartConfig.ts';

test('the player can return through either fork branch without automatic recovery', () => {
  for (const shortcut of [false, true]) {
    const race = new RaceManager(),
      d = race.drivers[0];
    const start = race.track.shortcutStart + 60;
    const p = pointAt(race.track, start, shortcut);
    race.phase = 'racing';
    race.drivers.slice(1).forEach((rival) => {
      rival.progress.finishedAt = 1;
    });
    Object.assign(d.kart, createKart(p.x, p.z, p.heading + Math.PI));
    d.kart.speed = 10;
    d.progress.s = d.progress.distance = start;
    for (let frame = 0; frame < 900 && d.progress.s > race.track.shortcutStart - 20; frame++) {
      const road = projectOnTrack(race.track, d.kart.x, d.kart.z);
      const ratio =
        shortcut && road.s > race.track.shortcutStart
          ? (race.track.shortcutEnd - race.track.shortcutStart) / race.track.shortcutLength
          : 1;
      const target = pointAt(race.track, road.s - 8 * ratio, shortcut);
      const error = angleDelta(
        Math.atan2(target.x - d.kart.x, target.z - d.kart.z),
        d.kart.heading,
      );
      race.step(
        { steer: clamp(-error * 2.7, -1, 1), throttle: 0.25, brake: false, drift: false },
        1 / 60,
      );
      assert.equal(race.resets, 0);
    }
    assert.ok(
      d.progress.s <= race.track.shortcutStart - 20,
      `${shortcut ? 'shortcut' : 'left main'} return must remain drivable`,
    );
    assert.equal(d.progress.laps, 0);
  }
});

test('turning onto the left fork remains on asphalt even when branch progress differs', () => {
  const race = new RaceManager(),
    d = race.drivers[0];
  race.phase = 'racing';
  race.drivers.slice(1).forEach((rival) => {
    rival.progress.finishedAt = 1;
  });
  const p = pointAt(race.track, race.track.shortcutStart + 20);
  Object.assign(d.kart, createKart(p.x, p.z, p.heading));
  d.progress.s = d.progress.distance = race.track.shortcutStart + 40;
  for (let frame = 0; frame < 120; frame++)
    race.step({ steer: 0, throttle: 0, brake: false, drift: false }, 1 / 60);
  assert.equal(d.kart.offRoad, 0, 'physical asphalt contact cannot depend on race progress');
  assert.equal(race.resets, 0);
});

test('shortcut lookahead measures travelled metres through the fork, merge and lap boundary', () => {
  const track = createTrack();
  const ratio = (track.shortcutEnd - track.shortcutStart) / track.shortcutLength;
  for (let i = 1; i < track.shortcut.length; i++) {
    const a = track.shortcut[i - 1],
      b = track.shortcut[i];
    assert.ok(Math.abs((b.s - a.s) / ratio - Math.hypot(b.x - a.x, b.z - a.z)) < 1e-8);
  }
  const cases = [
    [track.shortcutStart - 5, 15, track.shortcutStart + 10 * ratio],
    [track.shortcutEnd - 5 * ratio, 15, track.shortcutEnd + 10],
    [track.length - 5, 15, 10],
  ];
  for (const [s, lookAhead, expected] of cases) {
    const actual = racingTarget(track, s, lookAhead, true);
    const target = pointAt(track, expected, true);
    assert.ok(Math.hypot(actual.x - target.x, actual.z - target.z) < 1e-8);
  }
  for (const junction of [track.shortcutStart, track.shortcutEnd]) {
    const before = racingTarget(track, junction - 0.001, 20, true);
    const after = racingTarget(track, junction + 0.001, 20, true);
    assert.ok(Math.hypot(before.x - after.x, before.z - after.z) < 0.01);
  }
});

test('both physical road branches complete ordered gates, while distant grass cuts cannot', () => {
  const track = createTrack();
  for (const shortcut of [false, true]) {
    const progress = createProgress(track.length - 1);
    for (let s = 0; s < track.length * 2 + 1; s += 0.5) {
      const position = pointAt(track, s, shortcut);
      const road = projectOnTrack(track, position.x, position.z, progress.s);
      updateLap(
        progress,
        advanceCheckpoint(progress, track, road.s, 3, road.distance < road.width / 2),
        s / 20,
      );
    }
    assert.equal(progress.laps, 2, `${shortcut ? 'shortcut' : 'main'} route must remain legal`);
  }
  const progress = createProgress(track.shortcutStart - 20);
  const farRoad = pointAt(track, track.shortcutEnd + 20);
  const projection = projectOnTrack(track, farRoad.x, farRoad.z, progress.s);
  assert.ok(
    projection.distance > projection.width / 2,
    'projection must remain local to verified progress',
  );
  advanceCheckpoint(progress, track, projection.s, 3, false);
  assert.equal(progress.distance, 0);
  assert.equal(progress.nextGate, 0);
});

test('reverse finish crossings and repeated finish-line rocking never award a lap', () => {
  const track = createTrack();
  const progress = createProgress(1);
  for (let lap = 0; lap < 3; lap++)
    for (let s = 0; s > -track.length; s -= 0.5)
      updateLap(progress, advanceCheckpoint(progress, track, s, 2, true), lap + 1);
  for (let i = 0; i < 20; i++) {
    advanceCheckpoint(progress, track, track.length - 0.1, 2, true);
    updateLap(progress, advanceCheckpoint(progress, track, 0.1, 2, true), i + 5);
  }
  assert.equal(progress.laps, 0);
  assert.equal(progress.nextGate, 0);
});

test('recovery synchronizes the verified road position without gaining distance, gates or laps', () => {
  for (const [s, safeS, expectedLoss] of [
    [80, 75, 5],
    [2, -3, 5],
    [75, 80, 0],
  ]) {
    const race = new RaceManager();
    const d = race.drivers[0];
    d.progress.s = s;
    d.progress.distance = race.track.length + s;
    d.progress.nextGate = 3;
    d.progress.laps = 1;
    d.safe = { ...pointAt(race.track, safeS), s: wrapDistance(safeS, race.track.length) };
    const before = { ...d.progress };
    race.recover(0);
    assert.equal(d.progress.s, d.safe.s);
    assert.ok(Math.abs(d.progress.distance - (before.distance - expectedLoss)) < 1e-8);
    assert.equal(d.progress.nextGate, before.nextGate);
    assert.equal(d.progress.laps, before.laps);
    assert.equal(d.kart.x, d.safe.x);
    assert.equal(d.kart.z, d.safe.z);
    advanceCheckpoint(d.progress, race.track, d.safe.s + 0.2, 1, true);
    assert.ok(Math.abs(d.progress.distance - (before.distance - expectedLoss + 0.2)) < 1e-8);
  }
});
