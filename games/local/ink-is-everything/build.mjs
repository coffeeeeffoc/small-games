import { cp, mkdir, rm } from 'node:fs/promises';

const dist = new URL('./dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of [
  'index.html',
  'favicon.svg',
  'style.css',
  'game.mjs',
  'art.mjs',
  'engine.mjs',
  'levels.mjs',
]) {
  await cp(new URL(file, import.meta.url), new URL(file, dist));
}
console.log('Built ink-is-everything: dist/');
