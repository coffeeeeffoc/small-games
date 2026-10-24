import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { verifyEngine } from './scripts/build-cocos-engine.mjs';
import { vessels, validateContent } from './src/content.mjs';
import { vesselSVG } from './src/art.mjs';
validateContent();
const manifest = await verifyEngine();
const root = new URL('./', import.meta.url),
  dist = new URL('./dist/', root);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of [
  'index.html',
  'style.css',
  'main.mjs',
  'src',
  'assets',
  'vendor',
  'favicon.svg',
  'dev-mode.js',
  'platform-config.js',
  'room-config.js',
])
  await cp(new URL(file, root), new URL(file, dist), { recursive: true });
for (const file of ['game-rewards.js', 'platform-ads.js', 'interstitial.js'])
  await cp(new URL(`../../../platforms/h5/${file}`, root), new URL(file, dist));
await mkdir(new URL('assets/vessels/', dist), { recursive: true });
for (const vessel of vessels)
  await writeFile(new URL(`assets/vessels/${vessel.id}.svg`, dist), vesselSVG(vessel));
await writeFile(
  new URL('build-info.json', dist),
  JSON.stringify(
    {
      engine: 'Cocos',
      version: '3.8.8',
      build: 'official-engine-source',
      engineCommit: manifest.sourceCommit,
      engineSha256: manifest.files['cc.js'].sha256,
      vessels: vessels.length,
      levels: 100,
    },
    null,
    2,
  ) + '\n',
);
console.log('Built 青花拾光 · Cocos 3.8.8 · 100 vessels · dist/');
