import { copyFile, mkdir, cp } from 'node:fs/promises';

// The classic scripts deliberately retain their order and relative URLs.
const dist = new URL('./dist/', import.meta.url);
await mkdir(dist, { recursive: true });
for (const file of ['index.html', 'dev-mode.js', 'style.css', 'levels-data.js', 'level-order.js', 'render.js', 'game.js', 'levels.js']) {
  await copyFile(new URL(file, import.meta.url), new URL(file, dist));
}
await cp(new URL('./assets/', import.meta.url), new URL('./assets/', dist), { recursive: true });
console.log('Built wulong-city: mobile preview with shared Canvas artwork');
