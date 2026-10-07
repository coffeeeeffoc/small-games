import { cp, mkdir, rm } from 'node:fs/promises';

const output = new URL('./dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of [
  'index.html',
  'style.css',
  'main.mjs',
  'scene.mjs',
  'engine.mjs',
  'levels.mjs',
  'progress.mjs',
  'audio.mjs',
  'dev-mode.js',
  'fullscreen.js',
]) {
  await cp(new URL(name, import.meta.url), new URL(name, output));
}
console.log('追贼别撞墙：静态制品已生成至 dist/。');
