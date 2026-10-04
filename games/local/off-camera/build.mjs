import { cp, mkdir, rm } from 'node:fs/promises';

// Preserve the standalone game's script order and relative asset paths.
const dist = new URL('./dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of ["index.html", 'dev-mode.js',"style.css","game.mjs","logic.mjs","art.mjs"]) {
  await cp(new URL(file, import.meta.url), new URL(file, dist), { recursive: true });
}
console.log('Built off-camera: dist/');
