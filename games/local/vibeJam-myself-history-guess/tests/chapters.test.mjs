import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readScenes } from '../scripts/check-catalog.mjs';
import { CHAPTERS, LEVELS, validateChapters, isUnlocked, nextLevel } from '../src/chapters.js';

test('126 distinct small levels form one reachable progression across chapter boundaries', () => {
  assert.equal(CHAPTERS.length, 16);
  assert.equal(LEVELS.length, 126);
  assert.deepEqual(
    LEVELS.slice(0, 9).map((level) => level.id),
    [
      'lanes-1',
      'lanes-2',
      'lanes-3',
      'tides-1',
      'tides-2',
      'tides-3',
      'stones-1',
      'stones-2',
      'stones-3',
    ],
    'legacy identities and order stay stable',
  );
  assert.equal(
    new Set(LEVELS.map((level) => [...level.scenes].sort().join('|'))).size,
    LEVELS.length,
  );
  assert.equal(new Set(LEVELS.map((level) => level.objective)).size, LEVELS.length);
  assert.equal(new Set(LEVELS.flatMap((level) => level.scenes)).size, 28);
  assert.equal(validateChapters(readScenes()), true);
  const records = {};
  for (const [index, level] of LEVELS.entries()) {
    assert.equal(nextLevel(records).id, level.id);
    assert.equal(isUnlocked(level.id, records), true);
    if (index + 1 < LEVELS.length) assert.equal(isUnlocked(LEVELS[index + 1].id, records), false);
    records[level.id] = { best: 0, complete: true };
  }
  assert.ok(LEVELS.every((level) => isUnlocked(level.id, records)));
  assert.equal(isUnlocked('unknown', records), false);
});

test('old records resume at the first added level and completed levels remain replayable', () => {
  const records = Object.fromEntries(
    LEVELS.slice(0, 9).map((level) => [level.id, { best: 1234, complete: true }]),
  );
  assert.equal(nextLevel(records).id, 'waterways-1');
  assert.equal(isUnlocked('waterways-1', records), true);
  assert.equal(isUnlocked('waterways-2', records), false);
  assert.equal(isUnlocked('tides-3', { 'tides-3': { complete: true } }), true);
  assert.ok(LEVELS.slice(0, 3).every((level) => level.seconds === 45));
  assert.equal(LEVELS.at(-1).seconds, 25);
});

test('a score alone does not unlock the next level and missing scene content is rejected', () => {
  assert.equal(isUnlocked(LEVELS[1].id, { [LEVELS[0].id]: { best: 15000 } }), false);
  const missing = readScenes().filter((scene) => scene.id !== LEVELS[0].scenes[0]);
  assert.throws(() => validateChapters(missing));
  for (const mutate of [
    (chapters) => (chapters[0].levels[0].seconds = 0),
    (chapters) => (chapters[0].levels[0].objective = ''),
    (chapters) => (chapters[1].id = chapters[0].id),
    (chapters) => (chapters[0].cover = 'missing'),
    (chapters) => (chapters[0].levels[1].scenes = [...chapters[0].levels[0].scenes].reverse()),
  ]) {
    const invalid = structuredClone(CHAPTERS);
    mutate(invalid);
    assert.throws(() => validateChapters(readScenes(), invalid));
  }
});
