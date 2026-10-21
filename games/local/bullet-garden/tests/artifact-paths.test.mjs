import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { guardArtifactRestore } from '../scripts/artifact-paths.mjs';
test('prebuilt restore guards physical identity, descendants and destination junctions before removal', async () => {
  const reports = fileURLToPath(new URL('../reports/', import.meta.url));
  await mkdir(reports, { recursive: true });
  const root = await mkdtemp(path.join(reports, 'path-guard-'));
  try {
    const dist = path.join(root, 'dist');
    await mkdir(path.join(dist, 'nested'), { recursive: true });
    assert.equal((await guardArtifactRestore(dist, dist, root)).copy, false);
    if (process.platform === 'win32')
      assert.equal((await guardArtifactRestore(dist.toUpperCase(), dist, root)).copy, false);
    await assert.rejects(guardArtifactRestore(path.join(dist, 'nested'), dist, root), /inside/);
    const alias = path.join(root, 'alias');
    await symlink(dist, alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal((await guardArtifactRestore(alias, dist, root)).copy, false);
    const other = path.join(root, 'other');
    await mkdir(other);
    await assert.rejects(guardArtifactRestore(dist, path.join(other, 'dist'), root), /escapes/);
    // Remove the alias itself only; never recursively follow its target.
    await rm(alias);
    await rm(dist, { recursive: true });
    await symlink(other, dist, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(guardArtifactRestore(other, dist, root), /symlink|junction/);
    await rm(dist);
  } finally {
    assert(root.startsWith(reports));
    await rm(root, { recursive: true, force: true });
  }
});
