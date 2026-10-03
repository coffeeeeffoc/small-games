import { cp, mkdir, rm } from 'node:fs/promises';

const dist = new URL('./dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of [
  'index.html',
  'style.css',
  'game.mjs',
  'structure-view.mjs',
  'structure-model.mjs',
  'faces.mjs',
  'geometry.mjs',
  'reveal-access.mjs',
  'touch-buttons.mjs',
  'engine.mjs',
  'levels.mjs',
  'progress.mjs',
  'levels',
]) {
  await cp(new URL(file, import.meta.url), new URL(file, dist), { recursive: true });
}
console.log('Built two-sided-box: dist/');
