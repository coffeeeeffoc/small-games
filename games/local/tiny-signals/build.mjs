import { cp, mkdir, rm, stat } from 'node:fs/promises';

const dist = new URL('./dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
// Publish the runtime only; keep tests, development tools and design sources out.
for (const file of [
  'index.html', 'dev-mode.js',
  'style.css',
  'main.mjs',
  'game.mjs',
  'render.mjs',
  'rules.mjs',
  'levels.mjs',
  'session.mjs',
  'challenge.mjs',
  'host.mjs',
]) {
  await cp(new URL(file, import.meta.url), new URL(file, dist));
}
await cp(new URL('../../../platforms/h5/publishing.js', import.meta.url), new URL('publishing.js', dist));
const assets = new URL('./assets/', import.meta.url);
try {
  if ((await stat(assets)).isDirectory()) {
    await cp(assets, new URL('assets/', dist), { recursive: true });
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
console.log('Built tiny-signals: dist/');
