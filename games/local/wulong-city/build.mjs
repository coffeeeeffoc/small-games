import { copyFile, mkdir } from 'node:fs/promises';

// The classic scripts deliberately retain their order and relative URLs.
const dist = new URL('./dist/', import.meta.url);
await mkdir(dist, { recursive: true });
for (const file of ['index.html', 'style.css', 'levels-data.js', 'game.js', 'levels.js']) {
  await copyFile(new URL(file, import.meta.url), new URL(file, dist));
}
console.log('Built wulong-city: dist/ (5 static files)');
