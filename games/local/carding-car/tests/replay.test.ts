import assert from 'node:assert/strict';
import test from 'node:test';
import { routes } from '../assets/scripts/RouteCatalog.ts';
import { RaceManager } from '../assets/scripts/RaceManager.ts';
import { aiInput } from '../assets/scripts/KartAI.ts';
import { createKartReplay, applyKartReplay, kartReplayResult, raceCheckpoint, raceSetup } from '../assets/scripts/RaceReplay.ts';

for (const route of routes) test(`${route.id}: genuine driving reproduces all checkpoints, pickups and finish across durable batches`, () => {
  for (const mode of ['standard', 'sprint'] as const) {
    const race = new RaceManager(route.track, 20260919, 4, mode);
    race.start(); race.step({ steer: 0, throttle: 0, brake: false, drift: false }, 3);
    let state = createKartReplay(`${route.id}-${mode}`, 20260919, `${route.id}:4:0:0:0`);
    let frames = [] as { input: Record<string, unknown>; ticks: number }[];
    for (let tick = 0; tick < 60 * 360 && race.phase !== 'finished'; tick++) {
      const player = race.drivers[0];
      const drive = aiInput(player.kart, race.track, false, player.progress.s);
      frames.push({ input: { drive }, ticks: 2 });
      race.step(drive, 1 / 60);
      if (frames.length === 120 || race.phase === 'finished') {
        state = JSON.parse(JSON.stringify(state));
        applyKartReplay(state, frames); frames = [];
      }
    }
    assert.equal(race.phase, 'finished');
    assert.deepEqual(state.race, raceCheckpoint(race));
    assert.deepEqual(kartReplayResult(state), { complete: true, eligible: true, score: 1,
      secondary: Math.round(race.drivers[0].progress.finishedAt * 1000) });
    assert.throws(() => applyKartReplay(state, [{ input: { drive: { steer: 0, throttle: 1, brake: false, drift: false } }, ticks: 2 }]));
  }
});

test('scores, state, impossible controls and mismatched course configurations are rejected', () => {
  const state = createKartReplay('seaside-standard', 99, 'seaside:4:0:0:0');
  const drive = { steer: 0, throttle: 1, brake: false, drift: false };
  for (const input of [{ score: 1 }, { drive, x: 100 }, { drive: { ...drive, steer: NaN } },
    { drive: { ...drive, throttle: 2 } }, { drive: { ...drive, lap: 3 } }, { drive: { ...drive, nitro: 1 } }])
    assert.throws(() => applyKartReplay(state, [{ input, ticks: 2 }]));
  for (const ticks of [0, 1, -2, 2402]) assert.throws(() => applyKartReplay(state, [{ input: { drive }, ticks }]));
  assert.throws(() => raceSetup('city-standard', 'seaside:4:0:0:0'));
  assert.throws(() => raceSetup('seaside-standard', 'seaside:4:9:0:0'));
  assert.equal(kartReplayResult(state).complete, false);
});
