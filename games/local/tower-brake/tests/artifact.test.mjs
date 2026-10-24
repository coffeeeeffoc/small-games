import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sourceHash, runtimeManifest, verifyPrebuilt } from '../scripts/artifact.mjs';
import { compressedUuid, componentUuid } from '../scripts/prepare.mjs';
test('scene component ID matches the Creator compiler UUID representation', () => {
  assert.equal(compressedUuid(componentUuid), 'cd17eqvt7lCGI+FCIz4yMpU');
});

test('source fingerprint excludes generated rules on every host but includes authored neighbors', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tower-source-'));
  try {
    for (const folder of ['assets/scripts/core', 'scripts', 'settings', 'startup'])
      await mkdir(path.join(dir, folder), { recursive: true });
    for (const file of [
      'package.json',
      'tsconfig.json',
      'engine.mjs',
      'levels.mjs',
      'progress.mjs',
      'geometry.mjs',
      'api-config.mjs',
    ])
      await writeFile(path.join(dir, file), '{}');
    const before = await sourceHash(dir);
    await writeFile(path.join(dir, 'assets/scripts/core/engine.js'), 'generated');
    await writeFile(path.join(dir, 'assets/scripts/core.meta'), '{}');
    assert.equal(await sourceHash(dir), before);
    await writeFile(path.join(dir, 'assets/scripts/core-utils.ts'), 'authored');
    assert.notEqual(await sourceHash(dir), before);
  } finally {
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(dir, { recursive: true, force: true });
  }
});
test('prebuilt verification binds runtime files, path boundaries and API configuration', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tower-artifact-')),
    dist = path.join(dir, 'dist');
  const previous = process.env.COMPETITION_PUBLIC_API_URL;
  try {
    await mkdir(path.join(dist, 'assets'), { recursive: true });
    await writeFile(path.join(dist, 'index.html'), '<canvas id="GameCanvas"></canvas>');
    await writeFile(path.join(dist, 'assets/runtime.js'), 'export const fixture=true;');
    await writeFile(path.join(dir, 'cc.d.ts'), '// test fixture');
    const info = {
      creator: '3.8.8',
      target: 'web-mobile',
      sourceHash: await sourceHash(),
      files: await runtimeManifest(dist),
    };
    await writeFile(path.join(dist, 'build-info.json'), JSON.stringify(info));
    assert.equal(await verifyPrebuilt(dir), dist);
    await writeFile(path.join(dist, 'index.html'), 'tampered');
    await assert.rejects(verifyPrebuilt(dir), /integrity mismatch/);
    info.files = { '../escape.js': 'a'.repeat(64), ...info.files };
    await writeFile(path.join(dist, 'build-info.json'), JSON.stringify(info));
    await assert.rejects(verifyPrebuilt(dir), /Invalid Creator runtime manifest entry/);
    process.env.COMPETITION_PUBLIC_API_URL = 'https://example.com/tower-test';
    assert.notEqual(await sourceHash(), info.sourceHash);
    await assert.rejects(verifyPrebuilt(dir), /does not match/);
  } finally {
    if (previous === undefined) delete process.env.COMPETITION_PUBLIC_API_URL;
    else process.env.COMPETITION_PUBLIC_API_URL = previous;
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(dir, { recursive: true, force: true });
  }
});
