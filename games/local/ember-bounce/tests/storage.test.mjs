import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, STORAGE_KEY } from '../storage.mjs';

const levels = [
  { id: 'first', unlock: null },
  { id: 'second', unlock: 'first' },
  { id: 'third', unlock: 'second', starTurns: [8, 11] },
];

function memoryStorage(initial) {
  const values = new Map(initial === undefined ? [] : [[STORAGE_KEY, initial]]);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('fresh progress starts at the first stable level and returned data cannot mutate the store', () => {
  const store = createStorage(levels, memoryStorage());
  assert.deepEqual(store.load(), {
    schemaVersion: 1,
    unlocked: ['first'],
    completed: {},
    sound: true,
    haptics: true,
    lastLevel: 'first',
  });
  const snapshot = store.load();
  snapshot.unlocked.push('third');
  snapshot.completed.first = { score: 100, turns: 1, stars: 3 };
  assert.deepEqual(store.load().unlocked, ['first']);
  assert.deepEqual(store.load().completed, {});
});

test('completion follows configured prerequisites, updates best results, and settles duplicate wins once', () => {
  const storage = memoryStorage();
  const store = createStorage(levels, storage);
  assert.deepEqual(store.complete('third', { score: 99, turns: 1 }).completed, {});
  let data = store.complete('first', { score: 100, turns: 10 });
  assert.deepEqual(data.unlocked, ['first', 'second']);
  assert.deepEqual(data.completed.first, { score: 100, turns: 10, stars: 1 });
  const serialized = storage.values.get(STORAGE_KEY);
  store.complete('first', { score: 100, turns: 10 });
  assert.equal(storage.values.get(STORAGE_KEY), serialized);
  data = store.complete('first', { score: 80, turns: 6 });
  assert.deepEqual(data.completed.first, { score: 100, turns: 6, stars: 3 });
  data = store.complete('first', { score: 130, turns: 8 });
  assert.deepEqual(data.completed.first, { score: 130, turns: 6, stars: 3 });
  store.complete('second', { score: 200, turns: 9 });
  data = store.complete('third', { score: 300, turns: 8 });
  assert.deepEqual(data.unlocked, ['first', 'second', 'third']);
  assert.equal(data.completed.second.stars, 2);
  assert.equal(data.completed.third.stars, 3);
  assert.equal(data.lastLevel, 'third');
});

test('practice runs and malformed result values cannot alter normal progress or settings', () => {
  const storage = memoryStorage();
  const store = createStorage(levels, storage);
  store.settings({ sound: false });
  const before = storage.values.get(STORAGE_KEY);
  for (const [id, result] of [
    ['first', { score: 100, turns: 1, practice: true }],
    ['second', { score: 100, turns: 1, practice: true }],
    ['missing', { score: 100, turns: 1 }],
    ['first', { score: NaN, turns: 1 }],
    ['first', { score: 1, turns: -1 }],
    ['first', null],
  ])
    store.complete(id, result);
  store.save(null);
  store.settings(null);
  assert.equal(storage.values.get(STORAGE_KEY), before);
  assert.deepEqual(store.load().completed, {});
});

test('v0 index-based saves migrate to stable IDs and preserve legitimate settings and selection', () => {
  const storage = memoryStorage(
    JSON.stringify({
      schemaVersion: 0,
      completed: { 0: { score: 24, turns: 8 }, 1: { score: 99, turns: 5 } },
      currentLevel: 2,
      sound: false,
      haptics: false,
    }),
  );
  const store = createStorage(levels, storage);
  const data = store.load();
  assert.equal(data.schemaVersion, 1);
  assert.deepEqual(data.unlocked, ['first', 'second', 'third']);
  assert.deepEqual(data.completed.first, { score: 24, turns: 8, stars: 2 });
  assert.equal(data.lastLevel, 'third');
  assert.equal(data.sound, false);
  assert.equal(data.haptics, false);
  store.save(data);
  assert.equal(JSON.parse(storage.values.get(STORAGE_KEY)).schemaVersion, 1);
});

test('unknown versions, corrupt JSON, fake unlocks and broken prerequisite chains recover safely', () => {
  for (const serialized of [
    '{broken',
    'null',
    JSON.stringify({ schemaVersion: 99, unlocked: ['third'] }),
  ]) {
    assert.deepEqual(createStorage(levels, memoryStorage(serialized)).load().unlocked, ['first']);
  }
  const store = createStorage(
    levels,
    memoryStorage(
      JSON.stringify({
        schemaVersion: 1,
        unlocked: ['first', 'second', 'third', 'missing'],
        lastLevel: 'third',
        completed: {
          third: { score: 999, turns: 1 },
          missing: { score: 2, turns: 2 },
          first: { score: 'bad', turns: 1 },
        },
        sound: 'false',
        haptics: 0,
      }),
    ),
  );
  assert.deepEqual(store.load(), {
    schemaVersion: 1,
    unlocked: ['first'],
    completed: {},
    sound: true,
    haptics: true,
    lastLevel: 'first',
  });
});

test('disabled or exhausted storage retains playable progress in memory', () => {
  const rejected = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('quota');
    },
  };
  const store = createStorage(levels, rejected);
  assert.equal(store.isPersistent, false);
  store.complete('first', { score: 44, turns: 7 });
  store.settings({ sound: false, haptics: false });
  const data = store.load();
  assert.deepEqual(data.unlocked, ['first', 'second']);
  assert.deepEqual(data.completed.first, { score: 44, turns: 7, stars: 2 });
  assert.equal(data.sound, false);
  assert.equal(data.haptics, false);
  assert.equal(store.isPersistent, false);
  const memoryOnly = createStorage(levels, null);
  memoryOnly.complete('first', { score: 1, turns: 1 });
  assert.equal(memoryOnly.load().completed.first.stars, 3);
  assert.equal(memoryOnly.isPersistent, false);
});

test('selection and settings survive a new adapter while interrupted rounds never enter the save', () => {
  const storage = memoryStorage();
  const store = createStorage(levels, storage);
  store.complete('first', { score: 100, turns: 6 });
  store.save({ ...store.load(), lastLevel: 'second', volley: { balls: [{ x: 1, y: 2 }] } });
  store.settings({ haptics: false, sound: false, unlocked: ['third'] });
  const restored = createStorage(levels, storage).load();
  assert.equal(restored.lastLevel, 'second');
  assert.equal(restored.haptics, false);
  assert.equal(restored.sound, false);
  assert.equal(Object.hasOwn(restored, 'volley'), false);
  assert.deepEqual(restored.unlocked, ['first', 'second']);
  store.save({ ...restored, lastLevel: 'third' });
  assert.equal(store.load().lastLevel, 'first');
});
