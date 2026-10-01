import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { explorationRoutes, readRoute, routeProgress, routeShareUrl } from '../src/routes.ts';

test('all exploration goals exist in the actual city and use supported landing points', () => {
  const data = JSON.parse(readFileSync(new URL('../../../../assets/bund/runtime/world/world.json', import.meta.url), 'utf8'));
  for (const route of explorationRoutes) {
    assert.equal(route.stops.length, 3);
    assert.equal(new Set(route.stops.map(stop => stop.landmark)).size, 3);
    for (const stop of route.stops) {
      assert(data.landmarks.some(landmark => landmark.id === stop.landmark));
      assert(stop.destination >= 0 && stop.destination < 5);
    }
  }
});
test('route progress is based on local collected landmarks, with no duplicate or unrelated credit', () => {
  const progress = routeProgress('architecture', ['customs-house', 'customs-house', 'shanghai-tower']);
  assert.equal(progress.completed, 1);
  assert.equal(progress.next.landmark, 'hsbc-building');
  assert.equal(routeProgress('architecture', ['customs-house', 'hsbc-building', 'peace-hotel']).next, null);
  assert.equal(routeProgress(null, ['customs-house']), null);
});
test('shared route selectors reject unknown and duplicated values and retain only the public route', () => {
  assert.equal(readRoute('?route=skyline'), 'skyline');
  for (const search of ['?route=../x', '?route=architecture&route=skyline', '?route=skyline&route=skyline', '?route=', ''])
    assert.equal(readRoute(search), null);
  assert.equal(routeShareUrl('https://example.test/games/travel-bund/index.html?debug=1&token=private#settings', 'bridges'), 'https://example.test/games/travel-bund/index.html?route=bridges');
  assert.equal(routeShareUrl('https://user:password@example.test//games/travel-bund/?private=1#room', 'skyline'), 'https://example.test//games/travel-bund/?route=skyline');
  assert.equal(routeShareUrl('https://example.test/games/travel-bund/index.html?route=skyline', 'unknown' as any), 'https://example.test/games/travel-bund/index.html');
  assert.equal(routeShareUrl('https://example.test/game/?account=private#room', 'skyline', 'original'), 'https://example.test/game/?route=skyline&renderDetail=original');
  assert.equal(routeShareUrl('https://example.test/game/?renderDetail=__proto__', null, '__proto__' as any), 'https://example.test/game/');
});
