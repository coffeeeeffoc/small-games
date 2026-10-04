import { cp, mkdir, rm, stat } from 'node:fs/promises';

const dist = new URL('./dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// Keep native ES modules and relative URLs intact for standalone and Shell iframe delivery.
for (const file of ['index.html', 'dev-mode.js', 'style.css', 'home.css', 'display.css', 'src']) {
  await cp(new URL(file, import.meta.url), new URL(file, dist), { recursive: true });
}
const favicon = new URL('./favicon.svg', import.meta.url);
if (await stat(favicon).catch(() => null)) {
  await cp(favicon, new URL('./favicon.svg', dist));
}
console.log('Bullet Garden built to dist/');
