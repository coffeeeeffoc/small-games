import { cp, mkdir, rm } from 'node:fs/promises';

const dist = new URL('./dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
// Keep the published game self-contained without development tools or test fixtures.
for (const file of [
  'index.html', 'dev-mode.js',
  'style.css',
  'game.mjs',
  'render.mjs',
  'engine.mjs',
  'levels.mjs',
  'campaign-early.mjs',
  'campaign-transfers.mjs',
  'campaign-circuits.mjs',
  'campaign-mastery.mjs',
  'progress.mjs',
]) {
  await cp(new URL(file, import.meta.url), new URL(file, dist));
}
console.log('Built out-of-frame: dist/');
