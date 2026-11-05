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
      if (value === undefined) values.delete(key);
      else values.set(key, value);
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

test('removal commits its tombstone before deleting the same legacy key and reclaiming the backend slot', async () => {
  const values = new Map([['cache', 'indexed-cache']]);
  const oldValues = new Map([
    ['cache', 'legacy-cache'],
    ['preference', 'keep'],
  ]);
  let commit;
  const barrier = new Promise((resolve) => {
    commit = resolve;
  });
  const backend = memoryBackend(values);
  const write = backend.writeBatch;
  backend.writeBatch = async (writes) => {
    await barrier;
    await write(writes);
  };
  const store = await createStorage({
    backend,
    legacy: {
      get length() {
        return oldValues.size;
      },
      key: (index) => [...oldValues.keys()][index],
      getItem: (key) => oldValues.get(key) ?? null,
      removeItem(key) {
        assert.equal(values.get(key), null, 'legacy data remains masked by a committed tombstone');
        oldValues.delete(key);
      },
    },
  });
  store.removeItem('cache');
  const flushed = store.flush();
  assert.equal(oldValues.get('cache'), 'legacy-cache');
  assert.equal(values.get('cache'), 'indexed-cache');
  commit();
  await flushed;
  assert.equal(oldValues.has('cache'), false);
  assert.equal(values.has('cache'), false);
  assert.equal(store.getItem('cache'), null);
  assert.equal(store.getItem('preference'), 'keep');
  assert.equal(store.length, 1);
});

test('blocked or silent legacy removal keeps a tombstone and retries exact-key cleanup', async () => {
  for (const silent of [false, true]) {
    const values = new Map([['cache', 'indexed-cache']]);
    let oldValue = 'legacy-cache';
    let blocked = true;
    const legacy = {
      length: 1,
      key: () => 'cache',
      getItem: () => oldValue,
      removeItem(key) {
        assert.equal(key, 'cache');
        if (blocked) {
          if (!silent) throw Error('legacy removal denied');
        } else oldValue = null;
      },
    };
    const store = await createStorage({ backend: memoryBackend(values), legacy });
    store.removeItem('cache');
    await store.flush();
    assert.equal(values.get('cache'), null);
    assert.equal(oldValue, 'legacy-cache');
    assert.equal(store.getItem('cache'), null);
    blocked = false;
    await store.refresh();
    assert.equal(oldValue, null);
    assert.equal(values.has('cache'), false);
  }
});

test('startup reclaims historical tombstones without touching live data in either backend', async () => {
  const values = new Map([
    ['removed', null],
    ['fresh', 'new-data'],
  ]);
  const oldValues = new Map([
    ['removed', 'old-data'],
    ['fresh', 'old-fresh'],
  ]);
  const store = await createStorage({
    backend: memoryBackend(values),
    legacy: {
      get length() {
        return oldValues.size;
      },
      key: (index) => [...oldValues.keys()][index],
      getItem: (key) => oldValues.get(key) ?? null,
      removeItem: (key) => oldValues.delete(key),
    },
  });
  assert.deepEqual([...values], [['fresh', 'new-data']]);
  assert.deepEqual([...oldValues], [['fresh', 'old-fresh']]);
  assert.equal(store.getItem('fresh'), 'new-data');
});

test('a failed tombstone commit never removes legacy data', async () => {
  let removals = 0;
  const values = new Map([['cache', 'saved']]);
  const store = await createStorage({
    backend: {
      ...memoryBackend(values),
      writeBatch: async () => {
        throw Error('aborted');
      },
    },
    legacy: {
      getItem: () => 'legacy',
      length: 1,
      key: () => 'cache',
      removeItem() {
        removals++;
      },
    },
  });
  store.removeItem('cache');
  await assert.rejects(store.flush(), /aborted/);
  assert.equal(removals, 0);
  assert.equal(values.get('cache'), 'saved');
});

test('tombstone reclamation preserves another tab update and refreshes its mirror', async () => {
  const values = new Map([['cache', 'old']]);
  const backend = memoryBackend(values);
  const compare = backend.compareAndSet;
  backend.compareAndSet = async (key, expected, value, absent) => {
    if (value === undefined) values.set(key, 'newer-from-another-tab');
    return compare(key, expected, value, absent);
  };
  const store = await createStorage({ backend });
  store.removeItem('cache');
  await store.flush();
  assert.equal(values.get('cache'), 'newer-from-another-tab');
  assert.equal(store.getItem('cache'), 'newer-from-another-tab');
});

test('a local write during reclamation survives both the mirror update and the next commit', async () => {
  const values = new Map([['cache', 'old']]);
  const backend = memoryBackend(values);
  const compare = backend.compareAndSet;
  let release;
  let started;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  backend.compareAndSet = async (...args) => {
    if (args[2] === undefined) {
      started();
      await blocked;
    }
    return compare(...args);
  };
  const store = await createStorage({ backend });
  store.removeItem('cache');
  const flushed = store.flush();
  await entered;
  store.setItem('cache', 'new-local-value');
  release();
  await flushed;
  assert.equal(values.get('cache'), 'new-local-value');
  assert.equal(store.getItem('cache'), 'new-local-value');
});

test('a CAS committing after physical deletion refreshes the mirror despite an earlier start revision', async () => {
  const values = new Map([['cache', 'old']]);
  const backend = memoryBackend(values);
  const compare = backend.compareAndSet;
  const readAll = backend.readAll;
  let releaseDelete;
  let releaseWrite;
  let deletionStarted;
  let delayRead = false;
  let releaseRead;
  let readStarted;
  const deleteGate = new Promise((resolve) => {
    releaseDelete = resolve;
  });
  const writeGate = new Promise((resolve) => {
    releaseWrite = resolve;
  });
  const entered = new Promise((resolve) => {
    deletionStarted = resolve;
  });
  const readGate = new Promise((resolve) => {
    releaseRead = resolve;
  });
  const reading = new Promise((resolve) => {
    readStarted = resolve;
  });
  backend.readAll = async () => {
    const snapshot = await readAll();
    if (delayRead) {
      delayRead = false;
      readStarted();
      await readGate;
    }
    return snapshot;
  };
  backend.compareAndSet = async (...args) => {
    if (args[2] === undefined) {
      deletionStarted();
      await deleteGate;
    } else await writeGate;
    return compare(...args);
  };
  const store = await createStorage({ backend });
  store.removeItem('cache');
  const flushed = store.flush();
  await entered;
  const accepted = store.compareAndSet('cache', null, 'new-cas-value');
  releaseDelete();
  await flushed;
  delayRead = true;
  const staleRefresh = store.refresh();
  await reading;
  releaseWrite();
  assert.equal(await accepted, true);
  releaseRead();
  await staleRefresh;
  assert.equal(values.get('cache'), 'new-cas-value');
  assert.equal(store.getItem('cache'), 'new-cas-value');
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
