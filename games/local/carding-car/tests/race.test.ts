import assert from 'node:assert/strict';
import test from 'node:test';
import { RaceManager } from '../assets/scripts/RaceManager.ts';
import { createProgress } from '../assets/scripts/CheckpointSystem.ts';
import { createKart } from '../assets/scripts/KartPhysics.ts';
import { pointAt, projectOnTrack, wrapDistance } from '../assets/scripts/TrackGenerator.ts';
import { addRecord, formatTime, ranking, readRecords } from '../assets/scripts/RankingSystem.ts';
import { aiInput } from '../assets/scripts/KartAI.ts';
import { clamp, type KartInput } from '../assets/scripts/KartConfig.ts';

const idle = { steer: 0, throttle: 0, brake: false, drift: false };

test('countdown uses actual elapsed seconds even when a frame stalls, without moving karts', () => {
  const race = new RaceManager();
  race.loaded = false;
  race.start();
  assert.equal(race.phase, 'ready');
  race.loaded = true;
  race.start();
  const poses = race.drivers.map(driver => ({ ...driver.kart }));
  race.step(idle, 1.2);
  assert.equal(race.countdown, 1.8);
  race.pause();
  race.step(idle, 20);
  assert.equal(race.countdown, 1.8);
  race.resume();
  race.step(idle, 1);
  assert.ok(Math.abs(race.countdown - 0.8) < 1e-9);
  race.step(idle, 0.9);
  assert.equal(race.countdown, 0);
  assert.equal(race.phase, 'racing');
  assert.equal(race.time, 0);
  assert.deepEqual(race.drivers.map(driver => driver.kart), poses);
});

test('all rivals finish after either a player or AI wins, while each finish time stays fixed', () => {
  for (const mode of ['standard', 'sprint'] as const) for (const winner of [0, 1]) {
    const race = new RaceManager({}, undefined, 4, mode);
    race.phase = 'racing'; race.time = 100;
    race.drivers.forEach((driver, index) => {
      const remaining = index === winner ? 0.1 : 10 + index * 6;
      const s = race.track.length - remaining, p = pointAt(race.track, s);
      Object.assign(driver.kart, createKart(p.x, p.z, p.heading), { speed: 30 });
      Object.assign(driver.progress, { s, distance: race.laps * race.track.length - remaining,
        laps: race.laps - 1, nextGate: race.track.checkpoints.length, lapStarted: 60 });
    });
    race.step(idle, 1 / 60);
    assert.ok(race.drivers[winner].progress.finishedAt > 0);
    assert.equal(race.phase, winner === 0 ? 'finished' : 'racing');
    const winningTime = race.drivers[winner].progress.finishedAt;
    const winningKart = { ...race.drivers[winner].kart };
    for (let frame = 0; frame < 600 && race.drivers.some(d => !d.progress.finishedAt); frame++)
      race.step({ ...idle, throttle: 1 }, 1 / 60);
    assert.ok(race.drivers.every(d => d.progress.finishedAt > 0), `${mode}, winner ${winner}: remaining cars must continue`);
    assert.equal(race.order[0], winner);
    assert.equal(race.drivers[winner].progress.finishedAt, winningTime);
    assert.deepEqual(race.drivers[winner].kart, winningKart, 'a finished kart no longer moves or collects pickups');
    const completed = race.time;
    race.step(idle, 1 / 60);
    assert.equal(race.time, completed, 'the simulation stops once everyone has a result');
  }
});

test('slow travel around an inside bend cannot lock third-lap progress at a segment endpoint', () => {
  const race = new RaceManager({}, undefined, 1), driver = race.drivers[0];
  race.phase = 'racing';
  Object.assign(driver.kart, createKart(104.6, -15, 0), { speed: 2 });
  const start = projectOnTrack(race.track, driver.kart.x, driver.kart.z).s;
  Object.assign(driver.progress, { s: start, distance: 2 * race.track.length + start, laps: 2, nextGate: 1 });
  for (let frame = 0; frame < 600; frame++)
    race.step({ ...idle, throttle: 0.05 }, 1 / 60);
  const road = projectOnTrack(race.track, driver.kart.x, driver.kart.z);
  assert.ok(road.distance < road.width / 2);
  assert.equal(race.collisions, 0);
  assert.equal(race.resets, 0);
  assert.ok(Math.abs(driver.progress.s - road.s) < 0.01,
    `kart at ${road.s} is still ranked at ${driver.progress.s}`);
  assert.ok(Math.abs(driver.progress.distance - (2 * race.track.length + road.s)) < 0.01);
  assert.equal(driver.progress.nextGate, 2);
});

