import { cp, mkdir, rm } from 'node:fs/promises';

const output = new URL('./dist/', import.meta.url);
const files = [
  'index.html',
  'style.css',
  'main.mjs',
  'render.mjs',
  'engine.mjs',
  'levels.mjs',
  'progress.mjs',
  'dev-mode.js',
  'fullscreen.js',
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of files) {
  await cp(new URL(file, import.meta.url), new URL(file, output));
}
console.log('Built 转塔留一脚刹车 → dist/');
