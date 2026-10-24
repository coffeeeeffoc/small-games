import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, cp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { sourceHash } from './artifact.mjs';

test('lint ignores downloaded Creator artifacts while keeping authored sources checked', async () => {
  const eslint = new ESLint({ cwd: fileURLToPath(new URL('../', import.meta.url)) });
  assert.equal(await eslint.isPathIgnored('.prebuilt/cc.d.ts'), true);
  assert.equal(await eslint.isPathIgnored('src/duel-simulation.ts'), false);
  assert.equal(await eslint.isPathIgnored('assets/scripts/CastleCannon.ts'), false);
});
test('Creator provenance is identical for LF and Windows CRLF, but rejects changed source', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url)),
    dir = await mkdtemp(path.join(tmpdir(), 'castle-provenance-'));
  try {
    for (const file of [
      'assets',
      'scripts',
      'settings',
      'src',
      'public',
      'package.json',
      'tsconfig.json',
      'tsconfig.cocos.json',
      'vite.server.config.ts',
      'publishing',
    ])
      await cp(path.join(root, file), path.join(dir, file), { recursive: true });
    const before = await sourceHash(dir);
    for (const entry of await readdir(dir, { recursive: true, withFileTypes: true }))
      if (entry.isFile() && /\.(ts|mts|cts|js|mjs|json|effect|html|css|py)$/.test(entry.name)) {
        const file = path.join(entry.parentPath, entry.name),
          text = await readFile(file, 'utf8');
        await writeFile(file, text.replaceAll('\r\n', '\n'));
      }
    assert.equal(await sourceHash(dir), before);
    for (const entry of await readdir(dir, { recursive: true, withFileTypes: true }))
      if (entry.isFile() && /\.(ts|mts|cts|js|mjs|json|effect|html|css|py)$/.test(entry.name)) {
        const file = path.join(entry.parentPath, entry.name),
          text = await readFile(file, 'utf8');
        await writeFile(file, text.replaceAll('\n', '\r\n'));
      }
    assert.equal(await sourceHash(dir), before);
    await writeFile(path.join(dir, 'scripts/workspace-inputs.d.mts'), 'export {};');
    assert.notEqual(await sourceHash(dir), before);
  } finally {
    assert(path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep + 'castle-provenance-'));
    await rm(dir, { recursive: true, force: true });
  }
});