test('two shortcut laps followed by the long route keep the lead and finish on the third crossing', () => {
  const race = new RaceManager({}, 4230786066), driver = race.drivers[0];
  race.phase = 'racing';
  let laps = -1, previousS = driver.progress.s, input: KartInput = { ...idle };
  const branches = new Set<string>();
  for (let frame = 0; frame < 60 * 180 && race.phase !== 'finished'; frame++) {
    const road = projectOnTrack(race.track, driver.kart.x, driver.kart.z);
    if (frame % 4 === 0) {
      input = aiInput(driver.kart, race.track, laps < 2, road.s);
      if (!input.reverse) input = { ...input, throttle: 1, brake: false, nitro: frame % 120 < 60 };
    }
    race.step(input, 1 / 60);
    const after = projectOnTrack(race.track, driver.kart.x, driver.kart.z);
    // Inspect the separated middle sections; the ribbons overlap again near the merge.
    if (after.s > race.track.shortcutStart + 100 && after.s < race.track.shortcutEnd - 100) {
      branches.add(`${laps}:${after.branch}`);
      assert.ok(Math.abs(driver.progress.s - after.s) < 1);
      assert.equal(race.order[0], 0, 'the leading kart must stay first on either route');
    }
    if (previousS > race.track.length - 5 && after.s < 5)
      assert.equal(driver.progress.laps, ++laps, 'each physical finish crossing must count immediately');
    previousS = after.s;
  }
  assert.deepEqual([...branches], ['0:shortcut', '1:shortcut', '2:main']);
  assert.equal(laps, 3);
  assert.equal(race.phase, 'finished');
  assert.equal(race.order[0], 0);
});

test('scraping the fork and being pushed onto the shortcut cannot strand race progress', () => {
  const race = new RaceManager({}, 4197891702);
  race.phase = 'racing';
  const driver = race.drivers[0];
  let input: KartInput = { ...idle }, stalled = 0;
  let previousS = projectOnTrack(race.track, driver.kart.x, driver.kart.z).s, laps = -1;
  for (let frame = 0; frame < 30 * 300 && race.phase !== 'finished'; frame++) {
    const road = projectOnTrack(race.track, driver.kart.x, driver.kart.z);
    if (frame % 4 === 0) {
      input = aiInput(driver.kart, race.track, true, road.s);
      input.steer = clamp(input.steer + Math.sin(frame / 15) * 0.8, -1, 1);
    }
    race.step(input, 1 / 30);
    const after = projectOnTrack(race.track, driver.kart.x, driver.kart.z);
    const gap = wrapDistance(after.s - driver.progress.s + race.track.length / 2, race.track.length) - race.track.length / 2;
    stalled = after.distance < after.width / 2 && driver.kart.speed > 4 && gap > 20 ? stalled + 1 : 0;
    assert.ok(stalled < 15, `on-road kart at ${after.s} remains ranked at ${driver.progress.s}`);
    if (previousS > race.track.length - 5 && after.s < 5)
      assert.equal(driver.progress.laps, ++laps, 'scraping a barrier must not lose a completed lap');
    previousS = after.s;
  }
  assert.equal(race.phase, 'finished');
  assert.equal(laps, 3);
});

for (const [noise, period, delay, shortcut] of [[0.6, 4, 0, false], [0.4, 7, 108, false], [0, 4, 0, true]] as const)
test(`${shortcut ? 'shortcut' : 'main'} driving (${noise}/${period}) counts each physical lap and finishes on lap three`, () => {
  const race = new RaceManager({}, 6);
  race.phase = 'racing';
  const driver = race.drivers[0];
  let previousS = projectOnTrack(race.track, driver.kart.x, driver.kart.z).s;
  let laps = -1; // The first crossing leaves the starting grid; it is not a completed lap.
  let input: KartInput = { ...idle };
  for (let frame = 0; frame < 60 * 300 && race.phase !== 'finished'; frame++) {
    const road = projectOnTrack(race.track, driver.kart.x, driver.kart.z);
    if (frame < delay) input = { ...idle, brake: true, reverse: true };
    else if (frame % period === 0) {
      // Drive from the physical road, independently of the progress state being tested.
      input = aiInput(driver.kart, race.track, shortcut, road.s);
      input.steer = clamp(input.steer + Math.sin(frame / 30) * noise, -1, 1);
    }
    race.step(input, 1 / 60);
    const s = projectOnTrack(race.track, driver.kart.x, driver.kart.z).s;
    if (shortcut && laps === 0 && s > race.track.shortcutStart + 100 && s < race.track.shortcutEnd - 50) {
      assert.equal(race.order[0], 0, 'taking the shortcut must keep the lead over cars still on the longer road');
      assert.ok(Math.abs(driver.progress.s - s) < 1, 'shortcut rank must follow the actual kart position');
    }
    if (previousS > race.track.length - 5 && s < 5) {
      laps++;
      assert.equal(driver.progress.laps, laps, `physical lap ${laps} must be counted immediately`);
    }
    previousS = s;
  }
  assert.equal(laps, 3);
  assert.equal(race.phase, 'finished');
  assert.equal(driver.progress.lapTimes.length, 3);
});

test('switching ribbons cannot validate a distant jump onto the shortcut or past its exit', () => {
  for (const [from, to, shortcut] of [[500, 700, true], [790, 920, false]] as const) {
    const race = new RaceManager({}, undefined, 1);
    race.phase = 'racing';
    const driver = race.drivers[0], p = pointAt(race.track, to, shortcut);
    Object.assign(driver.progress, { s: from, distance: from, nextGate: 3 });
    Object.assign(driver.kart, createKart(p.x, p.z, p.heading));
    race.step(idle, 1 / 60);
    assert.equal(driver.progress.distance, from);
    assert.equal(driver.progress.nextGate, 3);
    assert.equal(driver.progress.laps, 0);
  }
});

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
  const race = new RaceManager({}, undefined, 2);
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
      { time: 100, bestLap: 30, place: 9 },
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
  assert.equal(addRecord([], { time: 100, bestLap: 30, place: 8 })[0].place, 8);
});
