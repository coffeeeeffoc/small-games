import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { verifyEngine } from './scripts/build-cocos-engine.mjs';
const manifest = await verifyEngine();
const dist = new URL('./dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of [
  'index.html',
  'dev-mode.js',
  'style.css',
  'game.mjs',
  'render.mjs',
  'art.mjs',
  'layout.mjs',
  'engine.mjs',
  'levels.mjs',
  'progress.mjs',
  'icon.svg',
  'vendor',
  'assets',
])
  await cp(new URL(file, import.meta.url), new URL(file, dist), { recursive: true });
await cp(
  new URL('../../../platforms/h5/publishing.js', import.meta.url),
  new URL('publishing.js', dist),
);
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
console.log('Built 水位联动站 · Cocos Engine 3.8.8: dist/');
