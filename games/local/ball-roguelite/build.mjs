import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
const dist = new URL('./dist/', import.meta.url);
const { verifyEngine } = await import('./scripts/build-cocos-engine.mjs');
const manifest = await verifyEngine();
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of [
  'index.html',
  'style.css',
  'main.mjs',
  'core.mjs',
  'levels.mjs',
  'storage.mjs',
  'render.mjs',
  'src',
  'assets',
  'vendor',
  'favicon.svg',
  'dev-mode.js',
  'fullscreen.js',
])
  await cp(new URL(file, import.meta.url), new URL(file, dist), { recursive: true });
for (const file of ['publishing.js', 'platform-ads.js'])
  await cp(new URL(`../../../platforms/h5/${file}`, import.meta.url), new URL(file, dist));
await writeFile(
  new URL('build-info.json', dist),
  JSON.stringify(
    {
      engine: 'Cocos',
      version: '3.8.8',
      build: 'official-engine-source',
      engineCommit: manifest.sourceCommit,
      engineSha256: manifest.files['cc.js'].sha256,
    },
    null,
    2,
  ) + '\n',
);
console.log('Built 星轨弹珠 · Cocos 3.8.8 source runtime: dist/');
