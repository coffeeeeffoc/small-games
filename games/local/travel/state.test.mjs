import assert from 'node:assert/strict';
import { PLACES, newGame, starsForScore, isValidPhoto, restoreGame, canVisit, completeVisit, rest, finishTrip, tripTitle } from './game-state.mjs';

const initial = newGame();
assert.equal(PLACES.length, 6);
assert.deepEqual(initial.position, { x: 47, y: 85 });
assert.deepEqual(PLACES.map(({ id, x, y }) => [id, x, y]), [
  ['oldtown', 25, 49], ['pagodas', 20, 25], ['meadow', 47, 22],
  ['village', 77, 24], ['cafe', 82, 56], ['pier', 52, 71],
]);
assert.equal(canVisit(initial, 'oldtown').ok, true);
assert.equal(canVisit(initial, 'missing').ok, false);
const visited = completeVisit(initial, 'oldtown', 86.4);
assert.deepEqual(initial, newGame(), 'visiting must not mutate the previous state');
assert.deepEqual(visited.visits, [{ id: 'oldtown', score: 86, stars: 3 }]);
assert.equal(visited.money, 200 - PLACES[0].cost);
assert.equal(visited.energy, 100 - PLACES[0].energy);
assert.equal(visited.hour, 10);
assert.equal(visited.memories, 86);
assert.deepEqual(visited.position, { x: 25, y: 49 });
assert.equal(canVisit(visited, 'oldtown').ok, false);
assert.throws(() => completeVisit(visited, 'oldtown', 80));
assert.throws(() => completeVisit(initial, 'oldtown', NaN));
assert.equal(completeVisit(initial, 'oldtown', 1000).visits[0].score, 100);
assert.equal(completeVisit(initial, 'oldtown', -12).visits[0].score, 0);
assert.equal(canVisit({ ...initial, money: 0 }, 'oldtown').ok, false);
assert.equal(canVisit({ ...initial, energy: 0 }, 'oldtown').ok, false);
assert.equal(canVisit({ ...initial, hour: 17 }, 'oldtown').ok, false);

const photo = 'data:image/jpeg;base64,/9j/AA==';
const photographed = completeVisit(initial, 'oldtown', 90, photo);
assert.equal(isValidPhoto(photo), true);
assert.equal(photographed.visits[0].photo, photo);
for (const state of [photographed, rest(photographed), finishTrip(photographed), completeVisit(photographed, 'pier', 80)]) {
  assert.equal(state.visits[0].photo, photo, 'state transitions must preserve captured photos');
  assert.deepEqual(restoreGame(JSON.parse(JSON.stringify(state))), state);
}
const longestPhoto = 'data:image/jpeg;base64,' + 'A'.repeat(220000 - 'data:image/jpeg;base64,'.length);
assert.equal(isValidPhoto(longestPhoto), true);
for (const invalidPhoto of [null, 12, {}, [], '', 'javascript:alert(1)', 'https://example.com/photo.jpg',
  'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,AA==', 'data:image/jpeg;base64,',
  'data:image/jpeg;base64,AA===', photo + '\n', photo + '\r', longestPhoto + 'A']) {
  assert.equal(isValidPhoto(invalidPhoto), false);
  assert.throws(() => completeVisit(initial, 'oldtown', 90, invalidPhoto), /照片格式无效/);
  assert.deepEqual(initial, newGame(), 'invalid photos must not change the previous state');
  assert.deepEqual(restoreGame({ ...photographed, visits: [{ ...photographed.visits[0], photo: invalidPhoto }] }), newGame());
}

const rested = rest(visited);
assert.equal(rested.hour, 11);
assert.equal(rested.money, visited.money - 15);
assert.equal(rested.energy, 100);
assert.equal(visited.hour, 10);
assert.throws(() => rest(initial));
assert.throws(() => rest({ ...visited, money: 14 }));
assert.equal(rest({ ...visited, energy: 20 }).energy, 50);
assert.equal(rest({ ...visited, hour: 17 }).status, 'finished');
const lastVisit = completeVisit({ ...visited, hour: 16 }, 'pier', 75);
assert.equal(lastVisit.hour, 18);
assert.equal(lastVisit.status, 'finished');
assert.throws(() => completeVisit(lastVisit, 'cafe', 75));
assert.throws(() => rest(lastVisit));
const finished = finishTrip(visited);
assert.equal(finished.status, 'finished');
assert.equal(visited.status, 'playing');
assert.equal(canVisit(finished, 'pier').ok, false);

for (const state of [initial, visited, rested, lastVisit, finished]) {
  const restored = restoreGame(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored, state);
  assert.notEqual(restored.visits, state.visits);
  assert.notEqual(restored.position, state.position);
}
for (const invalid of [null, [], 'oops', {}, { ...visited, money: -1 }, { ...visited, money: 201 },
  { ...visited, hour: 8 }, { ...visited, hour: 18 }, { ...visited, energy: 100.5 },
  { ...visited, position: { x: NaN, y: 90 } }, { ...visited, position: { x: 101, y: 90 } },
  { ...visited, memories: 90 }, { ...visited, status: 'cheating' },
  { ...visited, visits: [{ id: 'oldtown', score: 86, stars: 1 }] },
  { ...visited, visits: [{ id: 'invalid', score: 86, stars: 3 }] },
  { ...visited, hour: 12, visits: [...visited.visits, ...visited.visits], memories: 172 }]) {
  assert.deepEqual(restoreGame(invalid), newGame());
}
assert.deepEqual([0, 54, 55, 84, 85, 100].map(starsForScore), [1, 1, 2, 2, 3, 3]);
assert.throws(() => starsForScore(NaN));
let journey = newGame();
for (const place of [PLACES[0], PLACES[1], PLACES[3], PLACES[4], PLACES[5]]) journey = completeVisit(journey, place.id, 90);
assert.equal(journey.status, 'finished');
assert.equal(journey.visits.length, 5);
assert.equal(journey.memories, 450);
assert.equal(tripTitle(journey), '山海摄影师');
assert.equal(tripTitle(initial), '心向远方');
let lateJourney = completeVisit(newGame(), 'oldtown', 90);
lateJourney = rest(lateJourney);
for (const id of ['pagodas', 'village', 'cafe']) lateJourney = completeVisit(lateJourney, id, 90);
assert.equal(lateJourney.hour, 17);
assert.equal(lateJourney.visits.length, 4);
assert.equal(canVisit(lateJourney, 'pier').ok, false);
const endOfDayRest = rest(lateJourney);
assert.equal(endOfDayRest.hour, 18);
assert.equal(endOfDayRest.status, 'finished');
assert.equal(lateJourney.hour, 17, 'rest must not mutate the previous state');
assert.deepEqual(restoreGame(endOfDayRest), endOfDayRest);
console.log('✓ Game state: visits, resources, timing, rest, finish, save validation, captured photos, and full trip passed.');
