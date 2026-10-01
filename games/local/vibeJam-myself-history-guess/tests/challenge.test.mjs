import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readScenes } from '../scripts/check-catalog.mjs';
import { createCatalog } from '../src/catalog.js';
import { validDay, today, dailyDeck, parseChallenge, challengeUrl, restoreDailyJourney } from '../src/challenge.js';

test('daily journeys validate public rules and choose stable decks regardless of footprints/catalog traversal', () => {
  assert.equal(today(new Date('2026-10-01T16:00:00Z')), '2026-10-02');
  assert.equal(validDay('2024-02-29'), true);
  for (const day of ['1999-01-01', '2100-01-01', '2026-02-29', '2026-13-01', '2026-1-01']) assert.equal(validDay(day), false);
  for (const query of ['?daily=2026-10-01&region=', '?daily=2026-10-01&region=world', '?daily=2026-10-01&timed=true', '?daily=2026-10-01&timed=', '?daily=2026-10-01&v=2', '?daily=2026-10-01&daily=2026-10-01', '?daily=2026-10-01&timed=1&timed=1']) assert.equal(parseChallenge(query).error, true);
  const catalog = createCatalog(readScenes(), '');
  for (const region of ['all', 'china']) {
    const challenge = { day: '2026-10-01', region, timed: true };
    const deck = dailyDeck(catalog, challenge);
    assert.equal(deck.length, 5);
    assert.equal(new Set(deck.map(round => round.id)).size, 5);
    assert.deepEqual(deck, dailyDeck([...catalog].reverse(), challenge));
    if (region === 'china') assert.ok(deck.every(round => round.region === 'china'));
    assert.deepEqual(deck, dailyDeck(catalog, { ...challenge, timed: false }), 'timed and untimed can practice the same scenes');
    const journey = { version: 1, daily: challenge, region, timed: true, practice: '', deck: deck.map(round => round.id), index: 0, results: [], phase: 'guessing', guess: null, year: 1000, yearTouched: false, deadline: 123456 };
    assert.deepEqual(restoreDailyJourney(journey, catalog).deck, deck);
    assert.equal(restoreDailyJourney({ ...journey, region: region === 'all' ? 'china' : 'all' }, catalog), null);
    const changed = [...journey.deck]; [changed[0], changed[1]] = [changed[1], changed[0]];
    assert.equal(restoreDailyJourney({ ...journey, deck: changed }, catalog), null, 'a corrupt daily save cannot substitute a different deck');
    const link = challengeUrl({ href: 'https://user:password@example.com/project/history/index.html?token=private&year=1420#answers' }, challenge);
    assert.deepEqual([...new URL(link).searchParams.keys()], ['daily', 'v', 'region', 'timed']);
    assert.ok(!/password|private|year|answers/.test(link));
    assert.deepEqual(parseChallenge(new URL(link).search).challenge, challenge);
  }
});
