import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalHost } from './host.mjs';
import { normalizeProgress } from './session.mjs';

test('local Host persists versioned data, detects stale writes and survives malformed records', async () => {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k), setItem: (k, v) => map.set(k, v) };
  const first = createLocalHost(storage);
  const saved = await first.storage.write('test', { best: 8 }, null);
  const second = createLocalHost(storage);
  assert.deepEqual(await second.storage.read('test'), saved);
  await assert.rejects(first.storage.write('test', {}, 'old'), { code: 'CONFLICT' });
  map.set('tiny-signals:host:test', 'broken json');
  assert.equal(await first.storage.read('test'), null);
});

test('unavailable storage reports failure while retaining the in-session record', async () => {
  const host = createLocalHost(null);
  await assert.rejects(host.storage.write('test', { best: 4 }), { code: 'UNAVAILABLE' });
  assert.equal((await host.storage.read('test')).value.best, 4);
});

test('concurrent conditional writes cannot both accept the same version', async () => {
  const map = new Map();
  const host = createLocalHost({ getItem: (k) => map.get(k), setItem: (k, v) => map.set(k, v) });
  const results = await Promise.allSettled([
    host.storage.write('parallel', { best: 8 }, null),
    host.storage.write('parallel', { best: 9 }, null),
  ]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[1].reason.code, 'CONFLICT');
  assert.equal((await host.storage.read('parallel')).value.best, 8);
});

test('progress rejects unsupported versions, corrupt scores and unknown level IDs', () => {
  const levels = [{ id: 'garden' }];
  assert.deepEqual(normalizeProgress({ version: 2, lastLevel: 4 }, levels), {
    version: 1,
    lastLevel: 0,
    levels: {},
  });
  const progress = normalizeProgress(
    { version: 1, lastLevel: -1, levels: { garden: { best: -8 }, stranger: { best: 1 } } },
    levels,
  );
  assert.deepEqual(progress.levels, {});
  assert.equal(progress.lastLevel, 0);
});
