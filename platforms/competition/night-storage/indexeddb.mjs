import { unavailable, storageFailure } from './errors.mjs';

export async function openIndexedDB(factory = globalThis.indexedDB) {
  let database;
  function transaction(mode, operation) {
    return new Promise((resolve, reject) => {
      let tx, result;
      try {
        if (!database) throw unavailable();
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
  database = await new Promise((resolve, reject) => {
    let settled = false,
      request;
    const timer = setTimeout(() => {
      settled = true;
      reject(unavailable('IndexedDB opening timed out; close other game pages and retry'));
    }, 8000);
    try {
      if (!factory) throw unavailable('IndexedDB is not supported by this host');
      request = factory.open('night-overwatch-storage-v1', 1);
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
  return {
    source: 'indexedDB',
    readAll,
    writeBatch(writes) {
      if (!database) return Promise.reject(unavailable());
      if (!writes.size) return Promise.resolve();
      return transaction('readwrite', (store) => {
        for (const [key, value] of writes) store.put(value, key);
      });
    },
    compareAndSet(key, expected, value, absent) {
      return transaction('readwrite', (store) => {
        const request = store.get(key);
        let matches = false;
        request.onsuccess = () => {
          try {
            const current = request.result === undefined ? absent() : request.result;
            matches = (current || null) === expected;
            if (matches) store.put(value, key);
          } catch {
            store.transaction.abort();
          }
        };
        return () => matches;
      });
    },
    close() {
      database?.close();
      database = undefined;
    },
  };
}
