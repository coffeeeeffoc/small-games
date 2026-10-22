import { createHash } from 'node:crypto';
import { verifyEngine } from './scripts/build-cocos-engine.mjs';
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
const engine = await verifyEngine();
const dist = new URL('./dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of [
  'index.html',
  'style.css',
  'dev-mode.js',
  'vendor',
  'competition-client.js',
  'src',
])
  await cp(new URL(file, import.meta.url), new URL(file, dist), { recursive: true });
await cp(new URL('./public/audio/', import.meta.url), new URL('audio/', dist), { recursive: true });
if (process.env.COMPETITION_PUBLIC_API_URL) {
  const url = new URL(process.env.COMPETITION_PUBLIC_API_URL);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Competition API must use HTTP(S)');
  const config = JSON.stringify({ apiUrl: url.href.replace(/\/$/, '') }).replaceAll('<', '\\u003c');
  const file = new URL('index.html', dist);
  const html = await readFile(file, 'utf8');
  await writeFile(
    file,
    html.replace('</head>', `<script>globalThis.__COMPETITION_CONFIG__=${config};</script></head>`),
  );
}
console.log('Built flick-arena with official Cocos Engine 3.8.8 source: dist/');

for (const name of ['publishing.js', 'game-rewards.js', 'platform-ads.js', 'interstitial.js'])
  await cp(new URL('../../../platforms/h5/' + name, import.meta.url), new URL(name, dist));
await writeFile(
  new URL('build-info.json', dist),
  JSON.stringify(
    {
      game: 'flick-arena',
      engine: 'Cocos',
      version: '3.8.8',
      build: 'official-engine-source-web',
      creatorEditorBuild: false,
      engineCommit: engine.sourceCommit,
      engineSha256: engine.files['cc.js'].sha256,
      rendererSha256: createHash('sha256')
        .update(await readFile(new URL('src/cocos-render.mjs', import.meta.url)))
        .digest('hex'),
    },
    null,
    2,
  ) + '\n',
);
