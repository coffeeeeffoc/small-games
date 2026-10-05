import { cp, mkdir, rm } from 'node:fs/promises';
const dist = new URL('./dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of [
  'index.html',
  'style.css',
  'display.css',
  'dev-mode.js',
  'fullscreen.js',
  'src',
  'assets',
]) {
  await cp(new URL(file, import.meta.url), new URL(file, dist), { recursive: true });
}
console.log('Built retreat-rally: dist/');
