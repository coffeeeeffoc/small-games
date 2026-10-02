import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../levels.mjs';
import { STORAGE_KEY, readProgress, saveProgress } from '../progress.mjs';

const fresh = () => ({ selected: 0, sound: false, best: {} });
const stored = (value) => ({
  getItem: (key) => {
    assert.equal(key, STORAGE_KEY);
    return value;
  },
});

test('unavailable storage and invalid JSON leave the game playable', () => {
  for (const storage of [
    undefined,
    null,
    stored('{broken'),
    stored('null'),
    stored('[]'),
    stored('42'),
    {
      getItem() {
        throw new Error('denied');
      },
    },
  ]) {
    assert.deepEqual(readProgress(storage, LEVELS), fresh());
  }
});

test('valid selected level, sound preference and best scores survive a round trip', () => {
  const progress = {
    selected: 2,
    sound: true,
    best: { [LEVELS[0].id]: 1, [LEVELS[1].id]: LEVELS[1].maxMoves + 1 },
  };
  let encoded;
  assert.equal(
    saveProgress(
      {
        setItem(key, value) {
          assert.equal(key, STORAGE_KEY);
          encoded = value;
        },
      },
      progress,
    ),
    true,
  );
  assert.deepEqual(readProgress(stored(encoded), LEVELS), progress);
});

test('tampered saves cannot supply arbitrary records or invalid move counts', () => {
  const best = Object.fromEntries(
    LEVELS.map((level, index) => [
      level.id,
      [0, -1, 1.5, '2', null, level.maxMoves + 2, 1e100, true][index],
    ]),
  );
  best['<img src=x onerror=alert(1)>'] = 1;
  best.__proto__ = null;
  const encoded = JSON.stringify({ selected: LEVELS.length, sound: 'true', best });
  assert.deepEqual(readProgress(stored(encoded), LEVELS), fresh());
  for (const selected of [-1, 1.5, '1', null, {}, true]) {
    assert.equal(readProgress(stored(JSON.stringify({ selected })), LEVELS).selected, 0);
  }
});

test('corrupt fields do not erase independent valid progress', () => {
  const best = { [LEVELS[0].id]: 2, [LEVELS[1].id]: 'invalid' };
  assert.deepEqual(
    readProgress(stored(JSON.stringify({ selected: -1, sound: true, best })), LEVELS),
    {
      selected: 0,
      sound: true,
      best: { [LEVELS[0].id]: 2 },
    },
  );
});

test('storage quota failures and unserializable data fail without throwing', () => {
  const denied = {
    setItem() {
      throw new Error('quota');
    },
  };
  const circular = {};
  circular.self = circular;
  assert.equal(saveProgress(denied, fresh()), false);
  assert.equal(saveProgress(null, fresh()), false);
  assert.equal(saveProgress({ setItem() {} }, circular), false);
});
