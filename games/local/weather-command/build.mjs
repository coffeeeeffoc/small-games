import { cp, mkdir, rm } from 'node:fs/promises';

// Preserve the standalone game's script order and relative asset paths.
const dist = new URL('./dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of ["index.html","style.css","game.mjs","rules.mjs","levels.mjs"]) {
  await cp(new URL(file, import.meta.url), new URL(file, dist), { recursive: true });
}
console.log('Built weather-command: dist/');
