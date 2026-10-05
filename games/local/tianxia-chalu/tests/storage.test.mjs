import test from 'node:test';
import assert from 'node:assert/strict';
import { readSave, writeSave } from '../storage.mjs';
import { applyResult, getUnlockedLevels } from '../src/core/index.mjs';

function memoryStorage(raw = null) {
  let value = raw;
  return {
    getItem(key) {
      assert.equal(key, 'tianxia-chalu:v1');
      return value;
    },
    setItem(key, data) {
      assert.equal(key, 'tianxia-chalu:v1');
      value = data;
    },
  };
}

test('missing, corrupt and unsupported save versions start a clean campaign', () => {
  const fallback = readSave(memoryStorage());
  assert.deepEqual(getUnlockedLevels(fallback), ['crossroads']);
  assert.deepEqual(fallback.settings, {
    sound: true,
    difficulty: 'normal',
    serverUrl: '',
    online: false,
  });
  for (const raw of [
    '{broken',
    'null',
    'false',
    '42',
    '[]',
    '{}',
    JSON.stringify({ version: 0, completed: ['crossroads'] }),
    JSON.stringify({ version: 2, completed: ['crossroads'] }),
  ]) {
    assert.deepEqual(readSave(memoryStorage(raw)), fallback);
  }
});

test('corrupt progress is bounded to prevent level UI crashes and unknown unlocks', () => {
  const save = readSave(
    memoryStorage(
      JSON.stringify({
        version: 1,
        completed: ['crossroads', 2, null, 'unknown', 'crossroads'],
        stars: { crossroads: 100, riverfork: -3, 'four-kingdoms': 2.8, unknown: 2 },
        best: { crossroads: -1, riverfork: 5321.9, unknown: 99, 'four-kingdoms': '3000' },
        tutorial: 'true',
        settings: { sound: false, difficulty: 'impossible', online: 'yes', serverUrl: 43004 },
      }),
    ),
  );
  assert.deepEqual(save.completed, ['crossroads']);
  assert.deepEqual(save.stars, { crossroads: 3, riverfork: 0, 'four-kingdoms': 2 });
  assert.deepEqual(save.best, { crossroads: 0, riverfork: 5321 });
  assert.equal(save.tutorial, false);
  assert.deepEqual(save.settings, {
    sound: false,
    difficulty: 'normal',
    online: false,
    serverUrl: '',
  });
  assert.doesNotThrow(() => '☆'.repeat(3 - save.stars.crossroads));
});

test('denied getItem and setItem fail without preventing a fresh local game', () => {
  const denied = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  const save = readSave(denied);
  assert.deepEqual(save.completed, []);
  assert.equal(writeSave(save, denied), false);
  assert.deepEqual(readSave(null).completed, []);
  assert.equal(writeSave(save, null), false);
  assert.equal(writeSave(save, {}), false);
});

test('a throwing localStorage accessor is caught before any storage method call', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    const save = readSave();
    assert.deepEqual(save.completed, []);
    assert.equal(writeSave(save), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('a successful result survives a save/reload without losing tutorial or settings', () => {
  const storage = memoryStorage();
  let save = readSave(storage);
  save.tutorial = true;
  save.settings = {
    sound: false,
    difficulty: 'hard',
    online: true,
    serverUrl: 'https://example.test/matches',
  };
  const settings = structuredClone(save.settings);
  const result = { levelId: 'crossroads', outcome: 'victory', stars: 2, score: 4200 };
  const progress = applyResult(save, result);
  save = { ...save, ...progress };
  assert.equal(writeSave(save, storage), true);
  const loaded = readSave(storage);
  assert.deepEqual(loaded.settings, settings);
  assert.equal(loaded.tutorial, true);
  assert.deepEqual(loaded.completed, ['crossroads']);
  assert.deepEqual(getUnlockedLevels(loaded), ['crossroads', 'riverfork']);
  assert.equal(loaded.stars.crossroads, 2);
  assert.equal(loaded.best.crossroads, 4200);
});

test('duplicate result settlement and later lower results cannot duplicate or downgrade progress', () => {
  const storage = memoryStorage();
  const save = readSave(storage);
  const victory = { levelId: 'crossroads', outcome: 'victory', stars: 3, score: 4321 };
  applyResult(save, victory);
  writeSave(save, storage);
  const reloaded = readSave(storage);
  applyResult(reloaded, victory);
  assert.deepEqual(reloaded, save);
  applyResult(reloaded, { ...victory, stars: 1, score: 4000 });
  applyResult(reloaded, { ...victory, outcome: 'defeat', stars: 0, score: 0 });
  assert.deepEqual(reloaded, save);
});

test('fallback save objects do not share mutable progress or settings', () => {
  const first = readSave(null);
  const second = readSave(null);
  first.completed.push('crossroads');
  first.settings.sound = false;
  assert.deepEqual(second.completed, []);
  assert.equal(second.settings.sound, true);
});
