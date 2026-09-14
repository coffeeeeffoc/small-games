import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chapters, chapterAt, chapterProgress, readStamps } from '../src/journey.ts';
import { useJourney } from '../src/store.ts';
import { sceneFrame } from '../src/scene-math.ts';

test('scroll boundaries and malformed or stale saves remain usable', () => {
  assert.deepEqual(
    [-1, 0, 1 / chapters.length - 0.00001, 1 / chapters.length, 0.5, 0.75, 1, 3, NaN].map(
      chapterAt,
    ),
    [0, 0, 0, 1, 6, 9, 11, 11, 0],
  );
  for (const raw of [null, 'broken', '{}', 'null']) assert.deepEqual(readStamps(raw), []);
  assert.deepEqual(readStamps('["clock","clock",false,"old","lights"]'), ['clock', 'lights']);
  assert.deepEqual(readStamps('["clock","roof","ferry","lights"]'), [
    'clock',
    'roof',
    'ferry',
    'lights',
  ]);
  useJourney.setState({ stamps: [] });
  useJourney.getState().collect('unknown');
  useJourney.getState().collect('clock');
  useJourney.getState().collect('clock');
  assert.deepEqual(useJourney.getState().stamps, ['clock']);
  for (const { id } of chapters) useJourney.getState().collect(id);
  assert.equal(useJourney.getState().stamps.length, chapters.length);
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
    for (const progress of Array.from({ length: 1001 }, (_, i) => i / 1000)) {
      for (const reduced of [true, false]) {
        const frame = sceneFrame(width, height, 1536, 1024, progress, reduced);
        assert.ok(frame.x <= 0 && frame.y <= 0);
        assert.ok(frame.x + 1536 * frame.scale >= width);
        assert.ok(frame.y + 1024 * frame.scale >= height);
        assert.ok(frame.night >= 0 && frame.night <= 1);
        assert.ok(Math.abs(Object.values(frame.weights).reduce((a, b) => a + b) - 1) < 1e-10);
      }
    }
  }
  for (const [index, chapter] of chapters.entries()) {
    assert.equal(chapterAt(chapterProgress(index)), index);
    const frame = sceneFrame(390, 844, 1536, 1024, chapterProgress(index), false);
    assert.equal(frame.weights[chapter.art], 1);
    assert.equal(chapter.shot, index % 2 ? '近景' : '远景');
    if (index) {
      const before = sceneFrame(390, 844, 1536, 1024, index / chapters.length - 1e-8, false);
      const after = sceneFrame(390, 844, 1536, 1024, index / chapters.length + 1e-8, false);
      assert.ok(
        Math.abs(before.x - after.x) < 0.001 && Math.abs(before.scale - after.scale) < 0.001,
        'Camera stays continuous in either scroll direction',
      );
      const previous = sceneFrame(390, 844, 1536, 1024, chapterProgress(index - 1), false);
      assert.ok(
        index % 2 ? frame.scale > previous.scale * 1.5 : frame.scale < previous.scale / 1.5,
        'Wide and close compositions must differ visibly',
      );
    }
  }
});
