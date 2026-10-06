import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, readProgress, saveProgress, recordWin } from '../progress.mjs';

const LEVELS = Array.from({ length: 8 }, (_, index) => ({ id: `tower-${index + 1}` }));
const defaults = () => ({
  version: 1,
  unlocked: 1,
  selected: 0,
  sound: true,
  skin: 'mint',
  best: {},
  continuedBest: {},
});
const score = (elapsed = 16.25) => ({ elapsed, maxStreak: 6, brakesUsed: 2 });
const memoryStorage = (initial) => {
  const values = new Map(initial === undefined ? [] : [[STORAGE_KEY, initial]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values,
  };
};
const read = (value, levels = LEVELS) => readProgress(memoryStorage(JSON.stringify(value)), levels);

test('empty and unavailable storage start with one unlocked tower and a free mint skin', () => {
  for (const storage of [undefined, null, memoryStorage(), {}]) {
    assert.deepEqual(readProgress(storage, LEVELS), defaults());
  }
  const first = readProgress(null, LEVELS);
  first.best[LEVELS[0].id] = score();
  assert.deepEqual(readProgress(null, LEVELS), defaults());
});

test('damaged JSON, unexpected shapes, and unknown versions recover safely', () => {
  for (const raw of ['{broken', '', 'null', 'false', '123', '"saved"', '[]', '{"version":2}']) {
    assert.deepEqual(readProgress(memoryStorage(raw), LEVELS), defaults(), raw);
  }
});

test('preferences and both score boards survive save and reload independently', () => {
  const progress = {
    ...defaults(),
    unlocked: 6,
    selected: 5,
    sound: false,
    skin: 'amber',
    best: { [LEVELS[0].id]: score(14), [LEVELS[4].id]: score(20) },
    continuedBest: { [LEVELS[0].id]: score(11) },
  };
  const storage = memoryStorage();
  assert.equal(saveProgress(storage, progress), true);
  assert.deepEqual(readProgress(storage, LEVELS), progress);
});

test('selection never escapes the unlocked catalog and progress stops at eight towers', () => {
  assert.deepEqual(read({ unlocked: 3, selected: 7 }), { ...defaults(), unlocked: 3, selected: 2 });
  assert.deepEqual(read({ unlocked: 999, selected: 999 }), {
    ...defaults(),
    unlocked: 8,
    selected: 7,
  });
  assert.deepEqual(read({ unlocked: -2, selected: -1 }), defaults());
  assert.deepEqual(read({ unlocked: '8', selected: 2.5 }), defaults());
  assert.deepEqual(read({ unlocked: 8, selected: 7 }, LEVELS.slice(0, 3)), {
    ...defaults(),
    unlocked: 3,
    selected: 2,
  });
  assert.deepEqual(read({ unlocked: 20, selected: 19 }, [...LEVELS, { id: 'ninth' }]), {
    ...defaults(),
    unlocked: 8,
    selected: 7,
  });
  assert.deepEqual(read({ unlocked: 8, selected: 7 }, []), defaults());
});

test('all three skins are freely available and invalid preferences use safe defaults', () => {
  for (const skin of ['mint', 'amber', 'ice']) {
    assert.deepEqual(read({ skin }), { ...defaults(), skin });
  }
  for (const skin of ['paid', null, 1, {}, []]) {
    assert.deepEqual(read({ skin, sound: 'false' }), defaults());
  }
  assert.equal(read({ sound: false }).sound, false);
});

test('score restoration keeps stable known ids and drops unknown or malformed results', () => {
  const raw = {
    best: {
      [LEVELS[0].id]: score(15),
      [LEVELS[1].id]: { ...score(), elapsed: 0 },
      [LEVELS[2].id]: { ...score(), elapsed: '8' },
      [LEVELS[3].id]: { ...score(), maxStreak: 13 },
      [LEVELS[4].id]: { ...score(), brakesUsed: -1 },
      [LEVELS[5].id]: { ...score(), maxStreak: 2.5 },
      [LEVELS[6].id]: { ...score(), brakesUsed: Number.MAX_SAFE_INTEGER + 1 },
      [LEVELS[7].id]: null,
      unknown: score(3),
    },
    continuedBest: { [LEVELS[0].id]: score(12), unknown: score(1) },
  };
  const expected = {
    ...defaults(),
    best: { [LEVELS[0].id]: score(15) },
    continuedBest: { [LEVELS[0].id]: score(12) },
  };
  assert.deepEqual(read(raw), expected);
  assert.deepEqual(read(raw, [...LEVELS].reverse()), expected);
});

test('malformed boards and prototype-sensitive keys cannot become score entries', () => {
  for (const value of [null, [], 9, 'scores']) {
    assert.deepEqual(read({ best: value, continuedBest: value }), defaults());
  }
  const polluted = JSON.parse(
    '{"best":{"__proto__":{"elapsed":1,"maxStreak":1,"brakesUsed":0},"constructor":{"elapsed":1,"maxStreak":1,"brakesUsed":0}}}',
  );
  assert.deepEqual(read(polluted, [{ id: '__proto__' }, { id: 'constructor' }]), defaults());
  assert.equal(Object.prototype.elapsed, undefined);
});

test('a normal win unlocks the next tower and mutates the supplied progress object', () => {
  const progress = defaults();
  assert.equal(recordWin(progress, 0, LEVELS[0].id, { ...score(), continued: false }), progress);
  assert.deepEqual(progress, {
    ...defaults(),
    unlocked: 2,
    best: { [LEVELS[0].id]: score() },
  });
});

test('only a strictly faster attempt replaces the full result, including its statistics', () => {
  const progress = defaults();
  recordWin(progress, 0, LEVELS[0].id, score(15));
  recordWin(progress, 0, LEVELS[0].id, { elapsed: 15, maxStreak: 12, brakesUsed: 0 });
  recordWin(progress, 0, LEVELS[0].id, { elapsed: 16, maxStreak: 12, brakesUsed: 0 });
  assert.deepEqual(progress.best[LEVELS[0].id], score(15));
  const faster = { elapsed: 14.999, maxStreak: 3, brakesUsed: 3 };
  recordWin(progress, 0, LEVELS[0].id, faster);
  assert.deepEqual(progress.best[LEVELS[0].id], faster);
});

test('continued wins unlock the next tower without replacing the ordinary record', () => {
  const progress = defaults();
  recordWin(progress, 0, LEVELS[0].id, score(18));
  recordWin(progress, 0, LEVELS[0].id, { ...score(9), continued: true });
  recordWin(progress, 0, LEVELS[0].id, { ...score(11), continued: true });
  recordWin(progress, 1, LEVELS[1].id, { ...score(20), continued: true });
  assert.equal(progress.unlocked, 3);
  assert.deepEqual(progress.best, { [LEVELS[0].id]: score(18) });
  assert.deepEqual(progress.continuedBest, {
    [LEVELS[0].id]: score(9),
    [LEVELS[1].id]: score(20),
  });
});

test('development practice never changes scores, selection, preferences, or unlocks', () => {
  const progress = { ...defaults(), skin: 'ice', sound: false };
  const before = structuredClone(progress);
  assert.equal(recordWin(progress, 7, LEVELS[7].id, score(2), { practice: true }), progress);
  recordWin(progress, 0, LEVELS[0].id, { ...score(1), continued: true }, { practice: true });
  assert.deepEqual(progress, before);
});

test('repeated final wins cannot unlock a ninth tower or move the current selection', () => {
  const progress = { ...defaults(), unlocked: 8, selected: 7 };
  recordWin(progress, 7, LEVELS[7].id, score());
  recordWin(progress, 7, LEVELS[7].id, score());
  assert.equal(progress.unlocked, 8);
  assert.equal(progress.selected, 7);
});

test('invalid win indices, identifiers, and statistics do not settle any reward', () => {
  const invalid = [
    [-1, LEVELS[0].id, score()],
    [8, LEVELS[0].id, score()],
    [0.5, LEVELS[0].id, score()],
    ['0', LEVELS[0].id, score()],
    [0, '__proto__', score()],
    [0, '', score()],
    [0, null, score()],
    [0, LEVELS[0].id, null],
    [0, LEVELS[0].id, { ...score(), elapsed: NaN }],
    [0, LEVELS[0].id, { ...score(), elapsed: Infinity }],
    [0, LEVELS[0].id, { ...score(), elapsed: -1 }],
    [0, LEVELS[0].id, { ...score(), maxStreak: 13 }],
    [0, LEVELS[0].id, { ...score(), brakesUsed: 1.5 }],
    [0, LEVELS[0].id, { ...score(), continued: 'true' }],
  ];
  for (const [index, id, result] of invalid) {
    const progress = defaults();
    assert.equal(recordWin(progress, index, id, result), progress);
    assert.deepEqual(progress, defaults());
  }
});

test('saved results are copied so changing a run object cannot alter the record', () => {
  const progress = defaults();
  const result = score();
  recordWin(progress, 0, LEVELS[0].id, result);
  result.elapsed = 1;
  assert.deepEqual(progress.best[LEVELS[0].id], score());
});

test('blocked reads, quota limits, and invalid storage objects remain optional', () => {
  const blocked = {
    getItem() {
      throw new Error('Storage blocked');
    },
    setItem() {
      throw new Error('Quota exceeded');
    },
  };
  assert.deepEqual(readProgress(blocked, LEVELS), defaults());
  for (const storage of [undefined, null, {}, blocked]) {
    assert.equal(saveProgress(storage, defaults()), false);
  }
  assert.equal(saveProgress(memoryStorage(), null), false);
});

test('saving strips invalid preference values and result fields before persistence', () => {
  const storage = memoryStorage();
  const progress = {
    ...defaults(),
    unlocked: 100,
    selected: 90,
    skin: 'unknown',
    best: { [LEVELS[0].id]: { ...score(), extra: 'discard' } },
  };
  assert.equal(saveProgress(storage, progress), true);
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEY)), {
    ...defaults(),
    unlocked: 8,
    selected: 7,
    best: { [LEVELS[0].id]: score() },
  });
  assert.equal(progress.unlocked, 100);
});
