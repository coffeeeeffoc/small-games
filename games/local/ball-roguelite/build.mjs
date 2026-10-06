import { cp, mkdir, rm } from 'node:fs/promises';
const dist = new URL('./dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of ['index.html', 'style.css', 'main.mjs', 'core.mjs', 'levels.mjs', 'storage.mjs', 'render.mjs', 'favicon.svg', 'dev-mode.js', 'fullscreen.js']) {
  await cp(new URL(file, import.meta.url), new URL(file, dist));
}
console.log('Built 星轨弹珠: dist/');
