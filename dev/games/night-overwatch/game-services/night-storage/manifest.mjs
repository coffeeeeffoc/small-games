// One list for H5 delivery, source hashing and fresh native staging.
export const nightStorageFiles = Object.freeze([
  'night-storage.js',
  'night-storage/manifest.mjs',
  'night-storage/runtime.mjs',
  'night-storage/store.mjs',
  'night-storage/indexeddb.mjs',
  'night-storage/errors.mjs',
]);
export const nightStorageSourceFiles = nightStorageFiles.map(
  (file) => 'platforms/competition/' + file,
);
