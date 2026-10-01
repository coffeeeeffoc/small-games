import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceManager } from '../assets/scripts/RaceManager.ts';
import { createItems } from '../assets/scripts/RoadItems.ts';
import { routes } from '../assets/scripts/RouteCatalog.ts';
import { defaultSelection } from '../assets/scripts/Selection.ts';
import { readRecords } from '../assets/scripts/RankingSystem.ts';
import { readPassport, awardPassport, earnedStamps, passportCount,
  readKartChallenge, readKartChallengeSearch, kartChallengeQuery } from '../assets/scripts/RouteChallenges.ts';

test('route stamps require a real completed solo race, accumulate across runs and preserve old records', () => {
  const race = new RaceManager();
  race.driftBoosts = 4; race.suppliesCollected = 6;
  assert.equal(earnedStamps(race), 0);
  race.phase = 'finished';
  Object.assign(race.drivers[0].progress, { laps: 2, finishedAt: 120 });
  assert.equal(earnedStamps(race), 0, 'unfinished three-lap runs never award a stamp');
  race.drivers[0].progress.laps = 3;
  assert.equal(earnedStamps(race), 7);
  let passport = awardPassport({ city: 1, seaside: 1 }, 'seaside', race);
  assert.equal(passport.seaside, 7);
  assert.equal(passport.city, 1);
  assert.equal(passportCount(passport), 4);
  race.driftBoosts = race.suppliesCollected = 0;
  passport = awardPassport(passport, 'seaside', race);
  assert.equal(passport.seaside, 7, 'a weaker follow-up run cannot remove earned stamps');
  race.networked = true;
  assert.equal(earnedStamps(race), 0, 'server races retain their existing rules and ranking');
  assert.deepEqual(readPassport('{"seaside":7,"city":999,"desert":-1,"unknown":7}'), { seaside: 7 });
  assert.deepEqual(readPassport('{broken'), {});
  assert.deepEqual(readRecords(null, '120.5'), [{ time: 120.5, bestLap: 0, place: 0 }]);
});

test('race counters distinguish charged drift from nitro and useful supplies from hazards', () => {
  const race = new RaceManager(); race.phase = 'racing';
  const kart = race.drivers[0].kart;
  Object.assign(kart, { drifting: true, tier: 1, charge: 1, speed: 20 });
  race.step({ steer: 0, throttle: 1, drift: false, brake: false }, 1 / 60);
  assert.equal(race.driftBoosts, 1);
  Object.assign(kart, { drifting: true, tier: 2, charge: 2 });
  race.step({ steer: 0, throttle: 0, drift: false, brake: true }, 1 / 60);
  assert.equal(race.driftBoosts, 1, 'braking cancels charge without earning a drift stamp');
  race.step({ steer: 0, throttle: 1, drift: false, brake: false, nitro: true }, 1 / 60);
  assert.equal(race.driftBoosts, 1, 'nitro is not a drift reward');
  for (const kind of ['coin', 'oil-slick'] as const) {
    kart.itemCooldown = 0;
    race.items = [{ kind, x: kart.x, y: kart.y, z: kart.z, heading: kart.heading, availableAt: 0 }];
    race.step({ steer: 0, throttle: 0, drift: false, brake: false }, 1 / 60);
  }
  assert.equal(race.itemsCollected, 2);
  assert.equal(race.suppliesCollected, 1);
});

test('a shared challenge reproduces every pickup and rejects forged or cross-mode parameters', () => {
  const selection = { ...defaultSelection, route: 'city', theme: 'glacier' };
  const query = Object.fromEntries(new URLSearchParams(kartChallengeQuery(selection, 0xffffffff, 150.375)));
  const challenge = readKartChallenge(query)!;
  assert.deepEqual(challenge, { selection, seed: 0xffffffff, time: 150.375, mode: 'standard' });
  const search = kartChallengeQuery(selection, 0xffffffff, 150.375);
  assert.deepEqual(readKartChallengeSearch(search), challenge);
  for (const field of Object.keys(query)) {
    assert.equal(readKartChallengeSearch(search + '&' + field + '=' + query[field]), undefined,
      `duplicate ${field} is not an unambiguous challenge`);
  }
  const track = new RaceManager(routes.find((r) => r.id === 'city')!.track).track;
  assert.deepEqual(createItems(track, challenge.seed), createItems(track, 0xffffffff));
  assert.notDeepEqual(createItems(track, challenge.seed), createItems(track, 42));
  for (const override of [{ seed: '-1' }, { seed: '4294967296' }, { seed: '1e3' }, { seed: '00001' },
    { target: 'NaN' }, { target: '0' }, { target: '0150' }, { target: '3600001' }, { route: '../bad' },
    { vehicle: 'unknown' }, { room: 'ABCD1234' }, { kartChallenge: 'v3' }, { mode: 'unknown' }])
    assert.equal(readKartChallenge({ ...query, ...override }), undefined);
  assert.equal(readKartChallenge({ kartChallenge: 'v1' }), undefined);
});
