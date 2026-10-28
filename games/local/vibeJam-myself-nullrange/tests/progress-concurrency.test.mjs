import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readProgress, saveProgress } from '../assets/scripts/core/progress.ts';
const key = 'nullrange-progress-v1';
function memory(initial) {
  const data = new Map(initial ? [[key, JSON.stringify(initial)]] : []);
  const storage = { getItem: (k) => data.get(k) || null, setItem: (k, v) => data.set(k, v) };
  return { data, storage };
}
test('two stale tabs patch only explicit preferences and score preserves latest preferences', () => {
  const { storage } = memory();
  const a = readProgress(storage),
    b = readProgress(storage);
  b.muted = true;
  assert.equal(saveProgress(storage, b, 'muted'), true);
  a.reduced = true;
  assert.equal(saveProgress(storage, a, 'reduced'), true);
  b.sensitivity = 1.3;
  assert.equal(saveProgress(storage, b, 'sensitivity'), true);
  a.best = 900;
  assert.equal(saveProgress(storage, a, 'best'), true);
  assert.deepEqual(readProgress(storage), {
    version: 2,
    selectedCraft: 'falcon',
    completed: {},
    best: 900,
    muted: true,
    reduced: true,
    sensitivity: 1.3,
  });
  b.best = 20;
  assert.equal(saveProgress(storage, b, 'best'), true);
  assert.equal(b.best, 900);
  // A deliberately toggles one setting; B's other settings and the score survive.
  a.muted = false;
  assert.equal(saveProgress(storage, a, 'muted'), true);
  assert.deepEqual(readProgress(storage), {
    version: 2,
    selectedCraft: 'falcon',
    completed: {},
    best: 900,
    muted: false,
    reduced: true,
    sensitivity: 1.3,
  });
});
test('read failure then recovery never turns default preferences into an implicit settings write', () => {
  const initial = { version: 1, best: 400, muted: true, reduced: true, sensitivity: 0.7 };
  const { data, storage } = memory(initial);
  let failing = true;
  const flaky = {
    getItem: (k) => {
      if (failing) throw Error('temporarily unavailable');
      return storage.getItem(k);
    },
    setItem: storage.setItem,
  };
  const a = readProgress(flaky);
  assert.equal(a.muted, false);
  a.best = 500;
  assert.equal(saveProgress(flaky, a, 'best'), false);
  assert.deepEqual(JSON.parse(data.get(key)), initial);
  failing = false;
  assert.equal(saveProgress(flaky, a, 'best'), true);
  assert.deepEqual(readProgress(storage), {
    ...initial,
    version: 2,
    selectedCraft: 'falcon',
    completed: {},
    best: 500,
  });
  failing = true;
  const b = readProgress(flaky);
  failing = false;
  b.reduced = false;
  assert.equal(saveProgress(flaky, b, 'reduced'), true);
  assert.deepEqual(readProgress(storage), {
    ...initial,
    version: 2,
    selectedCraft: 'falcon',
    completed: {},
    best: 500,
    reduced: false,
  });
});
test('fresh writes preserve legacy preferences and reject malformed explicit patches', () => {
  const { data, storage } = memory();
  data.set('nullrange-cn-best', '314');
  data.set('nullrange-cn-muted', 'true');
  const stale = { version: 1, best: 600, muted: false, reduced: false, sensitivity: 1 };
  assert.equal(saveProgress(storage, stale, 'best'), true);
  assert.equal(readProgress(storage).muted, true);
  const before = data.get(key);
  assert.equal(saveProgress(storage, { ...stale, muted: 'false' }, 'muted'), false);
  assert.equal(saveProgress(storage, { ...stale, sensitivity: NaN }, 'sensitivity'), false);
  assert.equal(saveProgress(storage, stale, 'version'), false);
  assert.equal(data.get(key), before);
  data.set(key, 'broken');
  assert.equal(readProgress(storage).best, 314);
  assert.equal(saveProgress(storage, stale, 'best'), false);
  assert.equal(data.get(key), 'broken');
});
