import assert from 'node:assert/strict';
import test from 'node:test';
import { RaceManager } from '../assets/scripts/RaceManager.ts';
import { routes } from '../assets/scripts/RouteCatalog.ts';
import { aiInput } from '../assets/scripts/KartAI.ts';
import { defaultSelection } from '../assets/scripts/Selection.ts';
import { createProgress, advanceCheckpoint } from '../assets/scripts/CheckpointSystem.ts';
import { updateLap } from '../assets/scripts/LapSystem.ts';
import { earnedStamps, raceRecordKey, readRaceModeSearch, readKartChallenge,
  readKartChallengeSearch, kartChallengeQuery, sprintNextGoal } from '../assets/scripts/RouteChallenges.ts';

test('all eight routes finish one real legal lap with pickups and rivals in the short mode', () => {
  const times: Record<string, number> = {};
  for (const route of routes) {
    const race = new RaceManager(route.track, 20261001, 4, 'sprint');
    race.start();
    for (let step = 0; step < 60 * 150 && race.phase !== 'finished'; step++) {
      const p = race.drivers[0];
      race.step(aiInput(p.kart, race.track, false, p.progress.s), 1 / 60);
    }
    assert.equal(race.phase, 'finished', route.id);
    assert.equal(race.drivers[0].progress.laps, 1);
    assert.equal(race.drivers[0].progress.lapTimes.length, 1);
    assert(race.itemsCollected > 0, route.id + ' has actual reachable pickups');
    assert(race.drivers.slice(1).every((driver) => driver.progress.distance > race.track.length * .3));
    assert.equal(earnedStamps(race), 0);
    times[route.id] = Number(race.time.toFixed(2));
  }
  assert(times.seaside < 60, 'the default quick race can finish within the opening minute');
  console.log('One-lap rule replays (s):', JSON.stringify(times));
});

test('short races retain checkpoint validation while the server/default race still requires three laps', () => {
  const standard = new RaceManager(), sprint = new RaceManager({}, 1, 4, 'sprint');
  assert.equal(standard.laps, 3);
  const shortProgress = createProgress(0), longProgress = createProgress(0);
  assert.equal(updateLap(shortProgress, true, 30, sprint.laps), true);
  assert.equal(updateLap(longProgress, true, 30), false);
  assert.equal(longProgress.finishedAt, 0);
  const cheat = createProgress(0);
  for (const s of [standard.track.length - 1, 1, 100, 1])
    assert.equal(advanceCheckpoint(cheat, sprint.track, s, 2, true), false);
  assert.equal(cheat.laps, 0);
  assert.notEqual(raceRecordKey('seaside', 'sprint'), raceRecordKey('seaside', 'standard'));
  assert.equal(raceRecordKey('seaside', 'standard'), 'coastline-records-v1');
});

test('versioned invitations keep old three-lap challenges and reject ambiguous short race selectors', () => {
  const query = kartChallengeQuery(defaultSelection, 42, 30, 'sprint');
  const short = readKartChallengeSearch(query)!;
  assert.equal(short.mode, 'sprint');
  const old = Object.fromEntries(new URLSearchParams(query));
  old.kartChallenge = 'v1'; delete old.mode;
  assert.equal(readKartChallenge(old)!.mode, 'standard');
  assert.equal(readKartChallenge({ ...old, mode: 'sprint' }), undefined);
  const current = { ...old, kartChallenge: 'v2' };
  assert.equal(readKartChallenge(current), undefined, 'v2 cannot omit its race rules');
  assert.equal(readKartChallenge({ ...current, mode: 'sprint' })!.mode, 'sprint');
  assert.equal(readRaceModeSearch('?mode=sprint'), 'sprint');
  for (const search of ['?mode=sprint&mode=sprint', '?mode=sprint&mode=standard',
    '?mode=unknown', '?mode=sprint&kartChallenge=v3', '?mode=sprint&room=ABCD1234'])
    assert.equal(readRaceModeSearch(search), undefined);
});

test('short results recommend a goal based on actual collisions, drift and placement', () => {
  const race = new RaceManager({}, 1, 4, 'sprint');
  race.collisions = 1;
  assert.match(sprintNextGoal(race), /少碰一次/);
  race.collisions = 0;
  assert.match(sprintNextGoal(race), /一次.*漂移/);
  race.driftBoosts = 1;
  race.drivers[1].progress.distance = 20;
  assert.match(sprintNextGoal(race), /第 1 名/);
  race.drivers[0].progress.distance = 30;
  assert.match(sprintNextGoal(race), /换条路线/);
});
