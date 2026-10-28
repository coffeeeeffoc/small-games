import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readProgress, saveProgress } from '../assets/scripts/core/progress.ts';
test('legacy storage migrates only validated best/muted; blocked storage remains playable', () => {
  const map = new Map([
    ['nullrange-cn-best', '314'],
    ['nullrange-cn-muted', 'true'],
  ]);
  const storage = { getItem: (k) => map.get(k) || null, setItem: (k, v) => map.set(k, v) };
  const p = readProgress(storage);
  assert.equal(p.best, 314);
  assert.equal(p.muted, true);
  assert.equal(saveProgress(storage, p, 'best'), true);
  map.set('nullrange-progress-v1', '{"version":1,"best":-3,"muted":"false","sensitivity":300}');
  assert.equal(readProgress(storage).best, 314);
  assert.equal(readProgress(storage).sensitivity, 1);
  map.set('nullrange-cn-best', 'Infinity');
  map.set('nullrange-progress-v1', 'broken');
  assert.equal(readProgress(storage).best, 0);
  assert.equal(saveProgress(storage, p, 'best'), false);
  assert.equal(map.get('nullrange-progress-v1'), 'broken');
  map.set('nullrange-progress-v1', '{"version":1,"best":600}');
  const stale = { ...p, best: 0 };
  assert.equal(saveProgress(storage, stale, 'best'), true);
  assert.equal(stale.best, 600);
  map.set('nullrange-progress-v1', '{"version":3,"best":700}');
  assert.equal(saveProgress(storage, p, 'best'), false);
  const blocked = {
    getItem() {
      throw Error('blocked');
    },
    setItem() {
      throw Error('blocked');
    },
  };
  assert.equal(readProgress(blocked).best, 0);
  assert.equal(saveProgress(blocked, p, 'best'), false);
});
