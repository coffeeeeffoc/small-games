import { cp, mkdir, rm } from 'node:fs/promises';

const dist = new URL('./dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of [
  'index.html', 'dev-mode.js', 'fullscreen.js',
  'style.css',
  'game.mjs',
  'challenge.mjs',
  'display.mjs',
  'structure-view.mjs',
  'structure-model.mjs',
  'faces.mjs',
  'geometry.mjs',
  'reveal-access.mjs',
  'rewards.mjs',
  'touch-buttons.mjs',
  'engine.mjs',
  'levels.mjs',
  'progress.mjs',
  'levels',
]) {
  await cp(new URL(file, import.meta.url), new URL(file, dist), { recursive: true });
}
console.log('Built two-sided-box: dist/');

await cp(new URL('../../../platforms/h5/publishing.js', import.meta.url), new URL('publishing.js', dist));
