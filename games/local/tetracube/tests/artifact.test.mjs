import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sourceHash, verifyPrebuilt, runtimeManifest } from '../scripts/artifact.mjs';

test('artifact verification rejects modified and unlisted runtime bytes', async () => {
  // Deliberately minimal verifier fixture, never used as a game build.
  const root = await mkdtemp(path.join(tmpdir(), 'tetracube-integrity-'));
  const dist = path.join(root, 'dist');
  try {
    await mkdir(path.join(dist, 'assets'), { recursive: true });
    await writeFile(path.join(root, 'cc.d.ts'), '// verifier test fixture');
    await writeFile(path.join(dist, 'index.html'), '<html>fixture</html>');
    await writeFile(path.join(dist, 'assets', 'main.js'), '// fixture');
    const files = await runtimeManifest(dist);
    await writeFile(
      path.join(dist, 'build-info.json'),
      JSON.stringify({
        creator: '3.8.8',
        target: 'web-mobile',
        sourceHash: await sourceHash(),
        files,
      }),
    );
    assert.equal(await verifyPrebuilt(root), dist);
    await writeFile(path.join(dist, 'unlisted.js'), 'extra');
    await assert.rejects(verifyPrebuilt(root), /untracked/);
    await rm(path.join(dist, 'unlisted.js'));
    await writeFile(path.join(dist, 'assets', 'main.js'), '// changed');
    await assert.rejects(verifyPrebuilt(root), /integrity mismatch/);
    files['../outside.js'] = 'a'.repeat(64);
    await writeFile(path.join(dist, 'assets', 'main.js'), '// fixture');
    await writeFile(
      path.join(dist, 'build-info.json'),
      JSON.stringify({
        creator: '3.8.8',
        target: 'web-mobile',
        sourceHash: await sourceHash(),
        files,
      }),
    );
    await assert.rejects(verifyPrebuilt(root), /Invalid.*entry/);
  } finally {
    assert.equal(path.dirname(root), tmpdir());
    await rm(root, { recursive: true, force: true });
  }
});
