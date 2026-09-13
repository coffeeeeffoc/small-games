import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chapterAt, readStamps } from '../src/journey.ts';
import { useJourney } from '../src/store.ts';
import { sceneFrame } from '../src/scene-math.ts';

test('scroll boundaries and malformed or stale saves remain usable', () => {
  assert.deepEqual(
    [-1, 0, 0.249, 0.25, 0.5, 0.75, 1, 3, NaN].map(chapterAt),
    [0, 0, 0, 1, 2, 3, 3, 3, 0],
  );
  for (const raw of [null, 'broken', '{}', 'null']) assert.deepEqual(readStamps(raw), []);
  assert.deepEqual(readStamps('["clock","clock",false,"old","lights"]'), ['clock', 'lights']);
  useJourney.setState({ stamps: [] });
  useJourney.getState().collect('unknown');
  useJourney.getState().collect('clock');
  useJourney.getState().collect('clock');
  assert.deepEqual(useJourney.getState().stamps, ['clock']);
  for (const id of ['roof', 'ferry', 'lights']) useJourney.getState().collect(id);
  assert.equal(useJourney.getState().stamps.length, 4);
  assert.equal(
    useJourney.getState().storageAvailable,
    false,
    'denied or missing storage retains session stamps',
  );
  for (const [width, height] of [
    [1365, 900],
    [320, 640],
    [844, 390],
  ]) {
    for (const progress of [0, 0.25, 0.55, 0.9, 1]) {
      for (const reduced of [true, false]) {
        const frame = sceneFrame(width, height, 1536, 1024, progress, reduced);
        assert.ok(frame.x <= 0 && frame.y <= 0);
        assert.ok(frame.x + 1536 * frame.scale >= width);
        assert.ok(frame.y + 1024 * frame.scale >= height);
        assert.ok(frame.night >= 0 && frame.night <= 1);
      }
    }
  }
});
