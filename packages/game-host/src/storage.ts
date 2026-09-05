import {
  HostError,
  jsonValueSchema,
  type JsonValue,
  type StoragePort,
  type StorageRecord,
} from '@coffeeeeffoc/game-contract';

import type { KeyValueStorage } from './types.js';

type PendingWrite = Readonly<{
  value: JsonValue;
  expectedVersion: string | null;
  localVersion: string;
  conflicted: boolean;
}>;

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
  legacyPrefix?: string,
): StoragePort {
  const storage: StoragePort = {
    async read(key) {
      assertOnline(online);
      return parseRecord(
        readWithLegacyMigration(storageBackend, `${prefix}${key}`, legacyPrefix, key),
      );
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

function parseRecord(serialized: string | null): StorageRecord | null {
  if (!serialized) return null;
  try {
    const parsed = JSON.parse(serialized) as Partial<StorageRecord>;
    const value = jsonValueSchema.safeParse(parsed.value);
    return typeof parsed.version === 'string' && value.success
      ? { value: value.data, version: parsed.version }
      : null;
  } catch {
    return null;
  }
}

function parsePending(serialized: string | null): PendingWrite | null {
  if (!serialized) return null;
  try {
    const parsed = JSON.parse(serialized) as Partial<PendingWrite>;
    const value = jsonValueSchema.safeParse(parsed.value);
    return typeof parsed.localVersion === 'string' &&
      (typeof parsed.expectedVersion === 'string' || parsed.expectedVersion === null) &&
      value.success
      ? {
          value: value.data,
          expectedVersion: parsed.expectedVersion,
          localVersion: parsed.localVersion,
          conflicted: parsed.conflicted === true,
        }
      : null;
  } catch {
    return null;
  }
}

function readWithLegacyMigration(
  storageBackend: KeyValueStorage,
  key: string,
  legacyPrefix: string | undefined,
  saveKey: string,
): string | null {
  const current = storageBackend.getItem(key);
  if (current || !legacyPrefix || key === `${legacyPrefix}${saveKey}`) return current;
  const legacy = storageBackend.getItem(`${legacyPrefix}${saveKey}`);
  if (!legacy) return null;
  try {
    storageBackend.setItem(key, legacy);
    storageBackend.removeItem(`${legacyPrefix}${saveKey}`);
  } catch {
    // The legacy value remains readable if browser storage cannot be migrated.
  }
  return legacy;
}

/** Uses cloud storage when reachable while preserving one latest local write for safe retry. */
export function createSyncingStoragePort(
  storageBackend: KeyValueStorage,
  prefix: string,
  remote: StoragePort,
  legacyPrefix?: string,
): StoragePort {
  const recordKey = (key: string) => `${prefix}${key}`;
  const pendingKey = (key: string) => `${prefix}pending:${key}`;
  const savePending = (key: string, pending: PendingWrite) => {
    storageBackend.setItem(pendingKey(key), JSON.stringify(pending));
  };
  const getLocal = (key: string) => {
    const current = parseRecord(storageBackend.getItem(recordKey(key)));
    if (current || !legacyPrefix) return current;
    const legacyKey = `${legacyPrefix}${key}`;
    const legacy = parseRecord(storageBackend.getItem(legacyKey));
    if (!legacy) return null;
    const migrated = { value: legacy.value, version: 'local:1' };
    try {
      storageBackend.setItem(recordKey(key), JSON.stringify(migrated));
      savePending(key, {
        value: migrated.value,
        expectedVersion: null,
        localVersion: migrated.version,
        conflicted: false,
      });
      storageBackend.removeItem(legacyKey);
    } catch {
      // The legacy value remains playable if browser storage cannot be migrated.
    }
    return migrated;
  };
  const getPending = (key: string) => parsePending(storageBackend.getItem(pendingKey(key)));
  const cache = (key: string, record: StorageRecord) => {
    try {
      storageBackend.setItem(recordKey(key), JSON.stringify(record));
    } catch {
      // A successful cloud write remains successful when the browser cache is unavailable.
    }
  };
  const clearPending = (key: string) => {
    try {
      storageBackend.removeItem(pendingKey(key));
    } catch {
      // A stale retry is version-conditional and cannot overwrite newer cloud data.
    }
  };

  return {
    async read(key) {
      const pending = getPending(key);
      if (pending?.conflicted) {
        try {
          return (await remote.read(key)) ?? getLocal(key);
        } catch {
          return getLocal(key);
        }
      }
      if (pending) {
        try {
          const synced = await remote.write(key, pending.value, pending.expectedVersion);
          cache(key, synced);
          clearPending(key);
          return synced;
        } catch (error) {
          if (error instanceof HostError && error.code === 'CONFLICT') {
            try {
              savePending(key, { ...pending, conflicted: true });
            } catch {
              // The local value remains playable; a later write still cannot overwrite remotely.
            }
          }
          return getLocal(key);
        }
      }
      try {
        const record = await remote.read(key);
        if (record) cache(key, record);
        return record ?? getLocal(key);
      } catch {
        return getLocal(key);
      }
    },
    async write(key, value, expectedVersion) {
      const current = await this.read(key);
      assertExpectedVersion(current, expectedVersion);
      const pending = getPending(key);
      const resolvingConflict = pending?.conflicted === true;
      const remoteVersion = resolvingConflict
        ? (current?.version ?? null)
        : (pending?.expectedVersion ?? current?.version ?? null);
      if (!pending || resolvingConflict) {
        try {
          const record = await remote.write(key, value, remoteVersion);
          cache(key, record);
          clearPending(key);
          return record;
        } catch (error) {
          if (error instanceof HostError && error.code === 'CONFLICT') {
            if (pending) {
              try {
                savePending(key, { ...pending, conflicted: true });
              } catch {
                // The original pending write remains version-conditional.
              }
            }
            throw error;
          }
        }
      }
      const pendingRevision = Number(pending?.localVersion.slice('local:'.length) ?? 0);
      const localVersion = `local:${Number.isSafeInteger(pendingRevision) ? pendingRevision + 1 : 1}`;
      const local = { value, version: localVersion };
      try {
        storageBackend.setItem(recordKey(key), JSON.stringify(local));
        savePending(key, {
          value,
          expectedVersion: remoteVersion,
          localVersion,
          conflicted: false,
        });
      } catch {
        // Gameplay still proceeds; persistence may recover on the next write.
      }
      return local;
    },
  };
}
