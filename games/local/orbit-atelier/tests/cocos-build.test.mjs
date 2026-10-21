import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sourceHash, verifyPrebuilt, runtimeManifest } from '../scripts/artifact.mjs';

test('Creator artifact identity includes current source and refuses stale or incomplete output', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'orbit-creator-'));
  try {
    await mkdir(path.join(root, 'dist'));
    await writeFile(
      path.join(root, 'dist/build-info.json'),
      JSON.stringify({ creator: '3.8.8', target: 'web-mobile', sourceHash: 'stale' }),
    );
    await assert.rejects(verifyPrebuilt(root), /does not match/);
    await writeFile(
      path.join(root, 'dist/build-info.json'),
      JSON.stringify({ creator: '3.8.8', target: 'web-mobile', sourceHash: await sourceHash() }),
    );
    await assert.rejects(verifyPrebuilt(root), /ENOENT/);
    await writeFile(path.join(root, 'dist/index.html'), '<html></html>');
    await assert.rejects(verifyPrebuilt(root), /cc.d.ts/);
    await writeFile(path.join(root, 'cc.d.ts'), '// Fixture: not an engine artifact.');
    await assert.rejects(verifyPrebuilt(root), /Incomplete Creator runtime manifest/);
    await mkdir(path.join(root, 'dist/assets/main'), { recursive: true });
    await writeFile(path.join(root, 'dist/assets/main/index.js'), '// Fixture runtime file');
    const files = await runtimeManifest(path.join(root, 'dist'));
    await writeFile(
      path.join(root, 'dist/build-info.json'),
      JSON.stringify({
        creator: '3.8.8',
        target: 'web-mobile',
        sourceHash: await sourceHash(),
        files,
      }),
    );
    await writeFile(path.join(root, 'dist/assets/main/index.js'), '// Corrupt fixture');
    await assert.rejects(verifyPrebuilt(root), /integrity mismatch/);
    await rm(path.join(root, 'dist/assets/main/index.js'));
    await assert.rejects(verifyPrebuilt(root), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('serialized scene references the actual registered controller', async () => {
  const meta = JSON.parse(
    await readFile(new URL('../assets/scripts/OrbitAtelier.ts.meta', import.meta.url), 'utf8'),
  );
  const hex = meta.uuid.replaceAll('-', ''),
    chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let compressed = hex.slice(0, 5);
  for (let i = 5; i < 32; i += 3) {
    const n = parseInt(hex.slice(i, i + 3), 16);
    compressed += chars[n >> 6] + chars[n & 63];
  }
  const scene = JSON.parse(
    await readFile(new URL('../assets/scenes/main.scene', import.meta.url), 'utf8'),
  );
  assert.equal(scene[3].__type__, compressed);
});
