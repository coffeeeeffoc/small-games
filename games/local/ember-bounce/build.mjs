import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { validateLevels } from './levels.mjs';

const errors = validateLevels();
if (errors.length) throw new Error(`Invalid Ember Bounce catalog: ${errors.join('; ')}`);
const dist = new URL('./dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
// Publish only the runtime; keep tests, server and design references in source.
for (const file of [
  'index.html',
  'dev-mode.js',
  'fullscreen.js',
  'style.css',
  'main.mjs',
  'render.mjs',
  'audio.mjs',
  'storage.mjs',
  'core.mjs',
  'levels.mjs',
  'favicon.svg',
]) {
  await cp(new URL(file, import.meta.url), new URL(file, dist));
}
const assets = new URL('./assets/', import.meta.url);
try {
  if ((await stat(assets)).isDirectory()) {
    await cp(assets, new URL('assets/', dist), { recursive: true });
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
console.log('Built 熔光弹珠 → dist/');
