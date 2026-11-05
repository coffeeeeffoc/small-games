import { storageFailure } from './errors.mjs';

/** Backend contract: source; readAll(): Promise<Map<string,string|null>>;
 * writeBatch(Map): Promise<void>; compareAndSet(key, expected, value, absent): Promise<boolean>;
 * close(). Writes/CAS resolve only after commit. Missing keys call absent(); null is a tombstone.
 * CAS with an undefined value physically deletes a matching key after legacy cleanup.
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
    inspecting = 0,
    revision = 0;
  function releaseDeletedRevisions() {
    // Revision guards only need to outlive reads/CAS that could still return an older value.
    if (inspecting || running) return;
    for (const key of revisions.keys())
      if (!values.has(key) && !pending.has(key) && !committing?.has(key)) revisions.delete(key);
  }
  async function reclaimDeleted(candidates) {
    for (const [key, value] of candidates) {
      if (value !== null || values.get(key) !== null || pending.has(key) || committing?.has(key))
        continue;
      const before = revision;
      inspecting++;
      try {
        // The committed tombstone masks legacy data until every copy is removed.
        if ((legacy?.getItem(key) ?? null) !== null) {
          legacy.removeItem(key);
          if (legacy.getItem(key) !== null) continue;
        }
        const removed = await backend.compareAndSet(
          key,
          null,
          undefined,
          () => legacy?.getItem(key) ?? null,
        );
        if (!removed) {
          await refreshValues();
          continue;
        }
        if (
          (revisions.get(key) || 0) <= before &&
          values.get(key) === null &&
          !pending.has(key) &&
          !committing?.has(key)
        ) {
          values.delete(key);
          // An older in-flight refresh must not resurrect the removed mirror entry.
          revisions.set(key, ++revision);
        }
      } catch {
        // Keep the tombstone and retry on the next startup, refresh or flush.
      } finally {
        inspecting--;
        releaseDeletedRevisions();
      }
    }
  }
  function keys() {
    const names = new Set(values.keys());
    if (legacy) for (let i = 0; i < legacy.length; i++) names.add(legacy.key(i));
    return [...names].filter(
      (name) => name !== null && (!values.has(name) || values.get(name) !== null),
    );
  }
  function flush() {
    if (running) return running.then(() => (pending.size ? flush() : undefined));
    if (!pending.size) return backend.writeBatch(new Map()).then(() => reclaimDeleted(values));
    const writes = new Map(pending);
    committing = writes;
    pending.clear();
    running = backend
      .writeBatch(writes)
      .then(
        async () => {
          committing = undefined;
          await reclaimDeleted(values);
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
        releaseDeletedRevisions();
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
  async function refreshValues() {
    const before = revision;
    inspecting++;
    try {
      const committed = await backend.readAll();
      for (const key of new Set([...values.keys(), ...committed.keys()])) {
        if ((revisions.get(key) || 0) > before || pending.has(key) || committing?.has(key))
          continue;
        const previous = values.has(key) ? values.get(key) : (legacy?.getItem(key) ?? null);
        if (committed.has(key)) values.set(key, committed.get(key));
        else values.delete(key);
        const current = values.has(key) ? values.get(key) : (legacy?.getItem(key) ?? null);
        if (current !== previous) changed(key, previous, current);
      }
    } finally {
      inspecting--;
      releaseDeletedRevisions();
    }
  }
  async function refresh() {
    await refreshValues();
    await reclaimDeleted(values);
  }
  async function compareAndSet(key, expected, value) {
    if (pending.has(key) || committing?.has(key)) await flush();
    const before = revision;
    inspecting++;
    try {
      const accepted = await backend.compareAndSet(
        key,
        expected,
        value,
        () => legacy?.getItem(key) ?? null,
      );
      if (accepted) {
        const unchanged = (revisions.get(key) || 0) <= before;
        revisions.set(key, ++revision);
        if (unchanged) values.set(key, value);
        else await refreshValues();
        if (value === null) await reclaimDeleted(new Map([[key, null]]));
        committed();
      } else await refresh();
      return accepted;
    } finally {
      inspecting--;
      releaseDeletedRevisions();
    }
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
    // Commit the tombstone before reclaiming this exact key from both stores.
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
  await reclaimDeleted(values);
  return storage;
}
