import { storageFailure } from './errors.mjs';

/** Backend contract: source; readAll(): Promise<Map<string,string|null>>;
 * writeBatch(Map): Promise<void>; compareAndSet(key, expected, value, absent): Promise<boolean>;
 * close(). Writes/CAS resolve only after commit. Missing keys call absent(); null is a tombstone.
 * CAS must read, compare and write atomically. Notifications never establish authority.
 */
export function unavailableBackend(error, source = 'indexedDB') {
  const fail = () => Promise.reject(storageFailure(error));
  return { source, readAll: fail, writeBatch: fail, compareAndSet: fail, close() {} };
}

/** Sync reads/updates are a mirror, not a durability promise; critical callers await flush. */
export async function createStorage({ backend, legacy, changed = () => {}, committed = () => {} }) {
  let values;
  try {
    values = await backend.readAll();
  } catch (error) {
    backend.close();
    backend = unavailableBackend(error, backend.source);
    values = new Map();
  }
  const pending = new Map(),
    revisions = new Map();
  let running,
    committing,
    scheduled = false,
    revision = 0;
  function keys() {
    const names = new Set(values.keys());
    if (legacy) for (let i = 0; i < legacy.length; i++) names.add(legacy.key(i));
    return [...names].filter(
      (name) => name !== null && (!values.has(name) || values.get(name) !== null),
    );
  }
  function flush() {
    if (running) return running.then(() => (pending.size ? flush() : undefined));
    if (!pending.size) return backend.writeBatch(new Map());
    const writes = new Map(pending);
    committing = writes;
    pending.clear();
    running = backend
      .writeBatch(writes)
      .then(
        () => {
          committed();
        },
        (error) => {
          // Keep failed writes retryable; a caller must await flush before claiming durability.
          for (const [key, value] of writes) if (!pending.has(key)) pending.set(key, value);
          throw error;
        },
      )
      .finally(() => {
        running = undefined;
        committing = undefined;
      });
    return running.then(() => (pending.size ? flush() : undefined));
  }
  function put(key, value) {
    key = String(key);
    values.set(key, value);
    pending.set(key, value);
    revisions.set(key, ++revision);
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        void flush().catch(() => {});
      });
    }
  }
  async function refresh() {
    const before = revision,
      committed = await backend.readAll();
    for (const key of new Set([...values.keys(), ...committed.keys()])) {
      if ((revisions.get(key) || 0) > before || pending.has(key) || committing?.has(key)) continue;
      const previous = values.has(key) ? values.get(key) : (legacy?.getItem(key) ?? null);
      if (committed.has(key)) values.set(key, committed.get(key));
      else values.delete(key);
      const current = values.has(key) ? values.get(key) : (legacy?.getItem(key) ?? null);
      if (current !== previous) changed(key, previous, current);
    }
  }
  async function compareAndSet(key, expected, value) {
    if (pending.has(key) || committing?.has(key)) await flush();
    const before = revision;
    const accepted = await backend.compareAndSet(
      key,
      expected,
      value,
      () => legacy?.getItem(key) ?? null,
    );
    if (accepted) {
      if ((revisions.get(key) || 0) <= before) values.set(key, value);
      committed();
    } else await refresh();
    return accepted;
  }
  const storage = {
    source: backend.source,
    get length() {
      return keys().length;
    },
    key(index) {
      return keys()[index] ?? null;
    },
    getItem(key) {
      key = String(key);
      return values.has(key) ? values.get(key) : (legacy?.getItem(key) ?? null);
    },
    setItem(key, value) {
      put(key, String(value));
    },
    // A tombstone prevents the read-only legacy value from reappearing after reload.
    removeItem(key) {
      put(key, null);
    },
    clear() {
      for (const key of keys()) put(key, null);
    },
    flush,
    refresh,
    compareAndSet,
  };
  return storage;
}
