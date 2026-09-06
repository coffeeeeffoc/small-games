import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  contentVersion,
  detectLineEnding,
  EDITABLE_SOURCE_EXTENSIONS,
  isEditableSourcePath,
  isTextContent,
  normalizeLineEndings,
  type RepositoryEntry,
} from '@coffeeeeffoc/repository-bridge';

const SOURCE_EXTENSIONS = new Set(EDITABLE_SOURCE_EXTENSIONS);
const IGNORED_NAMES = new Set(['node_modules', 'dist', 'coverage', '.git', '.turbo']);

function isWithin(parent: string, target: string) {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function safeGameRoot(workspaceRoot: string, gameId: string) {
  if (!/^game-[a-z0-9-]+$/.test(gameId)) throw new Error('INVALID_PATH');
  const gamesRoot = path.join(workspaceRoot, 'apps');
  const target = path.resolve(gamesRoot, gameId);
  const canonical = await realpath(target);
  if (!isWithin(await realpath(gamesRoot), canonical)) throw new Error('INVALID_PATH');
  return canonical;
}

async function safeFile(workspaceRoot: string, gameId: string, relativePath: string) {
  if (!isEditableSourcePath(relativePath)) throw new Error('INVALID_PATH');
  const gameRoot = await safeGameRoot(workspaceRoot, gameId);
  const target = path.resolve(gameRoot, relativePath);
  if (!isWithin(gameRoot, target)) throw new Error('INVALID_PATH');
  let checked = gameRoot;
  for (const segment of relativePath.split('/')) {
    checked = path.join(checked, segment);
    if ((await lstat(checked)).isSymbolicLink()) throw new Error('INVALID_PATH');
  }
  const canonical = await realpath(target);
  if (!isWithin(gameRoot, canonical)) throw new Error('INVALID_PATH');
  const details = await stat(canonical);
  if (!details.isFile() || details.size > 1_000_000) throw new Error('INVALID_PATH');
  return canonical;
}

export async function sourceFile(workspaceRoot: string, gameId: string, relativePath: string) {
  const target = await safeFile(workspaceRoot, gameId, relativePath);
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(target));
  } catch {
    throw new Error('BINARY_CONTENT');
  }
  if (!isTextContent(source)) throw new Error('BINARY_CONTENT');
  return { target, source, version: await contentVersion(source) };
}

export function repositoryPath(gameId: string, relativePath: string) {
  return `apps/${gameId}/${relativePath}`;
}

export async function prepareSource(
  workspaceRoot: string,
  change: { gameId: string; path: string; source: string },
) {
  if (new TextEncoder().encode(change.source).byteLength > 1_000_000)
    throw new Error('REQUEST_TOO_LARGE');
  const current = await sourceFile(workspaceRoot, change.gameId, change.path);
  const source = normalizeLineEndings(change.source, detectLineEnding(current.source));
  if (!isTextContent(source)) throw new Error('BINARY_CONTENT');
  return { current, source };
}

async function tree(root: string, current = root): Promise<RepositoryEntry[]> {
  const entries: RepositoryEntry[] = [];
  for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (IGNORED_NAMES.has(entry.name)) continue;
    const target = path.join(current, entry.name);
    const canonical = await realpath(target);
    if (!isWithin(root, canonical)) throw new Error('INVALID_PATH');
    const relative = path.relative(root, target).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      const children = await tree(root, canonical);
      if (children.length)
        entries.push({ name: entry.name, path: relative, type: 'directory', children });
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      entries.push({ name: entry.name, path: relative, type: 'file' });
    }
  }
  return entries;
}

export async function gameFiles(workspaceRoot: string, gameId: string) {
  const root = await safeGameRoot(workspaceRoot, gameId);
  return tree(root);
}
