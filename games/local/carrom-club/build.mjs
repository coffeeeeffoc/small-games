import { cp, mkdir, rm } from 'node:fs/promises';
import { validateLevels } from './src/content.mjs';
validateLevels();
const dist = new URL('./dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of [
  'index.html',
  'style.css',
  'favicon.svg',
  'dev-mode.js',
  'fullscreen.js',
  'src',
  'assets',
]) {
  await cp(new URL(file, import.meta.url), new URL(file, dist), { recursive: true });
}
console.log('Built 克朗棋 → dist/');
