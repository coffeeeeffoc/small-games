import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sourceHash } from '../scripts/artifact.mjs';

test('source fingerprint normalizes mtl line endings and retains authored content and binary bytes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tower-brake-fingerprint-'));
  try {
    for (const folder of ["assets","scripts","settings","startup"])
      await mkdir(path.join(dir, folder), { recursive: true });
    for (const file of ["package.json","tsconfig.json","engine.mjs","levels.mjs","progress.mjs","geometry.mjs","api-config.mjs"])
      await writeFile(path.join(dir, file), '{}\n');
    const file = path.join(dir, 'assets/input.mtl');
    const source = "{ \"effect\": \"builtin-unlit\" }\n";
    await writeFile(file, source);
    const lf = await sourceHash(dir);
    await writeFile(file, source.replaceAll('\n', '\r\n'));
    assert.equal(await sourceHash(dir), lf);
    await writeFile(file, source + '// authored change\n');
    assert.notEqual(await sourceHash(dir), lf);
    await writeFile(file, source);
    await writeFile(path.join(dir, 'assets/pixels.png'), Buffer.from([0, 13, 10, 255]));
    const binary = await sourceHash(dir);
    await writeFile(path.join(dir, 'assets/pixels.png'), Buffer.from([0, 10, 255]));
    assert.notEqual(await sourceHash(dir), binary);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
