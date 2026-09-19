import assert from 'node:assert/strict';
import test from 'node:test';
import { RaceManager } from '../assets/scripts/RaceManager.ts';

const stopped = { steer: 0, throttle: 0, brake: true, drift: false };
const drive = { ...stopped, brake: false, throttle: 1 };
test('two humans have independent inputs, bots run on the server, and one finisher does not stop everyone', () => {
  const race = new RaceManager({}, 123, 8);
  race.phase = 'racing';
  for (let i = 0; i < 120; i++) race.step(stopped, 1 / 60, [stopped, drive]);
  assert.equal(race.drivers.length, 8);
  assert.equal(race.drivers[0].kart.speed, 0);
  assert.ok(race.drivers[1].kart.speed > 10);
  assert.ok(race.drivers.slice(2).every((d) => d.progress.distance > 0));
  race.drivers[0].progress.finishedAt = race.time;
  const before = race.drivers[1].progress.distance;
  race.step(stopped, 1 / 60, [stopped, drive]);
  assert.equal(race.phase, 'racing');
  assert.ok(race.drivers[1].progress.distance > before);
  race.drivers.forEach((d) => {
    d.progress.finishedAt = race.time;
  });
  race.step(stopped, 1 / 60, [stopped, drive]);
  assert.equal(race.phase, 'finished');
  const client = new RaceManager({}, 123, 2);
  client.networked = true;
  client.phase = 'racing';
  client.step(drive, 1 / 60);
  client.pause();
  assert.equal(client.time, 0);
  assert.equal(client.phase, 'racing');
  assert.throws(() => new RaceManager({}, 1, 9));
});
