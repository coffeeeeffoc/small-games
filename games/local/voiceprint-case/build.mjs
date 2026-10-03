import { cp, mkdir, readFile } from 'node:fs/promises';
import { validateManifest } from './levels.mjs';

const root = new URL('./', import.meta.url);
const manifest = validateManifest(
  JSON.parse(await readFile(new URL('assets/audio/manifest.json', root), 'utf8')),
);
await mkdir(new URL('dist/', root), { recursive: true });
for (const file of ['index.html', 'style.css', 'main.mjs', 'audio.mjs', 'levels.mjs'])
  await cp(new URL(file, root), new URL('dist/' + file, root));
await mkdir(new URL('dist/assets/audio/', root), { recursive: true });
await cp(
  new URL('assets/audio/manifest.json', root),
  new URL('dist/assets/audio/manifest.json', root),
);
for (const file of ['SOURCES.md', 'LICENSE-APACHE-2.0.txt'])
  await cp(new URL('assets/audio/' + file, root), new URL('dist/assets/audio/' + file, root));
for (const clip of manifest.phrases.flatMap((phrase) => phrase.clips)) {
  await cp(new URL(clip.url, root), new URL('dist/' + clip.url, root));
}
console.log('Built 声纹疑案 → dist/ (static local audio included)');
