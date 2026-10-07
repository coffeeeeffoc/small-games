import { cp, mkdir, rm } from 'node:fs/promises';
const dist = new URL('./dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of [
  'index.html',
  'dev-mode.js',
  'fullscreen.js',
  'style.css',
  'main.mjs',
  'render.mjs',
  'storage.mjs',
  'remote.mjs',
  'favicon.svg',
  'assets',
]) {
  await cp(new URL(file, import.meta.url), new URL(file, dist), { recursive: true });
}
for (const file of ['src/core/index.mjs', 'src/content/levels.mjs']) {
  await mkdir(new URL(file.substring(0, file.lastIndexOf('/') + 1), dist), { recursive: true });
  await cp(new URL(file, import.meta.url), new URL(file, dist));
}
console.log('Built 天下岔路 → dist/');
