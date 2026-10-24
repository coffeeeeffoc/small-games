import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { verifyEngine } from '../scripts/cocos-engine-integrity.mjs';
test('runtime is pinned official Cocos, including 3D and skeletal features', async () => {
  const info = await verifyEngine();
  assert(info.features.includes('3d'));
  assert(info.features.includes('skeletal-animation'));
});
test('offline integrity verification rejects changed provenance, missing entries and modified bytes', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'chase-integrity-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(new URL('../vendor/cocos/', import.meta.url), directory, { recursive: true });
  const manifest = path.join(directory, 'provenance.json');
  const original = JSON.parse(await readFile(manifest, 'utf8'));
  const license = await readFile(path.join(directory, 'LICENSE'));
  for (const mutate of [
    (info) => {
      info.sourceCommit = 'unreviewed-source';
    },
    (info) => {
      info.builder = '@cocos/ccbuild@unreviewed';
    },
    (info) => {
      info.features.pop();
    },
    (info) => {
      delete info.files['cc.js'];
    },
    (info) => {
      info.files['../outside'] = info.files.LICENSE;
    },
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    await writeFile(manifest, JSON.stringify(changed));
    await assert.rejects(verifyEngine(directory));
  }
  await writeFile(manifest, JSON.stringify(original));
  await writeFile(
    path.join(directory, 'LICENSE'),
    Buffer.concat([license, Buffer.from('changed')]),
  );
  await assert.rejects(verifyEngine(directory), /Cocos integrity mismatch: LICENSE/);
});
test('Blender export has finite indexed meshes and a valid parent-first skeleton', async () => {
  const art = JSON.parse(
    await readFile(new URL('../assets/resources/art/city-models.json', import.meta.url)),
  );
  const seen = new Set();
  assert.equal(art.rig.length, 13);
  for (const b of art.rig) {
    if (b.parent) assert(seen.has(b.parent));
    seen.add(b.name);
    assert(b.position.every(Number.isFinite));
  }
  for (const mesh of [...Object.values(art.meshes), ...art.rig.map((b) => b.mesh)]) {
    const count = mesh.positions.length / 3;
    assert(count > 0 && count < 65536);
    assert.equal(mesh.normals.length, count * 3);
    assert.equal(mesh.colors.length, count * 4);
    assert.equal(mesh.uvs.length, count * 2);
    for (const values of [mesh.positions, mesh.normals, mesh.colors, mesh.uvs])
      assert(values.every(Number.isFinite));
    assert(mesh.indices.every((i) => Number.isInteger(i) && i >= 0 && i < count));
  }
});
