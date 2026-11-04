import assert from 'node:assert/strict';
import test from 'node:test';
import { createStorage, unavailableBackend } from '../night-storage/store.mjs';

// A second adapter, independent of browser APIs, exercises the same public storage contract.
function memoryBackend(values = new Map()) {
  return {
    source: 'memory-test',
    readAll: async () => new Map(values),
    writeBatch: async (writes) => {
      for (const [key, value] of writes) values.set(key, value);
    },
    compareAndSet: async (key, expected, value, absent) => {
      if ((values.has(key) ? values.get(key) : absent()) !== expected) return false;
      values.set(key, value);
      return true;
    },
    close() {},
  };
}
const legacy = { length: 1, key: () => 'old', getItem: (key) => (key === 'old' ? 'legacy' : null) };
test('the same storage factory supports another backend, migration, tombstones and atomic identity updates', async () => {
  const values = new Map(),
    backend = memoryBackend(values);
  const store = await createStorage({ backend, legacy });
  assert.equal(store.getItem('old'), 'legacy');
  store.removeItem('old');
  store.setItem('new', 'saved');
  await store.flush();
  const reloaded = await createStorage({ backend: memoryBackend(values), legacy });
  assert.equal(reloaded.getItem('old'), null);
  assert.equal(reloaded.getItem('new'), 'saved');
  assert.equal(await reloaded.compareAndSet('owner', null, 'A'), true);
  assert.equal(await store.compareAndSet('owner', null, 'B'), false);
  assert.equal(store.getItem('owner'), 'A');
});
test('the unavailable adapter supports transient local play but rejects every durability operation', async () => {
  const store = await createStorage({
    backend: unavailableBackend(Error('host storage disabled')),
    legacy,
  });
  assert.equal(store.getItem('old'), 'legacy');
  store.setItem('setting', 'local-only');
  assert.equal(store.getItem('setting'), 'local-only');
  for (const operation of [
    () => store.flush(),
    () => store.refresh(),
    () => store.compareAndSet('owner', null, 'A'),
  ])
    await assert.rejects(operation, { code: 'STORAGE_UNAVAILABLE' });
});
test('a failed initial read closes its backend and cannot overwrite unknown persisted values', async () => {
  let closed = false,
    writes = 0;
  const backend = {
    ...memoryBackend(),
    readAll: async () => {
      throw Error('unreadable');
    },
    close() {
      closed = true;
    },
    writeBatch: async () => {
      writes++;
    },
  };
  const store = await createStorage({ backend, legacy });
  store.setItem('old', 'replacement');
  await assert.rejects(() => store.flush(), { code: 'STORAGE_UNAVAILABLE' });
  assert(closed);
  assert.equal(writes, 0);
});
