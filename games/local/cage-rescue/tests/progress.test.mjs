import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/levels.mjs';
import { THEMES, readProgress, unlockedCount, completeLevel } from '../src/progress.mjs';

const win = (levelIndex, changes = {}) => ({
  phase: 'won',
  levelIndex,
  rescued: 6,
  time: 40,
  lives: 3,
  ...changes,
});

function cleared(count) {
  const progress = readProgress(null);
  for (let i = 0; i < count; i++) assert.equal(completeLevel(progress, win(i)), true);
  return progress;
}

test('new players can enter only the first level, with default appearance and sound', () => {
  const progress = readProgress(null);
  assert.deepEqual(progress, {
    version: 1,
    completed: {},
    sound: true,
    theme: 'rescue',
    endlessBest: 0,
  });
  assert.equal(unlockedCount(progress), 1);
  assert.equal(completeLevel(progress, win(1)), false);
  assert.deepEqual(progress.completed, {});
});

test('clearing a level unlocks exactly the next level and a thirtieth clear completes the campaign', () => {
  const progress = readProgress(null);
  for (let index = 0; index < LEVELS.length; index++) {
    assert.equal(unlockedCount(progress), Math.min(index + 1, LEVELS.length));
    assert.equal(completeLevel(progress, win(index)), true);
    assert.equal(Object.keys(progress.completed).length, index + 1);
    assert.equal(unlockedCount(progress), Math.min(index + 2, LEVELS.length));
  }
  assert.deepEqual(
    Object.keys(progress.completed),
    LEVELS.map((level) => level.id),
  );
  assert.deepEqual(readProgress(JSON.parse(JSON.stringify(progress))), progress);
  assert.equal(unlockedCount(progress), 30);
});

test('all-person replays upgrade legacy records and keep the faster full rescue', () => {
  const key = LEVELS[0].id;
  const progress = readProgress({
    version: 1,
    completed: { [key]: { rescued: 4, seconds: 20, lives: 3 } },
  });
  assert.equal(unlockedCount(progress), 2);
  completeLevel(progress, win(0, { time: 45, lives: 2 }));
  completeLevel(progress, win(0, { time: 60, lives: 3 }));
  assert.deepEqual(progress.completed[key], { rescued: 6, seconds: 45, lives: 2 });
  completeLevel(progress, win(0, { time: 35, lives: 1 }));
  assert.deepEqual(progress.completed[key], { rescued: 6, seconds: 35, lives: 1 });
  assert.equal(completeLevel(progress, win(0, { rescued: 5, time: 10 })), false);
  assert.deepEqual(progress.completed[key], { rescued: 6, seconds: 35, lives: 1 });
  assert.equal(unlockedCount(progress), 2);
});

test('partial or impossible rescue counts never save a new completion, even with a won phase', () => {
  const progress = readProgress(null);
  for (const rescued of [0, 4, 5, 7, NaN])
    assert.equal(completeLevel(progress, win(0, { rescued })), false);
  assert.deepEqual(progress.completed, {});
  assert.equal(unlockedCount(progress), 1);
});

test('trial clears never change records or unlock levels, including an improved replay', () => {
  const progress = cleared(1);
  const before = structuredClone(progress);
  assert.equal(completeLevel(progress, win(0, { rescued: 6, time: 10 }), true), false);
  assert.equal(completeLevel(progress, win(1), true), false);
  assert.equal(completeLevel(progress, win(5), true), false);
  assert.deepEqual(progress, before);
});

test('unfinished, paused and failed runs cannot save completion', () => {
  const progress = readProgress(null);
  for (const phase of ['ready', 'playing', 'paused', 'lost'])
    assert.equal(completeLevel(progress, win(0, { phase })), false);
  assert.deepEqual(progress.completed, {});
  assert.equal(unlockedCount(progress), 1);
});

test('bad or unsupported saves reset safely; malformed records cannot unlock later levels', () => {
  const fresh = readProgress(null);
  for (const value of [undefined, false, 5, 'broken', {}, { version: 0 }, { version: 99 }])
    assert.deepEqual(readProgress(value), fresh);
  const save = cleared(4);
  save.completed[LEVELS[1].id].rescued = 7;
  const restored = readProgress(save);
  assert.deepEqual(Object.keys(restored.completed), [LEVELS[0].id]);
  assert.equal(unlockedCount(restored), 2);
  const skipped = {
    version: 1,
    completed: { [LEVELS[3].id]: { rescued: 4, seconds: 10, lives: 3 } },
  };
  assert.equal(unlockedCount(readProgress(skipped)), 1);
});

test('recoverable record fields are sanitized and valid preferences survive loading', () => {
  const save = cleared(2);
  save.completed[LEVELS[0].id] = { rescued: 4, seconds: -12, lives: 100 };
  save.completed[LEVELS[1].id] = { rescued: 5, seconds: NaN, lives: 'three' };
  save.sound = false;
  save.theme = 'mint';
  const result = readProgress(save);
  assert.deepEqual(result.completed[LEVELS[0].id], { rescued: 4, seconds: 0, lives: 3 });
  assert.deepEqual(result.completed[LEVELS[1].id], { rescued: 5, seconds: 0, lives: 0 });
  assert.equal(result.sound, false);
  assert.equal(result.theme, 'mint');
  result.completed[LEVELS[0].id].lives = 1;
  assert.equal(save.completed[LEVELS[0].id].lives, 100);
});

test('appearance gates use completed levels, and unknown or prematurely selected themes fall back', () => {
  assert.deepEqual(
    THEMES.map((theme) => [theme.id, theme.required]),
    [
      ['rescue', 0],
      ['mint', 2],
      ['rose', 4],
    ],
  );
  for (const theme of THEMES) {
    for (let count = 0; count <= LEVELS.length; count++) {
      const save = cleared(count);
      save.theme = theme.id;
      assert.equal(readProgress(save).theme, count >= theme.required ? theme.id : 'rescue');
    }
  }
  const unknown = cleared(6);
  unknown.theme = 'missing-theme';
  assert.equal(readProgress(unknown).theme, 'rescue');
});

test('legacy six clears unlock the seventh rescue while endless records stay separate', () => {
  const completed = Object.fromEntries(
    LEVELS.slice(0, 6).map((level) => [level.id, { rescued: 6, seconds: 30, lives: 3 }]),
  );
  const progress = readProgress({ version: 1, completed, endlessBest: 37 });
  assert.equal(unlockedCount(progress), 7);
  assert.equal(progress.endlessBest, 37);
  const before = structuredClone(progress);
  assert.equal(
    completeLevel(progress, { mode: 'endless', phase: 'won', levelIndex: 6, rescued: 6 }),
    false,
  );
  assert.deepEqual(progress, before);
  assert.equal(readProgress({ version: 1, endlessBest: -1 }).endlessBest, 0);
});
