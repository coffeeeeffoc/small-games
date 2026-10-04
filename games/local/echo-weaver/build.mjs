import { cp, mkdir, rm } from 'node:fs/promises';

const dist = new URL('./dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
// Ship only the game runtime; exclude development tools and tests.
for (const file of [
  'index.html', 'dev-mode.js',
  'style.css',
  'main.mjs',
  'render.mjs',
  'engine.mjs',
  'levels.mjs',
  'progress.mjs',
  'audio.mjs',
]) {
  await cp(new URL(file, import.meta.url), new URL(file, dist));
}
console.log('Built echo-weaver: dist/');
