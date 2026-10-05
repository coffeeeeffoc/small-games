import { cp, mkdir, rm } from 'node:fs/promises';
const dist = new URL('./dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of ['index.html', 'style.css', 'dev-mode.js', 'fullscreen.js', 'src'])
  await cp(new URL(file, import.meta.url), new URL(file, dist), { recursive: true });
await cp(new URL('./public/audio/', import.meta.url), new URL('audio/', dist), { recursive: true });
console.log('Built flick-arena: dist/');
