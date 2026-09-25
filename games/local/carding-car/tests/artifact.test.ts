import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sourceHash, verifyPrebuilt } from '../scripts/artifact.mjs';
test('CI accepts only Creator artifacts matching current source', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kart-artifact-'));
  try {
    await mkdir(path.join(dir, 'dist'));
    const file = path.join(dir, 'dist/build-info.json');
    await writeFile(file, JSON.stringify({ creator: '3.8.8', sourceHash: await sourceHash() }));
    assert.equal(await verifyPrebuilt(dir), path.join(dir, 'dist'));
    await writeFile(file, JSON.stringify({ creator: '3.8.8', sourceHash: 'old-source' }));
    await assert.rejects(verifyPrebuilt(dir), /does not match/);
    for (const folder of ['assets', 'scripts', 'settings'])
      await mkdir(path.join(dir, folder));
    await writeFile(path.join(dir, 'package.json'), '{}\n');
    const script = path.join(dir, 'scripts/fullscreen.js');
    await writeFile(script, 'export const enabled = true;\n');
    const lfHash = await sourceHash(dir);
    await writeFile(script, 'export const enabled = true;\r\n');
    assert.equal(await sourceHash(dir), lfHash, 'Windows and Unix checkouts must match');
    await writeFile(script, 'export const enabled = false;\n');
    assert.notEqual(await sourceHash(dir), lfHash, 'source changes must invalidate artifacts');
    const binary = path.join(dir, 'assets/sample.bin');
    await writeFile(binary, Buffer.from([13, 10]));
    const binaryHash = await sourceHash(dir);
    await writeFile(binary, Buffer.from([10]));
    assert.notEqual(await sourceHash(dir), binaryHash, 'binary bytes must stay significant');
  } finally {
    if (
      path.dirname(dir) !== path.resolve(os.tmpdir()) ||
      !path.basename(dir).startsWith('kart-artifact-')
    )
      throw new Error('Invalid test cleanup directory');
    await rm(dir, { recursive: true, force: true });
  }
});
