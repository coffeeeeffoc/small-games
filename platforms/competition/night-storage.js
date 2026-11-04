// Classic startup bridge: publish the barrier before any module, dev-mode or engine consumer.
(() => {
  if (globalThis.__nightStorageReady) return;
  let legacy;
  try {
    legacy = window.localStorage;
  } catch {
    /* IndexedDB may still be available. */
  }
  const entry = new URL('./night-storage/runtime.mjs', document.currentScript.src).href;
  globalThis.__nightStorageReady = import(entry).then(({ installStorage }) =>
    installStorage(window, legacy),
  );
  // Dependency load failures reject startup; only loaded backend capability failures allow practice.
  void globalThis.__nightStorageReady.catch(() => {});
})();
