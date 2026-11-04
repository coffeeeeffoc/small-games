// Night's Web page owns this facade; the original browser store is read-only.
(() => {
  if (globalThis.__nightStorageReady) return;
  let legacy;
  try {
    legacy = window.localStorage;
  } catch {
    /* IndexedDB can still be available. */
  }
  const values = new Map(),
    pending = new Map(),
    revisions = new Map();
  let database,
    initialized = false,
    running,
    committing,
    scheduled = false,
    revision = 0,
    channel,
    openingError,
    installed = false;
  const unavailable = (message = 'IndexedDB storage is unavailable') =>
    Object.assign(new Error(message), { code: 'STORAGE_UNAVAILABLE' });
  const storageFailure = (error) =>
    Object.assign(unavailable(error?.message), { name: error?.name || 'Error' });
  function ready() {
    if (!initialized) throw unavailable();
  }
  function keys() {
    ready();
    const names = new Set(values.keys());
    if (legacy) for (let i = 0; i < legacy.length; i++) names.add(legacy.key(i));
    return [...names].filter(
      (name) => name !== null && (!values.has(name) || values.get(name) !== null),
    );
  }
  function transaction(mode, operation) {
    return new Promise((resolve, reject) => {
      let tx, result;
      try {
        tx = database.transaction('values', mode);
        tx.oncomplete = () => resolve(result?.());
        tx.onabort = () =>
          reject(storageFailure(tx.error || unavailable('IndexedDB transaction was aborted')));
        tx.onerror = () => {};
        result = operation(tx.objectStore('values'));
      } catch (error) {
        try {
          tx?.abort();
        } catch {}
        reject(storageFailure(error));
      }
    });
  }
  async function readAll() {
    return transaction('readonly', (store) => {
      const names = store.getAllKeys(),
        contents = store.getAll();
      return () => new Map(names.result.map((name, index) => [name, contents.result[index]]));
    });
  }
  function flush() {
    ready();
    if (!database) return Promise.reject(openingError || unavailable());
    if (running) return running.then(() => (pending.size ? flush() : undefined));
    if (!pending.size) return Promise.resolve();
    const writes = new Map(pending);
    committing = writes;
    pending.clear();
    running = transaction('readwrite', (store) => {
      for (const [key, value] of writes) store.put(value, key);
    })
      .then(
        () => {
          channel?.postMessage('changed');
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
    ready();
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
    ready();
    if (!database) throw openingError || unavailable();
    const before = revision,
      committed = await readAll();
    for (const key of new Set([...values.keys(), ...committed.keys()])) {
      if ((revisions.get(key) || 0) > before || pending.has(key) || committing?.has(key)) continue;
      const previous = values.has(key) ? values.get(key) : (legacy?.getItem(key) ?? null);
      if (committed.has(key)) values.set(key, committed.get(key));
      else values.delete(key);
      const current = values.has(key) ? values.get(key) : (legacy?.getItem(key) ?? null);
      if (current !== previous)
        window.dispatchEvent(
          new StorageEvent('storage', { key, oldValue: previous, newValue: current }),
        );
    }
  }
  async function compareAndSet(key, expected, value) {
    if (pending.has(key) || committing?.has(key)) await flush();
    const before = revision;
    const accepted = await transaction('readwrite', (store) => {
      const request = store.get(key);
      let matches = false;
      request.onsuccess = () => {
        try {
          const current =
            request.result === undefined ? (legacy?.getItem(key) ?? null) : request.result;
          matches = (current || null) === expected;
          if (matches) store.put(value, key);
        } catch {
          store.transaction.abort();
        }
      };
      return () => matches;
    });
    if (accepted) {
      if ((revisions.get(key) || 0) <= before) values.set(key, value);
      channel?.postMessage('changed');
    } else await refresh();
    return accepted;
  }
  const storage = {
    source: 'indexedDB',
    get length() {
      return keys().length;
    },
    key(index) {
      return keys()[index] ?? null;
    },
    getItem(key) {
      ready();
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
  globalThis.__nightStorageReady = (async () => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
    installed = true;
    database = await new Promise((resolve, reject) => {
      let settled = false,
        request;
      const timer = setTimeout(() => {
        settled = true;
        reject(unavailable('IndexedDB opening timed out; close other game pages and retry'));
      }, 8000);
      try {
        if (!globalThis.indexedDB) throw unavailable('IndexedDB is not supported by this host');
        request = indexedDB.open('night-overwatch-storage-v1', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('values');
        request.onsuccess = () => {
          clearTimeout(timer);
          if (settled) return request.result.close();
          settled = true;
          resolve(request.result);
        };
        request.onerror = () => {
          clearTimeout(timer);
          settled = true;
          reject(request.error || unavailable());
        };
        request.onblocked = () => {
          clearTimeout(timer);
          settled = true;
          reject(unavailable('IndexedDB upgrade is blocked; close other game pages and retry'));
        };
      } catch (error) {
        clearTimeout(timer);
        settled = true;
        reject(error);
      }
    });
    database.onversionchange = () => {
      database.close();
      database = undefined;
    };
    for (const [key, value] of await readAll()) values.set(key, value);
    initialized = true;
    if (typeof BroadcastChannel === 'function') {
      try {
        channel = new BroadcastChannel('night-overwatch-storage-v1');
        channel.onmessage = () => {
          void refresh().catch(() => {});
        };
      } catch {
        /* Critical callers refresh from IndexedDB without notifications. */
      }
    }
    return storage;
  })().catch((error) => {
    if (!installed) throw error;
    database?.close();
    database = undefined;
    openingError = storageFailure(error);
    initialized = true;
    // Offline practice can read old settings; critical writes still fail at flush.
    return storage;
  });
  // Startup owns the visible failure; never fall back to writing the old store.
  void globalThis.__nightStorageReady.catch(() => {});
})();
