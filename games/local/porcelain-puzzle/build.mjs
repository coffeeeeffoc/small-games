import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { verifyEngine } from './scripts/verify-cocos-engine.mjs';
import { readVesselBatch, copyVesselBatch } from './scripts/vessel-batch.mjs';
import { vessels, validateContent } from './src/content.mjs';

export async function build({ root = new URL('./', import.meta.url) } = {}) {
  validateContent();
  const directory = fileURLToPath(root);
  // Validate before touching the previous output. Keep these verified bytes even
  // if art:render activates another complete batch while the build is copying.
  const batch = await readVesselBatch(directory, vessels);
  const manifest = await verifyEngine(path.join(directory, 'vendor/cocos'));
  const dist = new URL('./dist/', root);
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
    await cp(new URL(file, root), new URL(file, dist), {
      recursive: true,
      filter: (source) => {
        const name = path.relative(directory, source).split(path.sep).join('/');
        return (
          !['assets/vessels', 'assets/vessel-batches', 'src/vessel-contours.mjs'].includes(name) &&
          !/^src\/\.vessel-contours-/.test(name)
        );
      },
    });
  await copyVesselBatch(batch, fileURLToPath(dist));
  await readVesselBatch(fileURLToPath(dist), vessels);
  for (const file of ['game-rewards.js', 'platform-ads.js', 'interstitial.js'])
    await cp(new URL(`../../../platforms/h5/${file}`, root), new URL(file, dist));
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
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url)
  await build();
