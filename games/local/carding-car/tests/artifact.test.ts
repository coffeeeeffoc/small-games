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
  } finally {
    if (
      path.dirname(dir) !== path.resolve(os.tmpdir()) ||
      !path.basename(dir).startsWith('kart-artifact-')
    )
      throw new Error('Invalid test cleanup directory');
    await rm(dir, { recursive: true, force: true });
  }
});
