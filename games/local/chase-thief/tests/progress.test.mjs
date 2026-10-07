import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../levels.mjs';
import { freshProgress, loadProgress, recordWin } from '../progress.mjs';

const win = (levelId, detail = {}) => ({
  phase: 'won',
  levelId,
  elapsed: 39,
  collisions: 0,
  boosts: 3,
  ...detail,
});

test('a fresh save exposes only the first street and independent mutable values', () => {
  const first = freshProgress();
  const second = freshProgress();
  assert.deepEqual(first, {
    version: 1,
    unlocked: ['old-town'],
    best: {},
    selected: 'old-town',
    sound: true,
    haptics: true,
  });
  first.unlocked.push('market');
  first.best['old-town'] = { time: 39, collisions: 0, boosts: 3 };
  assert.deepEqual(second, freshProgress());
});

test('wins unlock the next catalog street, with pure and idempotent settlement', () => {
  let progress = freshProgress();
  for (let index = 0; index < LEVELS.length; index++) {
    const previous = structuredClone(progress);
    const next = recordWin(progress, win(LEVELS[index].id));
    assert.deepEqual(progress, previous);
    assert.deepEqual(
      next.unlocked,
      LEVELS.slice(0, Math.min(index + 2, LEVELS.length)).map((level) => level.id),
    );
    assert.deepEqual(next.best[LEVELS[index].id], { time: 39, collisions: 0, boosts: 3 });
    assert.deepEqual(recordWin(next, win(LEVELS[index].id)), next);
    progress = next;
  }
});

test('practice, losses, unknown streets and locked streets cannot score or unlock', () => {
  const original = freshProgress();
  for (const run of [
    win('old-town', { practice: true }),
    win('old-town', { phase: 'lost' }),
    win('market'),
    win('missing'),
    win('old-town', { elapsed: Infinity }),
    win('old-town', { elapsed: 61 }),
    win('old-town', { collisions: 3 }),
    win('old-town', { boosts: -1 }),
  ]) {
    assert.deepEqual(recordWin(original, run), original);
  }
});

test('bests prefer a shorter time, then fewer collisions, while retries stay free', () => {
  let progress = recordWin(freshProgress(), win('old-town', { elapsed: 42, collisions: 1 }));
  progress = recordWin(progress, win('old-town', { elapsed: 44, collisions: 0 }));
  assert.equal(progress.best['old-town'].time, 42);
  progress = recordWin(progress, win('old-town', { elapsed: 42, collisions: 0 }));
  assert.equal(progress.best['old-town'].collisions, 0);
  progress = recordWin(progress, win('old-town', { elapsed: 38, collisions: 1 }));
  assert.deepEqual(progress.best['old-town'], { time: 38, collisions: 1, boosts: 3 });
});

test('JSON saves round-trip preferences and catalog progress without retaining references', () => {
  const original = recordWin(freshProgress(), win('old-town'));
  original.sound = false;
  original.haptics = false;
  original.selected = 'market';
  const loaded = loadProgress(JSON.stringify(original));
  assert.deepEqual(loaded, original);
  loaded.best['old-town'].time = 30;
  loaded.unlocked.pop();
  assert.equal(original.best['old-town'].time, 39);
  assert.deepEqual(original.unlocked, ['old-town', 'market']);
});

test('malformed and future saves fall back safely, and partial corrupt data is sanitized', () => {
  for (const raw of [
    null,
    undefined,
    '{broken',
    'null',
    '[]',
    '3',
    { version: 2 },
    { version: 0 },
  ]) {
    assert.deepEqual(loadProgress(raw), freshProgress());
  }
  const loaded = loadProgress({
    version: 1,
    unlocked: ['canal', 'old-town', 'old-town', 'unknown'],
    selected: 'canal',
    sound: 'false',
    haptics: false,
    best: {
      'old-town': { time: -1, collisions: 0, boosts: 3 },
      market: { time: 39, collisions: 0, boosts: 3 },
      unknown: { time: 39, collisions: 0, boosts: 3 },
    },
  });
  assert.deepEqual(loaded, { ...freshProgress(), haptics: false });
});

test('one corrupted best does not discard valid unlocked progress or settings', () => {
  const loaded = loadProgress({
    version: 1,
    unlocked: LEVELS.map((level) => level.id),
    selected: 'canal',
    sound: false,
    haptics: true,
    best: {
      'old-town': { time: 39, collisions: 0, boosts: 3 },
      market: { time: 42, collisions: 1.5, boosts: 3 },
      canal: { time: 45, collisions: 2, boosts: 4, ignored: true },
    },
  });
  assert.deepEqual(loaded.unlocked, ['old-town', 'market', 'canal']);
  assert.equal(loaded.selected, 'canal');
  assert.equal(loaded.sound, false);
  assert.deepEqual(loaded.best, {
    'old-town': { time: 39, collisions: 0, boosts: 3 },
    canal: { time: 45, collisions: 2, boosts: 4 },
  });
});
