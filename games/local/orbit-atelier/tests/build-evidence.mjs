import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { digest } from './evidence.mjs';

async function files(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) result.push(...(await files(root, name + '/')));
    else result.push(name);
  }
  return result.sort();
}
export async function sourceIdentity(root) {
  const git = (args) =>
    execFileSync('git', ['-c', 'core.fsmonitor=false', ...args], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  const revision = git(['rev-parse', 'HEAD']);
  const dirty = Boolean(
    git(['status', '--porcelain', '--untracked-files=no', '--ignore-submodules']),
  );
  const inputs = [
    'index.html',
    'package.json',
    'vite.config.ts',
    'dev-mode.js',
    'dev-mode.d.ts',
    ...(await files(path.join(root, 'src')).then((names) => names.map((name) => 'src/' + name))),
  ];
  const hashes = [];
  for (const name of inputs.sort())
    hashes.push([name, digest(await readFile(path.join(root, name)))]);
  hashes.push([
    'pnpm-lock.yaml',
    digest(await readFile(path.resolve(root, '../../../pnpm-lock.yaml'))),
  ]);
  return { revision, dirty, sourceSha256: digest(JSON.stringify(hashes)) };
}
export async function buildIdentity(root, source) {
  const assets = [];
  for (const name of await files(path.join(root, 'dist'))) {
    assert(!name.endsWith('.map'), 'Orbit diagnostics do not require or publish source maps');
    assets.push({ path: name, sha256: digest(await readFile(path.join(root, 'dist', name))) });
  }
  assert(
    assets.some((asset) => asset.path === 'index.html'),
    'Missing production index',
  );
  return { ...source, id: digest(JSON.stringify(assets)), assets };
}
