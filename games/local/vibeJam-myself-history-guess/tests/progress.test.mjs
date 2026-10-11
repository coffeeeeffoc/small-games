import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readScenes } from '../scripts/check-catalog.mjs';
import { LEVELS } from '../src/chapters.js';
import { restorePracticeJourney } from '../src/progress.js';

const catalog = readScenes();
const checkpoint = (level = LEVELS[0]) => ({
  version: 2,
  level: level.id,
  deck: [...level.scenes],
  index: 0,
  results: [],
  phase: 'paused',
  year: -221,
  yearTouched: true,
  guess: { lat: 34, lng: 108 },
  deadline: 123456,
  pausedRemaining: level.seconds * 1000,
  dev: false,
});
test('configured early and final checkpoints preserve timing, guesses and results', () => {
  const first = checkpoint();
  assert.equal(restorePracticeJourney(first, catalog).pausedRemaining, 45000);
  const last = LEVELS.at(-1),
    journey = checkpoint(last);
  const records = { [LEVELS.at(-2).id]: { complete: true } };
  assert.equal(restorePracticeJourney(journey, catalog, records).deck[0].id, last.scenes[0]);
  journey.phase = 'revealed';
  journey.results = [{ id: last.scenes[0], total: 3000, timedOut: false }];
  assert.deepEqual(restorePracticeJourney(journey, catalog, records).results, journey.results);
});
test('corrupt and cross-level saves cannot award progress for another question set', () => {
  for (const mutate of [
    (journey) => (journey.level = 'missing'),
    (journey) => (journey.level = LEVELS.at(-1).id),
    (journey) => journey.deck.reverse(),
    (journey) => (journey.deck[1] = journey.deck[0]),
    (journey) => (journey.pausedRemaining = 45001),
    (journey) => (journey.year = 0),
    (journey) => (journey.yearTouched = 'true'),
    (journey) => (journey.dev = 'true'),
    (journey) => {
      journey.phase = 'revealed';
      journey.results = [{ id: 'wrong-scene', total: 5000 }];
    },
    (journey) => {
      journey.phase = 'revealed';
      journey.results = [{ id: journey.deck[0], total: 5000, timedOut: true }];
    },
  ]) {
    const journey = checkpoint();
    mutate(journey);
    assert.equal(restorePracticeJourney(journey, catalog), null);
  }
  const late = checkpoint(LEVELS.at(-1));
  assert.equal(
    restorePracticeJourney(late, catalog),
    null,
    'locked levels are not resumed as normal play',
  );
  assert.ok(
    restorePracticeJourney({ ...late, dev: true }, catalog),
    'dev saves stay isolated practice',
  );
});
test('migrated unbound legacy journeys remain playable without a new level award', () => {
  const legacy = { ...checkpoint(), level: null, deck: ['changan'], pausedRemaining: 25000 };
  assert.ok(restorePracticeJourney(legacy, catalog));
  assert.equal(restorePracticeJourney({ ...legacy, pausedRemaining: 25001 }, catalog), null);
});
