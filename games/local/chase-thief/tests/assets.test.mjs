import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyEngine } from '../scripts/build-cocos-engine.mjs';
test('runtime is pinned official Cocos, including 3D and skeletal features', async () => {
  const info = await verifyEngine();
  assert(info.features.includes('3d'));
  assert(info.features.includes('skeletal-animation'));
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
