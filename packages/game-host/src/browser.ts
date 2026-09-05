import type { GameHost, StoragePort } from '@coffeeeeffoc/game-contract';

import { createDefaultPorts } from './ports.js';
import { createSession } from './session.js';
import { createBrowserStoragePort, createSyncingStoragePort } from './storage.js';
import type { GameHostOptions, KeyValueStorage } from './types.js';

/** Creates a browser adapter without exposing browser globals to a Game. */
export function createBrowserGameHost(
  options: GameHostOptions & {
    storage: KeyValueStorage;
    storagePrefix?: string;
    legacyStoragePrefix?: string;
    remoteStorage?: StoragePort;
  },
): GameHost {
  const prefix = options.storagePrefix ?? 'small-games:';
  const session = createSession(options.session);
  const storage = options.remoteStorage
    ? createSyncingStoragePort(
        options.storage,
        prefix,
        options.remoteStorage,
        options.legacyStoragePrefix,
      )
    : createBrowserStoragePort(
        options.storage,
        prefix,
        options.online ?? true,
        options.legacyStoragePrefix,
      );
  return Object.freeze({
    session,
    ...createDefaultPorts(options, storage, session),
  });
}
