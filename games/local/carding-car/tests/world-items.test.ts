import assert from 'node:assert/strict';
import test from 'node:test';
import { createKart, driveKart, resolveKartBarriers, barrierOverlap } from '../assets/scripts/KartPhysics.ts';
import { createTrack, pointAt } from '../assets/scripts/TrackGenerator.ts';
import { createItems, collectItems, applyItem, itemKinds } from '../assets/scripts/RoadItems.ts';
import { RaceManager } from '../assets/scripts/RaceManager.ts';
import { aiInput } from '../assets/scripts/KartAI.ts';
import {
  cycleSelection,
  defaultSelection,
  readSelection,
  vehicles,
  drivers,
} from '../assets/scripts/Selection.ts';
import { worlds } from '../assets/scripts/WorldCatalog.ts';

const throttle = { steer: 0, throttle: 1, brake: false, drift: false };
test('hazard recovery and continuous checkpoints survive delayed steering around seaside bends', () => {
  for (const seed of [6, 3054492996]) {
    const race = new RaceManager({}, seed);
    race.start();
    let input = { ...throttle };
    for (let frame = 0; frame < 60 * 240 && race.phase !== 'finished'; frame++) {
      const driver = race.drivers[0];
      if (frame % 4 === 0) input = aiInput(driver.kart, race.track, false, driver.progress.s);
      race.step(input, 1 / 60);
    }
    assert.equal(race.phase, 'finished', `seed ${seed}`);
    assert.equal(race.resets, 0, 'driving inputs recover without teleporting the player');
  }
});
test('spinning body remains inside the visible guardrail throughout a slip', () => {
  const track = createTrack();
  for (const side of [-1, 1]) {
    const road = pointAt(track, 50);
    const kart = createKart(road.x + Math.cos(road.heading) * side * 7.7, road.z - Math.sin(road.heading) * side * 7.7, road.heading);
    for (let step = 0; step <= 24; step++) {
      kart.spinAngle = step * Math.PI / 12;
      resolveKartBarriers(kart, track.barriers);
      const visiblePose = { ...kart, heading: kart.heading + kart.spinAngle, spinAngle: 0 };
      assert.ok(track.barriers.every(wall => !barrierOverlap(visiblePose, wall)), `side=${side}, spin=${kart.spinAngle}`);
    }
  }
});
test('selection validates persisted values and cycles every advertised world/car/driver', () => {
  for (const value of [null, 'null', '{broken', '[]', '{"world":"no","vehicle":0}'])
    assert.deepEqual(readSelection(value), defaultSelection);
  assert.equal(worlds.length, 8);
  assert.equal(vehicles.length, 10);
  assert.equal(drivers.length, 10);
  for (const field of ['world', 'vehicle', 'driver'] as const) {
    let selection = { ...defaultSelection };
    const seen = new Set<string>();
    const count = field === 'world' ? 8 : 10;
    for (let i = 0; i < count; i++) {
      seen.add(selection[field]);
      selection = cycleSelection(selection, field, 1);
      assert.deepEqual(readSelection(JSON.stringify(selection)), selection);
    }
    assert.equal(seen.size, count);
    assert.equal(selection[field], defaultSelection[field]);
    assert.equal(
      cycleSelection(cycleSelection(selection, field, -1), field, 1)[field],
      selection[field],
    );
  }
});
test('random placements cover twelve kinds, stay on the road, and repeat only for the same seed', () => {
  const track = createTrack();
  const items = createItems(track, 17);
  assert.equal(new Set(items.map((i) => i.kind)).size, 12);
  assert.deepEqual(createItems(track, 17), items);
  assert.notDeepEqual(createItems(track, 18), items);
  assert.ok(items.every((i) => Number.isFinite(i.x + i.y + i.z) && i.availableAt === 0));
});
test('all items have gameplay effects, sweep pickups cannot repeat, shield blocks a hazard', () => {
  const effects = {
    'boost-pad': 'boost',
    coin: 'coins',
    'freeze-orb': 'slow',
    magnet: 'magnet',
    'mystery-box': 'shield',
    nitro: 'boost',
    'oil-slick': 'slip',
    'repair-kit': 'boost',
    roadblock: 'slow',
    shield: 'shield',
    'spring-pad': 'airborne',
    'watermelon-peel': 'spin',
  } as const;
  for (const kind of itemKinds) {
    const kart = createKart(0, 0, 0);
    kart.speed = 25;
    applyItem(kart, kind);
    assert.ok(kart[effects[kind]], kind);
    assert.ok(kart.itemMessage);
  }
  const kart = createKart(0, 5, 0);
  const items = [
    { kind: 'watermelon-peel' as const, x: 0, y: 0, z: 0, heading: 0, availableAt: 0 },
  ];
  assert.equal(collectItems(items, kart, { x: 0, z: -5 }, 0), 1);
  assert.ok(kart.spin > 0);
  assert.equal(collectItems(items, kart, { x: 0, z: -5 }, 0.1), 0);
  driveKart(kart, throttle, 1 / 30);
  assert.ok(kart.spinAngle > 0);
  const defended = createKart(0, 0, 0);
  defended.speed = 25;
  applyItem(defended, 'shield');
  applyItem(defended, 'roadblock');
  assert.equal(defended.speed, 25);
  assert.equal(defended.shield, 0);
  const magnet = createKart(4, 0, 0);
  applyItem(magnet, 'magnet');
  assert.equal(
    collectItems(
      [{ kind: 'coin', x: 0, y: 0, z: 0, heading: 0, availableAt: 0 }],
      magnet,
      { x: 4, z: 0 },
      0,
    ),
    1,
  );
});
test('loading blocks start, pause freezes items/effects, and a new race clears effects and rerolls pickups', () => {
  const race = new RaceManager({}, 100);
  race.loaded = false;
  race.start();
  assert.equal(race.phase, 'ready');
  race.loaded = true;
  race.start();
  race.phase = 'racing';
  applyItem(race.drivers[0].kart, 'watermelon-peel');
  race.pause();
  const before = JSON.stringify(race.drivers[0].kart);
  race.step(throttle, 1 / 60);
  assert.equal(JSON.stringify(race.drivers[0].kart), before);
  race.resume();
  race.step(throttle, 1 / 60);
  assert.ok(race.drivers[0].kart.spinAngle > 0);
  const next = new RaceManager({}, 101);
  assert.equal(next.drivers[0].kart.spin, 0);
  assert.equal(next.time, 0);
  assert.notDeepEqual(race.items, next.items);
});
test('a custom elevated track without a shortcut completes three laps with shared physics and checkpoints', () => {
  const options = {
    controls: [
      [0, -100, 0],
      [100, -100, 1],
      [140, 0, 2],
      [100, 100, 1],
      [0, 130, 0],
      [-100, 100, 1],
      [-140, 0, 2],
      [-100, -100, 1],
    ] as [number, number, number][],
    width: 16,
    shortcut: false as const,
  };
  const race = new RaceManager(options, 23);
  race.phase = 'racing';
  assert.equal(race.track.shortcut.length, 0);
  assert.ok(Number.isFinite(pointAt(race.track, 100, true).x));
  for (let i = 0; i < 60 * 240 && race.phase !== 'finished'; i++) {
    race.step(aiInput(race.drivers[0].kart, race.track, false, race.drivers[0].progress.s), 1 / 60);
    assert.ok(Number.isFinite(race.drivers[0].progress.distance));
  }
  assert.equal(race.phase, 'finished');
  assert.equal(race.drivers[0].progress.laps, 3);
});
