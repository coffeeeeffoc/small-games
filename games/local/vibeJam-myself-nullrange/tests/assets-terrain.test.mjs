import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  terrainHeight,
  terrainVertex,
  terrainGeometry,
  TILE_SIZE,
  TERRAIN_STEP,
  FLIGHT_CEILING,
  sceneryAt,
  obstacleHeight,
  WATER_LEVEL,
  valleyCenter,
} from '../assets/scripts/core/terrain.ts';
import { createRun, step } from '../assets/scripts/core/rules.ts';
const root = new URL('../', import.meta.url);
const digest = (b) => createHash('sha256').update(b).digest('hex');
const sourceDigest = (b) => digest(b.toString('utf8').replaceAll('\r\n', '\n'));
test('authored GLB payloads, normals, indices, bounds, triangle budgets and source provenance', async () => {
  const manifest = JSON.parse(await readFile(new URL('art/manifest.json', root), 'utf8'));
  assert.equal(manifest.assets.length, 19);
  assert.equal(
    manifest.sourceHash,
    sourceDigest(await readFile(new URL('art/build_environment.py', root))),
  );
  const hero = JSON.parse(await readFile(new URL('art/falcon-manifest.json', root), 'utf8'));
  const forest = JSON.parse(await readFile(new URL('art/forest-manifest.json', root), 'utf8'));
  assert.equal(
    digest(await readFile(new URL('art/' + forest.silhouetteTexture, root))),
    forest.silhouetteSha256,
  );
  assert.equal(
    digest(await readFile(new URL('art/' + forest.sourceTexture, root))),
    forest.textureSha256,
  );
  assert.equal(hero.sourceHash, sourceDigest(await readFile(new URL('art/build_falcon.py', root))));
  assert.equal(manifest.assets.find((a) => a.name === 'falcon').sha256, hero.sha256);
  const panorama = JSON.parse(await readFile(new URL('art/panorama-manifest.json', root), 'utf8'));
  assert.equal(
    panorama.sha256,
    digest(await readFile(new URL('assets/resources/textures/' + panorama.name, root))),
  );
  let total = 0;
  for (const asset of manifest.assets) {
    if (asset.generator)
      assert.equal(
        asset.sourceHash,
        sourceDigest(await readFile(new URL('art/' + asset.generator, root))),
      );
    const file = await readFile(new URL(`assets/resources/models/${asset.name}.glb`, root));
    assert.equal(file.toString('ascii', 0, 4), 'glTF');
    assert.equal(file.readUInt32LE(4), 2);
    assert.equal(file.readUInt32LE(8), file.length);
    assert.equal(file.length, asset.bytes);
    assert.equal(digest(file), asset.sha256);
    const length = file.readUInt32LE(12),
      json = JSON.parse(file.toString('utf8', 20, 20 + length));
    const bin = file.subarray(28 + length);
    if (asset.generator === 'build_forest.py') {
      const leaves = json.materials.find((m) => /^B3 masked pine/.test(m.name));
      assert.equal(leaves.alphaMode, 'MASK');
      assert.equal(leaves.doubleSided, true);
      assert.ok(leaves.pbrMetallicRoughness.baseColorTexture);
      assert.ok(json.images.every((i) => Number.isInteger(i.bufferView)));
    }
    assert.ok(json.buffers.every((b) => !b.uri));
    const values = (id) => {
      const a = json.accessors[id],
        v = json.bufferViews[a.bufferView],
        size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType],
        components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
      const result = [];
      for (let i = 0; i < a.count; i++)
        for (let j = 0; j < components; j++) {
          const offset =
            (v.byteOffset || 0) +
            (a.byteOffset || 0) +
            i * (v.byteStride || size * components) +
            j * size;
          result.push(
            a.componentType === 5126 ? bin.readFloatLE(offset) : bin.readUIntLE(offset, size),
          );
        }
      return result;
    };
    let triangles = 0;
    for (const m of json.meshes)
      for (const p of m.primitives) {
        assert.equal(p.mode ?? 4, 4);
        assert.ok(Number.isInteger(p.attributes.NORMAL));
        assert.ok(Number.isInteger(p.attributes.TEXCOORD_0));
        const positions = values(p.attributes.POSITION),
          normals = values(p.attributes.NORMAL),
          indices = values(p.indices);
        if (asset.name.startsWith('forest-'))
          for (let i = 0; i < positions.length; i += 3) {
            assert.ok(
              Math.hypot(positions[i], positions[i + 2]) * 1.65 <= 50,
              'foliage stays within unchanged B2 collision radius',
            );
            assert.ok(
              positions[i + 1] * 1.65 <= 38,
              'foliage stays below unchanged B2 collision height',
            );
          }
        assert.ok(positions.every(Number.isFinite));
        assert.ok(normals.every(Number.isFinite));
        for (let i = 0; i < normals.length; i += 3)
          assert.ok(Math.abs(Math.hypot(...normals.slice(i, i + 3)) - 1) < 0.02);
        assert.ok(indices.every((i) => Number.isInteger(i) && i >= 0 && i < positions.length / 3));
        for (let i = 0; i < positions.length; i++)
          assert.ok(
            positions[i] >= asset.bounds.min[i % 3] - 0.001 &&
              positions[i] <= asset.bounds.max[i % 3] + 0.001,
          );
        triangles += indices.length / 3;
      }
    assert.equal(triangles, asset.triangles);
    assert.ok(triangles <= (asset.name.startsWith('ridge-') ? 20000 : 6000), asset.name);
    total += triangles;
  }
  assert.ok(total < 65000);
});
test('four shared baked textures match generator and content hashes', async () => {
  const manifest = JSON.parse(await readFile(new URL('art/surfaces-manifest.json', root), 'utf8'));
  assert.equal(
    manifest.sourceHash,
    sourceDigest(await readFile(new URL('art/bake_surfaces.py', root))),
  );
  assert.equal(manifest.assets.length, 4);
  for (const asset of manifest.assets) {
    const b = await readFile(new URL('assets/resources/textures/' + asset.name, root));
    assert.equal(b.length, asset.bytes);
    assert.equal(digest(b), asset.sha256);
  }
  const granite = JSON.parse(await readFile(new URL('art/granite-manifest.json', root), 'utf8'));
  assert.equal(
    digest(await readFile(new URL('assets/resources/textures/' + granite.name, root))),
    granite.sha256,
  );
  const lunar = JSON.parse(await readFile(new URL('art/lunar-manifest.json', root), 'utf8'));
  assert.equal(
    digest(await readFile(new URL('assets/resources/textures/' + lunar.texture, root))),
    lunar.textureSha256,
  );
});
test('terrain collision exactly matches rendered triangles across negative coordinates and tile seams', () => {
  for (const [tx, tz] of [
    [0, 0],
    [-2, -3],
    [3, 1],
  ]) {
    const g = terrainGeometry(tx, tz);
    assert.equal(g.indices.length / 3, 2 * (TILE_SIZE / TERRAIN_STEP) ** 2);
    for (let i = 0; i < g.positions.length; i += 3) {
      const [x, y, z] = g.positions.slice(i, i + 3);
      assert.equal(terrainHeight(x, z), y);
      assert.ok(y + 35 < FLIGHT_CEILING);
    }
    for (let i = 0; i < g.indices.length; i += 3) {
      const [a, b, c] = g.indices
        .slice(i, i + 3)
        .map((id) => g.positions.slice(id * 3, id * 3 + 3));
      const p = a.map((v, k) => v * 0.2 + b[k] * 0.3 + c[k] * 0.5);
      assert.ok(Math.abs(terrainHeight(p[0], p[2]) - p[1]) < 1e-9);
    }
  }
  for (let z = -5000; z < 5000; z += 73)
    for (let x = -2000; x < 2000; x += 61) assert.ok(terrainVertex(x, z) < FLIGHT_CEILING - 50);
});
test('scenery placements are deterministic, collisions lift real flights above their volumes', () => {
  const o = sceneryAt(-1, -2);
  assert.deepEqual(o, sceneryAt(-1, -2));
  assert.equal(obstacleHeight(o.x, o.z), o.y + o.height);
  const s = createRun();
  s.player.x = o.x;
  s.player.z = o.z + 2;
  s.player.y = o.y + 1;
  step(s);
  assert.ok(s.player.y >= o.y + o.height + 7);
  assert.ok(s.player.shield < 70);
});
test('the valley river remains continuous and both forest banks stay above its waterline', () => {
  for (let z = -10000; z <= 10000; z += 13) {
    const x = valleyCenter(z);
    assert.ok(terrainHeight(x, z) < WATER_LEVEL - 10);
    assert.ok(terrainHeight(x - 125, z) > WATER_LEVEL + 10);
    assert.ok(terrainHeight(x + 125, z) > WATER_LEVEL + 10);
  }
});
