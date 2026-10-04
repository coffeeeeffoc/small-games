import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { extname } from 'node:path';

const source = new URL('./', import.meta.url);
const dist = new URL('./dist/', import.meta.url);
const runtimeDirectories = ['core', 'ui', 'render', 'content'];
const runtimeExtensions = new Set([
  '.mjs',
  '.js',
  '.json',
  '.css',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.woff',
  '.woff2',
  '.mp3',
  '.ogg',
  '.wav',
]);
const excludedDirectories = new Set(['tests', 'test', 'docs', 'dist', 'node_modules']);

async function copyRuntimeTree(directory) {
  const entries = await readdir(new URL(directory, source), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) await copyRuntimeTree(relative);
    } else if (
      entry.isFile() &&
      runtimeExtensions.has(extname(entry.name)) &&
      !/(?:^|[.-])(?:test|spec)(?:[.-]|$)/.test(entry.name)
    ) {
      await mkdir(new URL(`${directory}/`, dist), { recursive: true });
      await cp(new URL(relative, source), new URL(relative, dist));
    }
  }
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const entry of [
  'index.html', 'dev-mode.js',
  'favicon.svg',
  'style.css',
  'game.mjs',
  'art.mjs',
  'engine.mjs',
  'levels.mjs',
]) {
  await cp(new URL(entry, source), new URL(entry, dist));
}
for (const directory of runtimeDirectories) await copyRuntimeTree(directory);
console.log('Built ink-is-everything: dist/ (core, ui, render and content included recursively)');
