import test from 'node:test';
import assert from 'node:assert/strict';
import { readScenes } from '../scripts/check-catalog.mjs';
import { routes, routeInfo, routeDeck, restoreRouteJourney, parseRoute, routeUrl } from '../src/routes.js';
import { restoreJourney } from '../src/game.js';
import { parseChallenge } from '../src/challenge.js';

test('three sourced theme routes retain identical decks and non-answer observation questions', () => {
  const catalog = readScenes();
  const ids = new Set();
  for (const route of routes) {
    const deck = routeDeck(catalog, route.id);
    assert.equal(deck.length, 3); assert.equal(new Set(deck.map(round => round.id)).size, 3);
    assert.deepEqual(routeDeck([...catalog].reverse(), route.id), deck);
    assert.equal(route.questions.length, 3);
    deck.forEach((round, i) => {
      ids.add(round.id); assert.ok(round.source[1].startsWith('https://'));
      assert.ok(route.questions[i].endsWith('？'));
      assert.ok(!route.questions[i].includes(String(Math.abs(round.year))), 'no answer year');
      const place = round.place.split(' · ').at(-1).split('（')[0];
      assert.ok(!route.questions[i].includes(place), 'no answer city');
    });
    const record = { version:1, route:route.id, region:'all', timed:false, practice:'', deck:route.scenes,
      index:0, results:[], phase:'guessing', guess:null, year:1000, yearTouched:false, deadline:1234 };
    assert.equal(restoreRouteJourney(record,catalog).route,route.id);
    assert.equal(restoreJourney(record,catalog),null,'theme record cannot masquerade as ordinary five-round journey');
    assert.equal(restoreRouteJourney({...record,daily:{day:'2026-10-01',region:'all',timed:false}},catalog),null);
    assert.equal(restoreRouteJourney({...record,timed:true},catalog),null);
    assert.equal(restoreRouteJourney({...record,deck:[...route.scenes].reverse()},catalog),null);
    const url=routeUrl({href:'https://user:private@example.test/pages/history/?token=secret&year=1100#auth'},route.id);
    assert.equal(url,`https://example.test/pages/history/?route=${route.id}&v=1`);
    assert.equal(parseRoute(new URL(url).search).route,route.id);
  }
  assert.equal(ids.size,9,'three themes offer nine different sourced scenes');
  assert.equal(routeInfo('unknown'),null);
  for (const query of ['?route=unknown','?route=market&route=harbor','?route=craft&v=2','?route=market&v=1&v=1','?route=market&daily=2026-10-01']) assert.equal(parseRoute(query).error,true);
  assert.equal(parseChallenge('?route=market&daily=2026-10-01').error,true);
});
