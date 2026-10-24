import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, cp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceHash } from './artifact.mjs';
import { writeWorld } from './world-resources.mjs';

test('world resources preserve all scene and geometry data and remove obsolete generated chunks', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'castle-world-'));
  try {
    const id = 'a'.repeat(20),
      other = 'b'.repeat(20);
    const geometry = { positions: [0, 1 / 3, -12.5], indices: [0], lines: false };
    const world = {
      version: 1,
      tree: { name: 'original', children: [] },
      materials: { stone: { color: '#fff' } },
      geometries: { [id]: geometry, [other]: { ...geometry, lines: true } },
    };
    await writeWorld(dir, world);
    const index = JSON.parse(await readFile(path.join(dir, 'world.json'), 'utf8'));
    assert.equal(index.version, 2);
    const restored = {};
    for (const [key, resource] of Object.entries(index.geometries))
      restored[key] = JSON.parse(await readFile(path.join(dir, resource + '.json'), 'utf8'));
    assert.deepEqual({ ...index, version: 1, geometries: restored }, world);
    await writeWorld(dir, { ...world, geometries: { [id]: geometry } });
    assert.deepEqual(await readdir(path.join(dir, 'world-geometries')), [id + '.json']);
    await assert.rejects(
      writeWorld(dir, { ...world, geometries: { '../escape': geometry } }),
      /Invalid generated geometry ID/,
    );
    assert.deepEqual(await readdir(path.join(dir, 'world-geometries')), [id + '.json']);
  } finally {
    assert(path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep + 'castle-world-'));
    await rm(dir, { recursive: true, force: true });
  }
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
    const geometryDir = path.join(dir, 'assets/resources/world-geometries');
    await mkdir(geometryDir, { recursive: true });
    await writeFile(path.join(geometryDir, 'generated.json'), '{"positions":[1,2,3]}');
    assert.equal(
      await sourceHash(dir),
      before,
      'Generated geometry does not change source identity',
    );
    await writeFile(path.join(dir, 'scripts/workspace-inputs.d.mts'), 'export {};');
    assert.notEqual(await sourceHash(dir), before);
  } finally {
    assert(path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep + 'castle-provenance-'));
    await rm(dir, { recursive: true, force: true });
  }
});
