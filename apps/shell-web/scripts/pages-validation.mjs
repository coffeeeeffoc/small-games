import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export function selectPagesGames(games, input) {
  if (input === undefined || input === '') return games;
  let ids;
  try {
    ids = JSON.parse(input);
  } catch {
    throw new Error('PAGES_GAME_IDS must be a JSON array of registered standalone game IDs');
  }
  assert(
    Array.isArray(ids) && ids.every((id) => typeof id === 'string'),
    'PAGES_GAME_IDS must be a JSON array of registered standalone game IDs',
  );
  const registered = new Set(games.map((game) => game.id));
  for (const id of ids) assert(registered.has(id), `Unknown PAGES_GAME_IDS game: ${id}`);
  const selected = new Set(ids);
  return games.filter((game) => selected.has(game.id));
}

function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(
      ([, key, double, single, unquoted]) => [key.toLowerCase(), double ?? single ?? unquoted],
    ),
  );
}

function dependencies(source, extension) {
  if (extension === '.html') {
    return [...source.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(script|link)\b[^>]*>/gi)]
      .flatMap(([tag, name]) => {
        const attrs = attributes(tag);
        if (name.toLowerCase() === 'script') return attrs.src ? [attrs.src] : [];
        return (attrs.rel ?? '')
          .split(/\s+/)
          .some((rel) => /^(stylesheet|modulepreload|preload|icon)$/i.test(rel)) && attrs.href
          ? [attrs.href]
          : [];
      })
      .map((reference) => reference.replace(/&amp;/g, '&'));
  }
  if (extension === '.css') {
    return [
      ...[...source.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/g)].map(
        ([, double, single, unquoted]) => double ?? single ?? unquoted,
      ),
      ...[...source.matchAll(/@import\s+["']([^"']+)["']/g)].map(([, reference]) => reference),
    ];
  }
  if (extension === '.js' || extension === '.mjs') {
    // Validate only literal module references. Runtime-computed asset paths still need browser checks.
    const modules = [
      ...[...source.matchAll(/\b(?:import|export)\s*(?:[^;"']*?\s+from\s*)?["']([^"']+)["']/g)].map(
        ([, reference]) => reference,
      ),
      ...[...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)].map(
        ([, reference]) => reference,
      ),
    ].filter((reference) => /^(?:\.{1,2}\/|\/|[a-z]+:)/i.test(reference));
    const assets = [
      ...source.matchAll(/new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g),
    ].map(([, reference]) => reference);
    return [...modules, ...assets];
  }
  return [];
}

export async function verifyPagesArtifacts({ dist, games, basePath = '/small-games/' }) {
  assert(
    basePath.startsWith('/') && basePath.endsWith('/'),
    'PAGES_BASE_PATH must start and end with /',
  );
  const origin = 'https://pages-artifacts.invalid';
  const checked = new Set();
  async function visit(reference, owner = `${origin}${basePath}index.html`) {
    if (!reference || reference.startsWith('#')) return;
    const url = new URL(reference, owner);
    if (url.origin !== origin) return;
    const pathname = decodeURIComponent(url.pathname);
    assert(
      pathname.startsWith(basePath),
      `${reference} in ${owner}: escapes Pages base ${basePath}`,
    );
    const relative = pathname.slice(basePath.length);
    assert(!relative.split('/').includes('..'), `${reference}: invalid artifact path`);
    if (checked.has(relative)) return;
    const filename = path.resolve(dist, relative);
    const info = await stat(filename).catch(() => null);
    assert(info?.isFile(), `Missing Pages artifact: ${relative} (referenced by ${owner})`);
    checked.add(relative);
    const extension = path.extname(filename).toLowerCase();
    if (!['.html', '.css', '.js', '.mjs'].includes(extension)) return;
    const source = await readFile(filename, 'utf8');
    for (const dependency of dependencies(source, extension)) await visit(dependency, url.href);
  }
  await visit('index.html');
  for (const game of games) {
    assert(/^[\w-]+$/.test(game.id), `Invalid registered game ID: ${game.id}`);
    await visit(`games/${game.id}/index.html`);
  }
  // Lazy built-ins are absent from index.html. Check their manifest entries without launching every game.
  const manifest = JSON.parse(await readFile(path.join(dist, '.vite/manifest.json'), 'utf8'));
  for (const chunk of Object.values(manifest)) {
    for (const file of [chunk.file, ...(chunk.css ?? []), ...(chunk.assets ?? [])])
      await visit(file);
  }
  return { games: games.length, files: checked.size };
}
