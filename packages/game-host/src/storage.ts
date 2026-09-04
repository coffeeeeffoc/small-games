import type { JsonValue, StoragePort, StorageRecord } from '@coffeeeeffoc/game-contract';
import { HostError } from '@coffeeeeffoc/game-contract';

import type { KeyValueStorage } from './types.js';

export function assertOnline(online: boolean): void {
  if (!online) {
    throw new HostError({ code: 'OFFLINE', message: 'Game Host is offline', retryable: true });
  }
}

function assertExpectedVersion(
  current: StorageRecord | null,
  expectedVersion: string | null | undefined,
): void {
  if (expectedVersion === undefined) return;
  if ((current?.version ?? null) !== expectedVersion) {
    throw new HostError({
      code: 'CONFLICT',
      message: 'Storage record changed since it was read',
      details: { expectedVersion, actualVersion: current?.version ?? null },
    });
  }
}

export function createMemoryStoragePort(online: boolean): StoragePort {
  const records = new Map<string, StorageRecord>();
  let version = 0;
  return {
    async read(key) {
      assertOnline(online);
      return records.get(key) ?? null;
    },
    async write(key, value, expectedVersion) {
      assertOnline(online);
      const current = records.get(key) ?? null;
      assertExpectedVersion(current, expectedVersion);
      const record = Object.freeze({ value, version: String(++version) });
      records.set(key, record);
      return record;
    },
  };
}

export function createBrowserStoragePort(
  storageBackend: KeyValueStorage,
  prefix: string,
  online: boolean,
): StoragePort {
  const storage: StoragePort = {
    async read(key) {
      assertOnline(online);
      const serialized = storageBackend.getItem(`${prefix}${key}`);
      return serialized ? (JSON.parse(serialized) as StorageRecord) : null;
    },
    async write(key, value: JsonValue, expectedVersion) {
      assertOnline(online);
      const current = await storage.read(key);
      assertExpectedVersion(current, expectedVersion);
      const record = {
        value,
        version: String(Number(current?.version ?? 0) + 1),
      };
      storageBackend.setItem(`${prefix}${key}`, JSON.stringify(record));
      return record;
    },
  };
  return storage;
}
