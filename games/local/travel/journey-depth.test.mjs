import assert from 'node:assert/strict';
import { journeyFrame, projectJourney, JOURNEY_END } from './journey-depth.mjs';
import { newGame, canVisit, completeVisit } from './game-state.mjs';

for (let p = 0; p <= JOURNEY_END; p += .025) {
  const frames = Array.from({ length: 6 }, (_, index) => journeyFrame(p, index));
  assert.ok(frames.every(frame => frame.opacity === 1), 'Chapter changes never fade the world');
  assert.ok(frames.filter(frame => frame.opacity * frame.copyOpacity > .01).length <= 1, `Overlapping headlines at ${p}`);
}
const forward = [0, .2, .6, .8, 1, 1.6, 2.8, 5.58].map(p => journeyFrame(p, 1));
const reverse = [5.58, 2.8, 1.6, 1, .8, .6, .2, 0].map(p => journeyFrame(p, 1)).reverse();
assert.deepEqual(forward, reverse);
assert.equal(journeyFrame(.8, 1, true).copyY, 0);
assert.deepEqual(journeyFrame(-100, 0), journeyFrame(0, 0));
assert.deepEqual(journeyFrame(Infinity, 0), journeyFrame(0, 0));
for (const [width, height] of [[390, 844], [1440, 900], [844, 390]]) {
  const start = projectJourney(0, width, height);
  const end = projectJourney(1, width, height);
  const farTravel = Math.abs(end.far.x - start.far.x);
  const midTravel = Math.abs(end.landmarks[0].x - start.landmarks[0].x);
  const nearTravel = Math.abs(end.foreground[0].x - start.foreground[0].x);
  assert.ok(farTravel < midTravel * .1 && nearTravel > midTravel * 1.4);
  const positions = [];
  for (let step = 0; step <= 120; step++) {
    const p = step / 120;
    const frame = projectJourney(p, width, height);
    positions.push(frame);
    assert.ok(frame.far.x <= 0 && frame.far.x + frame.far.width >= width, 'Shared background always covers viewport');
    assert.ok(frame.landmarks.every(rect => rect.scale > .7 && rect.scale <= 1));
    if (step) {
      const previous = positions[step - 1];
      for (let i = 0; i < 2; i++) assert.ok(Math.abs(frame.landmarks[i].x - previous.landmarks[i].x) < width * .04, 'Small scroll steps give small image changes');
    }
  }
  for (let step = 120; step >= 0; step--) assert.deepEqual(projectJourney(step / 120, width, height), positions[step]);
  const still = projectJourney(.5, width, height, true);
  assert.equal(still.landmarks[0].scale, 1);
  assert.notEqual(still.landmarks[0].x, still.landmarks[1].x, 'Reduced motion keeps spatial layout');
}
let state = newGame();
for (const id of ['oldtown', 'pagodas', 'meadow', 'village', 'cafe']) {
  assert.equal(canVisit(state, id).ok, true);
  state = completeVisit(state, id, 100);
  assert.equal(canVisit(state, id).ok, false);
}
assert.equal(state.hour, 18);
assert.equal(canVisit(state, 'pier').ok, false);
assert.equal(journeyFrame(5.3, 5).opacity, 1, 'Last chapter remains visible after the game day ends');
console.log('Journey checks passed: fixed world, depth parallax, small-step continuity, reverse camera, reduced motion and collection state.');
