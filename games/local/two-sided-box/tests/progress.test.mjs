import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../levels.mjs';
import { STORAGE_KEY, readProgress, saveProgress } from '../progress.mjs';

const defaults = () => ({ selected: 0, sound: true, best: {} });
const memoryStorage = (initial) => {
  const values = new Map(initial === undefined ? [] : [[STORAGE_KEY, initial]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values,
  };
};

test('an empty or unavailable store starts a playable first box with sound enabled', () => {
  for (const storage of [undefined, null, memoryStorage()]) {
    assert.deepEqual(readProgress(storage, LEVELS), defaults());
  }
});

test('selected box, sound preference, and completed best scores survive a save/read round trip', () => {
  const storage = memoryStorage();
  const progress = {
    selected: 4,
    sound: false,
    best: { [LEVELS[0].id]: 5, [LEVELS[3].id]: 8, [LEVELS[5].id]: 17 },
  };
  assert.equal(saveProgress(storage, progress), true);
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEY)), progress);
  assert.deepEqual(readProgress(storage, LEVELS), progress);
});

test('broken JSON and non-object saved data do not prevent a fresh attempt', () => {
  for (const serialized of ['{broken', '', 'null', 'false', '123', '"saved"', '[]']) {
    assert.deepEqual(readProgress(memoryStorage(serialized), LEVELS), defaults(), serialized);
  }
});

test('out-of-chapter selections fall back without discarding valid best scores', () => {
  for (const selected of [-1, LEVELS.length, 1.5, '2', null]) {
    const storage = memoryStorage(JSON.stringify({ selected, best: { [LEVELS[0].id]: 5 } }));
    assert.deepEqual(readProgress(storage, LEVELS), { ...defaults(), best: { [LEVELS[0].id]: 5 } });
  }
});

test('only known level ids and positive integer best scores are imported', () => {
  const raw = {
    selected: 2,
    sound: false,
    best: {
      [LEVELS[0].id]: 5,
      [LEVELS[1].id]: 0,
      [LEVELS[2].id]: -3,
      [LEVELS[3].id]: 6.5,
      [LEVELS[4].id]: '9',
      [LEVELS[5].id]: 10000,
      'unknown-chapter-id': 7,
    },
  };
  assert.deepEqual(readProgress(memoryStorage(JSON.stringify(raw)), LEVELS), {
    selected: 2,
    sound: false,
    best: { [LEVELS[0].id]: 5 },
  });
});

test('malformed score maps are ignored and only explicit false mutes sound', () => {
  for (const best of [null, [], 4, 'score']) {
    const storage = memoryStorage(JSON.stringify({ sound: 'false', best }));
    assert.deepEqual(readProgress(storage, LEVELS), defaults());
  }
});

test('stable ids preserve scores when another box is appended or chapter order changes', () => {
  const progress = { selected: 0, sound: true, best: { [LEVELS[0].id]: 5, [LEVELS[5].id]: 14 } };
  const storage = memoryStorage(JSON.stringify(progress));
  const expanded = [...LEVELS].reverse().concat({ id: 'future-box' });
  assert.deepEqual(readProgress(storage, expanded).best, progress.best);
  assert.equal(Object.hasOwn(readProgress(storage, expanded).best, 'future-box'), false);
});

test('a fifty-box catalog preserves the last selection and scores from early and late boxes', () => {
  const catalog = Array.from({ length: 50 }, (_, index) => ({
    id: LEVELS[index]?.id ?? `expanded-box-${index + 1}`,
  }));
  const progress = {
    selected: 49,
    sound: false,
    best: { [catalog[0].id]: 5, [catalog[5].id]: 14, [catalog[49].id]: 32 },
  };
  const storage = memoryStorage();
  assert.equal(saveProgress(storage, progress), true);
  assert.deepEqual(readProgress(storage, catalog), progress);
  assert.deepEqual(readProgress(storage, [...catalog].reverse()).best, progress.best);
});

test('blocked reads or quota-limited writes remain optional and never throw', () => {
  const blocked = {
    getItem() {
      throw new Error('Storage blocked');
    },
    setItem() {
      throw new Error('Quota exceeded');
    },
  };
  assert.deepEqual(readProgress(blocked, LEVELS), defaults());
  assert.equal(saveProgress(blocked, defaults()), false);
  assert.equal(saveProgress(undefined, defaults()), false);
  assert.equal(saveProgress(null, defaults()), false);
});
