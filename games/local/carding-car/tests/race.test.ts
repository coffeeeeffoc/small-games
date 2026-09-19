import assert from 'node:assert/strict';
import test from 'node:test';
import { RaceManager } from '../assets/scripts/RaceManager.ts';
import { createProgress } from '../assets/scripts/CheckpointSystem.ts';
import { createKart } from '../assets/scripts/KartPhysics.ts';
import { pointAt, wrapDistance } from '../assets/scripts/TrackGenerator.ts';
import { addRecord, formatTime, ranking, readRecords } from '../assets/scripts/RankingSystem.ts';

const idle = { steer: 0, throttle: 0, brake: false, drift: false };

test('recovery ranks the actual safe position after reversing, including across the start line', () => {
  for (const [safeS, currentS] of [
    [50, 40],
    [40, 50],
    [4, -4],
    [-4, 4],
  ]) {
    const race = new RaceManager();
    const driver = race.drivers[0];
    const safe = pointAt(race.track, safeS);
    const current = pointAt(race.track, currentS);
    Object.assign(driver.kart, createKart(current.x, current.z, current.heading));
    Object.assign(driver.progress, {
      s: wrapDistance(currentS, race.track.length),
      distance: currentS,
    });
    driver.safe = { ...safe, s: wrapDistance(safeS, race.track.length) };
    race.drivers[1].progress.distance = safeS - 1;
    race.drivers[2].progress.distance = safeS + 1;
    race.drivers[3].progress.distance = safeS - 2;
    race.recover(0);
    assert.ok(
      Math.abs(driver.progress.distance - safeS) < 1e-8,
      `recovered from ${currentS} to ${safeS}, ranked at ${driver.progress.distance}`,
    );
    assert.deepEqual(race.order, [2, 0, 1, 3]);
  }
});

test('the race clock excludes countdown, pauses, invalid steps and the finished screen', () => {
  const race = new RaceManager();
  race.start();
  race.loaded = false;
  race.step(idle, 1 / 60);
  assert.equal(
    race.countdown,
    3,
    'rerolling cars must finish loading before the countdown advances',
  );
  race.loaded = true;
  race.step(idle, 1 / 60);
  assert.equal(race.time, 0);
  race.pause();
  const countdown = race.countdown;
  race.step(idle, 10);
  assert.equal(race.countdown, countdown);
  race.resume();
  race.phase = 'racing';
  race.step(idle, 1 / 60);
  const time = race.time;
  for (const dt of [-1, NaN, Infinity, 0]) race.step(idle, dt);
  assert.equal(race.time, time);
  race.pause();
  race.step(idle, 1 / 60);
  assert.equal(race.time, time);
  race.resume();
  race.step(idle, 1 / 60);
  assert.ok(race.time > time);
  race.phase = 'finished';
  const finish = race.time;
  race.step(idle, 1 / 60);
  assert.equal(race.time, finish);
});

test('lap timer stays on the completed final lap and clock text carries minutes correctly', () => {
  const race = new RaceManager();
  race.time = 125;
  Object.assign(race.drivers[0].progress, { lapStarted: 85, lapTimes: [45, 40] });
  assert.equal(race.currentLapTime, 40);
  assert.equal(race.bestLapTime, 40);
  Object.assign(race.drivers[0].progress, {
    finishedAt: 125,
    lapStarted: 125,
    lapTimes: [45, 40, 40],
  });
  assert.equal(race.currentLapTime, 40);
  assert.equal(formatTime(59.999), '1:00.00');
  assert.equal(formatTime(0), '0:00.00');
  assert.equal(formatTime(Infinity), '—');
  assert.equal(formatTime(Number.MAX_VALUE), '—');
});

test('finish times settle a close race before progress and same-frame driver order', () => {
  const race = new RaceManager();
  race.phase = 'racing';
  race.time = 100;
  race.drivers.forEach((driver, index) => {
    const s = race.track.length - (index === 0 ? 0.4 : 0.1);
    const road = pointAt(race.track, s);
    Object.assign(driver.kart, createKart(road.x, road.z, road.heading));
    // Keep the two finishing karts in separate lanes.
    driver.kart.x += Math.cos(road.heading) * (index === 0 ? 2 : -2);
    driver.kart.z -= Math.sin(road.heading) * (index === 0 ? 2 : -2);
    driver.kart.speed = 30;
    Object.assign(driver.progress, {
      s,
      distance: race.track.length * 3 - (race.track.length - s),
      laps: 2,
      lapStarted: 60,
      lapTimes: [30, 30],
      nextGate: race.track.checkpoints.length,
      finishedAt: index > 1 ? 110 + index : 0,
    });
  });
  race.step(idle, 1 / 60);
  assert.equal(race.phase, 'finished');
  assert.ok(race.drivers[1].progress.finishedAt < race.drivers[0].progress.finishedAt);
  assert.deepEqual(race.order.slice(0, 2), [1, 0]);
  assert.equal(race.time, race.drivers[0].progress.finishedAt);

  const drivers = [0, 1, 2].map(() => ({ progress: createProgress(0) }));
  drivers[0].progress.distance = 500;
  drivers[1].progress.finishedAt = 10;
  drivers[2].progress.finishedAt = 9;
  assert.deepEqual(ranking(drivers), [2, 1, 0]);
});

test('local records retain the five fastest results and reject damaged stored values', () => {
  assert.deepEqual(readRecords('{bad json'), []);
  assert.deepEqual(readRecords('{"time":20}'), []);
  assert.deepEqual(readRecords(null, '-3'), []);
  assert.deepEqual(readRecords(null, 'Infinity'), []);
  assert.deepEqual(readRecords(null, '1e308'), []);
  assert.equal(readRecords(null, '130.5')[0].time, 130.5);
  const records = readRecords(
    JSON.stringify([
      { time: -1, bestLap: 1, place: 1 },
      { time: 100, bestLap: 101, place: 1 },
      { time: 100, bestLap: 30, place: 5 },
      { time: '100', bestLap: 30, place: 1 },
      ...[140, 110, 130, 120, 150, 100].map((time) => ({ time, bestLap: 30, place: 2 })),
    ]),
  );
  assert.deepEqual(
    records.map((record) => record.time),
    [100, 110, 120, 130, 140],
  );
  assert.deepEqual(
    addRecord(records, { time: 105, bestLap: 29, place: 1 }).map((record) => record.time),
    [100, 105, 110, 120, 130],
  );
  assert.deepEqual(addRecord(records, { time: NaN, bestLap: 30, place: 1 }), records);
  assert.deepEqual(readRecords(JSON.stringify(records)), records);
});
