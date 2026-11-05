import { createStorage, unavailableBackend } from './store.mjs';
import { openIndexedDB } from './indexeddb.mjs';

export async function installStorage(host, legacy) {
  let backend;
  try {
    backend = await openIndexedDB(host.indexedDB);
  } catch (error) {
    backend = unavailableBackend(error);
  }
  let channel;
  const storage = await createStorage({
    backend,
    legacy,
    changed: (key, oldValue, newValue) =>
      host.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue })),
    committed() {
      try {
        channel?.postMessage('changed');
      } catch {
        /* A notification failure cannot undo a committed transaction. */
      }
    },
  });
  // Only Cocos and shared dev-mode need a Storage-shaped compatibility property.
  Object.defineProperty(host, 'localStorage', { configurable: true, value: storage });
  host.__nightStorage = storage;
  if (typeof host.BroadcastChannel === 'function') {
    try {
      channel = new host.BroadcastChannel('night-overwatch-storage-v1');
      channel.onmessage = () => {
        void storage.refresh().catch(() => {});
      };
    } catch {
      /* Critical callers refresh from the backend without notifications. */
    }
  }
  return storage;
}
