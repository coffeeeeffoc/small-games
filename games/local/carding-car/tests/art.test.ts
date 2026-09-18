import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { artSource, artFiles } from '../scripts/prepare-art.mjs';
import { KartConfig } from '../assets/scripts/KartConfig.ts';

test('reusable art is self-contained, grounded, within kart collision bounds and mobile budget', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', artSource), 'utf8'));
  let bytes = 0;
  for (const model of manifest.models) {
    const raw = await readFile(new URL(model.file, artSource));
    assert.equal(createHash('sha256').update(raw).digest('hex'), model.sha256, model.file);
    assert.equal(raw.readUInt32LE(0), 0x46546c67);
    assert.equal(raw.readUInt32LE(8), raw.length);
    const gltf = JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)).toString());
    assert.ok(gltf.buffers.every((b) => !b.uri));
    assert.ok(gltf.images.every((i) => i.bufferView !== undefined && i.mimeType === 'image/jpeg'));
    assert.ok(gltf.materials.every((m) => m.extensions.KHR_materials_unlit));
    const mesh = gltf.meshes[0].primitives[0];
    const bounds = gltf.accessors[mesh.attributes.POSITION];
    assert.equal(bounds.min[1], 0, `${model.file} rests on its origin`);
    if (model.file === 'kart.glb') {
      assert.ok(Math.max(Math.abs(bounds.min[0]), bounds.max[0]) <= KartConfig.collisionHalfWidth);
      assert.ok(Math.max(Math.abs(bounds.min[2]), bounds.max[2]) <= KartConfig.collisionHalfLength);
    }
  }
  for (const file of artFiles) bytes += (await readFile(new URL(file, artSource))).length;
  assert.ok(bytes < 5 * 1024 * 1024);
  const profiles = JSON.parse(await readFile(new URL('road-profiles.json', artSource), 'utf8'));
  for (const kind of ['barrier', 'kerb']) {
    const positions = profiles[kind].flatMap((p) => p.positions);
    assert.equal(Math.max(...positions.filter((_, i) => i % 3 === 0)), 0.3);
    assert.equal(Math.max(...positions.filter((_, i) => i % 3 === 2)), 2);
    assert.equal(Math.min(...positions.filter((_, i) => i % 3 === 2)), -2);
  }
});
