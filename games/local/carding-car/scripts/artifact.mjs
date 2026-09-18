import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { artSource, artFiles, expansionSource, expansionFiles } from './prepare-art.mjs';
export const root = fileURLToPath(new URL('../', import.meta.url));
export async function sourceHash() {
  const hash = createHash('sha256');
  async function file(relative) {
    const bytes = await readFile(path.join(root, relative));
    hash.update(relative);
    hash.update(
      /\.(ts|mjs|json|meta|scene|py)$/.test(relative)
        ? bytes.toString('utf8').replaceAll('\r\n', '\n')
        : bytes,
    );
  }
  async function add(relative) {
    const entries = await readdir(path.join(root, relative), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const child = relative + '/' + entry.name;
      if (relative === 'assets/resources/seaside' && artFiles.includes(entry.name)) continue;
      if (relative.startsWith('assets/resources/expansion') && /\.(glb|jpg|json)$/.test(entry.name)) continue;
      if (entry.isDirectory()) await add(child);
      else await file(child);
    }
  }
  for (const folder of ['assets', 'scripts', 'settings']) await add(folder);
  await file('package.json');
  for (const name of artFiles) {
    hash.update('seaside/' + name);
    const bytes = await readFile(new URL(name, artSource));
    hash.update(name.endsWith('.json') ? bytes.toString('utf8').replaceAll('\r\n', '\n') : bytes);
  }
  for (const name of await expansionFiles()) {
    hash.update('expansion/' + name);
    const bytes = await readFile(new URL(name, expansionSource));
    hash.update(name.endsWith('.json') ? bytes.toString('utf8').replaceAll('\r\n', '\n') : bytes);
  }
  return hash.digest('hex');
}
export async function verifyPrebuilt(directory) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'dist/build-info.json'), 'utf8'));
  if (manifest.creator !== '3.8.8' || manifest.sourceHash !== (await sourceHash()))
    throw new Error(
      'Cocos artifact does not match the current sources; rebuild it on the Creator runner.',
    );
  return path.join(directory, 'dist');
}
