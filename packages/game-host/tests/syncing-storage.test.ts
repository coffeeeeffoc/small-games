import { expect, it } from 'vitest';

import { HostError, type StoragePort } from '@coffeeeeffoc/game-contract';
import {
  createInMemoryGameHost,
  createSyncingStoragePort,
  type KeyValueStorage,
} from '@coffeeeeffoc/game-host';

function memoryBackend(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

it('restores a synced save on a second client and exposes concurrent conflicts', async () => {
  const remote = createInMemoryGameHost().storage;
  const first = createSyncingStoragePort(memoryBackend(), 'first:', remote);
  const second = createSyncingStoragePort(memoryBackend(), 'second:', remote);
  const initial = await first.write('save', { chapter: 1 }, null);

  await expect(second.read('save')).resolves.toEqual(initial);
  const firstLoaded = await first.read('save');
  const secondLoaded = await second.read('save');
  await first.write('save', { chapter: 2 }, firstLoaded?.version);
  await expect(second.write('save', { chapter: 3 }, secondLoaded?.version)).rejects.toMatchObject({
    code: 'CONFLICT',
  });
  await expect(remote.read('save')).resolves.toMatchObject({ value: { chapter: 2 } });
});

it('keeps offline writes local and safely retries them after Runtime recovers', async () => {
  const remote = createInMemoryGameHost().storage;
  let online = false;
  const connection: StoragePort = {
    read: (key) =>
      online
        ? remote.read(key)
        : Promise.reject(new HostError({ code: 'OFFLINE', message: 'offline', retryable: true })),
    write: (key, value, version) =>
      online
        ? remote.write(key, value, version)
        : Promise.reject(new HostError({ code: 'OFFLINE', message: 'offline', retryable: true })),
  };
  const storage = createSyncingStoragePort(memoryBackend(), 'offline:', connection);

  const saved = await storage.write('save', { chapter: 2 }, null);
  expect(saved.value).toEqual({ chapter: 2 });
  await expect(remote.read('save')).resolves.toBeNull();

  online = true;
  await expect(storage.read('save')).resolves.toMatchObject({
    value: { chapter: 2 },
    version: '1',
  });
  await expect(remote.read('save')).resolves.toMatchObject({ value: { chapter: 2 } });
});

it('exposes a retry conflict and lets the Game reconcile without losing the pending save', async () => {
  const remote = createInMemoryGameHost().storage;
  let online = true;
  const connection: StoragePort = {
    read: (key) =>
      online
        ? remote.read(key)
        : Promise.reject(new HostError({ code: 'OFFLINE', message: 'offline' })),
    write: (key, value, version) =>
      online
        ? remote.write(key, value, version)
        : Promise.reject(new HostError({ code: 'OFFLINE', message: 'offline' })),
  };
  const backend = memoryBackend();
  let storage = createSyncingStoragePort(backend, 'conflict:', connection);
  const initial = await storage.write('save', { chapter: 1 }, null);
  online = false;
  const local = await storage.write('save', { chapter: 2 }, initial.version);
  online = true;
  await remote.write('save', { chapter: 3 }, initial.version);

  await expect(storage.read('save')).resolves.toEqual(local);
  storage = createSyncingStoragePort(backend, 'conflict:', connection);
  await expect(storage.write('save', { chapter: 4 }, local.version)).rejects.toMatchObject({
    code: 'CONFLICT',
  });
  const latest = await storage.read('save');
  expect(latest).toMatchObject({ value: { chapter: 3 } });
  await expect(storage.write('save', { chapter: 4 }, latest?.version)).resolves.toMatchObject({
    value: { chapter: 4 },
  });
});
