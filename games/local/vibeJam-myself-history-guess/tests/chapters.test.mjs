import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readScenes } from '../scripts/check-catalog.mjs';
import { CHAPTERS, LEVELS, validateChapters, isUnlocked, nextLevel } from '../src/chapters.js';

test('the nine small levels form one reachable progression across chapter boundaries', () => {
  assert.equal(CHAPTERS.length, 3);
  assert.equal(LEVELS.length, 9);
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

test('a score alone does not unlock the next level and missing scene content is rejected', () => {
  assert.equal(isUnlocked(LEVELS[1].id, { [LEVELS[0].id]: { best: 15000 } }), false);
  const missing = readScenes().filter((scene) => scene.id !== LEVELS[0].scenes[0]);
  assert.throws(() => validateChapters(missing));
});
