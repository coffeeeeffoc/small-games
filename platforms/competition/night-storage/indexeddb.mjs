import { unavailable, storageFailure } from './errors.mjs';

export async function openIndexedDB(factory = globalThis.indexedDB) {
  let database,
    opening,
    closed = false;
  async function transaction(mode, operation) {
    const connection = await connect();
    return new Promise((resolve, reject) => {
      let tx,
        result,
        settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback(value);
      };
      const timer = setTimeout(() => {
        finish(reject, unavailable(`IndexedDB ${mode} transaction timed out; retry the operation`));
        try {
          tx?.abort();
        } catch {}
        connection.close();
        if (database === connection) database = undefined;
      }, 8000);
      try {
        tx = connection.transaction('values', mode);
        tx.oncomplete = () => {
          try {
            finish(resolve, result?.());
          } catch (error) {
            finish(reject, storageFailure(error));
          }
        };
        tx.onabort = () =>
          finish(
            reject,
            storageFailure(tx.error || unavailable('IndexedDB transaction was aborted')),
          );
        tx.onerror = () => {};
        result = operation(tx.objectStore('values'));
      } catch (error) {
        try {
          tx?.abort();
        } catch {}
        finish(reject, storageFailure(error));
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
  async function connect() {
    if (closed) throw unavailable();
    if (database) return database;
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
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
          if (settled || closed) {
            request.result.close();
            return reject(unavailable());
          }
          settled = true;
          database = request.result;
          const connection = database;
          connection.onversionchange = () => {
            connection.close();
            if (database === connection) database = undefined;
          };
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
    }).finally(() => {
      opening = undefined;
    });
    return opening;
  }
  await connect();
  return {
    source: 'indexedDB',
    readAll,
    writeBatch(writes) {
      if (!writes.size) return connect().then(() => undefined);
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
            // Only a real tombstone can be reclaimed; an empty string may be a newer value.
            matches = value === undefined ? current === expected : (current || null) === expected;
            if (matches) {
              if (value === undefined) store.delete(key);
              else store.put(value, key);
            }
          } catch {
            store.transaction.abort();
          }
        };
        return () => matches;
      });
    },
    close() {
      closed = true;
      database?.close();
      database = undefined;
    },
  };
}
