import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
const dist = new URL('./dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of [
  'index.html',
  'style.css',
  'dev-mode.js',
  'fullscreen.js',
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
console.log('Built flick-arena: dist/');

await cp(
  new URL('../../../platforms/h5/publishing.js', import.meta.url),
  new URL('publishing.js', dist),
);
