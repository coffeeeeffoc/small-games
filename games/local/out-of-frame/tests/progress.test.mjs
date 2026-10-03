import assert from 'node:assert/strict';
import test from 'node:test';
import { readProgress, writeProgress, STORAGE_KEY } from '../progress.mjs';

const levels = [{ id: 'first' }, { id: 'second' }];
const storage = (value) => ({ getItem: (key) => (assert.equal(key, STORAGE_KEY), value) });

test('missing, malformed, and unavailable storage leave every room playable', () => {
  for (const value of [null, '', '{', 'null', '42', 'false']) {
    assert.deepEqual(readProgress(storage(value), levels), { completed: {}, sound: false });
  }
  assert.deepEqual(
    readProgress(
      {
        getItem() {
          throw new Error('blocked');
        },
      },
      levels,
    ),
    {
      completed: {},
      sound: false,
    },
  );
});

test('saved progress accepts only known levels and positive finite times', () => {
  const saved = JSON.stringify({ completed: { first: 12.5, second: -4, retired: 8 }, sound: true });
  assert.deepEqual(readProgress(storage(saved), levels), {
    completed: { first: 12.5 },
    sound: true,
  });
  for (const time of [0, -1, '12', null, {}, true]) {
    assert.deepEqual(
      readProgress(storage(JSON.stringify({ completed: { first: time }, sound: 'true' })), levels),
      {
        completed: {},
        sound: false,
      },
    );
  }
});

test('progress writes round-trip and storage quota failures do not escape', () => {
  let saved;
  const target = {
    setItem(key, value) {
      assert.equal(key, STORAGE_KEY);
      saved = value;
    },
  };
  const progress = { completed: { first: 6.3, second: 20 }, sound: true };
  assert.equal(writeProgress(target, progress), true);
  assert.deepEqual(readProgress(storage(saved), levels), progress);
  assert.equal(
    writeProgress(
      {
        setItem() {
          throw new Error('quota');
        },
      },
      progress,
    ),
    false,
  );
});
