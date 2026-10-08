// Export the reviewed Rodin GLBs to the existing native-compatible sculpture format.
// Uses the repository's installed sharp through NODE_PATH; no runtime GLTF loader is required.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Vector3 } from 'three';
const sharp = createRequire(import.meta.url)('sharp');
const root = fileURLToPath(new URL('../../', import.meta.url));
const name = process.argv[2];
assert(
  ['cannon', 'gate', 'stone', 'soldier', 'spruce', 'massif', 'loader', 'cliff', 'lookout'].includes(
    name,
  ),
  'Choose a reviewed asset',
);
const source =
  process.argv[3] ??
  path.join(
    root,
    'docs/design/local-2026-10-07/source',
    ['cannon', 'gate'].includes(name) ? `${name}-parts.glb` : `${name}.glb`,
  );
const file = await readFile(source);
const provenance = JSON.parse(
  await readFile(path.join(root, 'docs/design/local-2026-10-07/source/manifest.json'), 'utf8'),
);
assert.equal(
  createHash('sha256').update(file).digest('hex'),
  provenance.assets.find((asset) => asset.name === name)?.sha256,
  'Source differs from the reviewed Rodin output',
);
assert.equal(file.toString('utf8', 0, 4), 'glTF');
assert.equal(file.readUInt32LE(4), 2);
assert.equal(file.readUInt32LE(8), file.length);
const size = file.readUInt32LE(12),
  gltf = JSON.parse(file.subarray(20, 20 + size)),
  bin = file.subarray(28 + size);
assert(
  gltf.nodes.every((n) => !n.matrix && !n.translation && !n.rotation && !n.scale),
  'Review node transforms before importing',
);
const view = (index) => {
  const v = gltf.bufferViews[index];
  assert.equal(v.buffer, 0);
  return bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
};
const attribute = (index) => {
  const a = gltf.accessors[index],
    v = gltf.bufferViews[a.bufferView],
    bytes = view(a.bufferView),
    width = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
  assert(width && !a.sparse && !a.normalized);
  const unit = { 5126: 4, 5123: 2, 5125: 4 }[a.componentType];
  assert(unit);
  const read = { 5126: 'readFloatLE', 5123: 'readUInt16LE', 5125: 'readUInt32LE' }[a.componentType];
  return Array.from({ length: a.count }, (_, i) =>
    Array.from({ length: width }, (_, j) =>
      bytes[read]((a.byteOffset ?? 0) + i * (v.byteStride ?? width * unit) + j * unit),
    ),
  );
};
const art = path.join(root, 'public/castle-cannon-art/rodin');
await mkdir(art, { recursive: true });
const imagePaths = [];
for (const [i, img] of gltf.images.entries()) {
  assert.equal(img.mimeType, 'image/png');
  const filename = `${name}-${i}.jpg`;
  // Mechanical texture packing only: preserve the authored colors and PBR channels.
  await sharp(view(img.bufferView))
    .resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
    .toFile(path.join(art, filename));
  imagePaths.push(`castle-cannon-art/rodin/${filename}`);
}
const map = (texture) => imagePaths[gltf.textures[texture.index].source];
const axis = new Vector3(1, 0, 0),
  batches = [];
for (const [meshId, mesh] of gltf.meshes.entries())
  for (const p of mesh.primitives) {
    assert(p.mode === undefined || p.mode === 4);
    const positions = attribute(p.attributes.POSITION),
      normals = attribute(p.attributes.NORMAL),
      uvs = attribute(p.attributes.TEXCOORD_0),
      indices = attribute(p.indices).flat();
    assert(positions.length <= 65535 && indices.every((i) => i < positions.length));
    const group =
      name === 'gate'
        ? [0, 2, 3].includes(meshId)
          ? 'left'
          : 'right'
        : name === 'cannon' && [1, 4, 5, 6].includes(meshId)
          ? 'barrel'
          : 'base';
    const vertices = Buffer.alloc(positions.length * 16),
      index = Buffer.alloc(indices.length * 2);
    positions.forEach((raw, i) => {
      const point = new Vector3(...raw),
        normal = new Vector3(...normals[i]);
      if (name === 'cannon') {
        point.y += 0.4311176538467407;
        point.multiplyScalar(5.6);
        if ([2, 3].includes(meshId)) point.z -= -0.0255 * 5.6 * 0.2;
        else {
          point.z *= 0.8;
          normal.z /= 0.8;
          normal.normalize();
        }
        if (group === 'barrel') {
          point.y -= 3.1;
          point.applyAxisAngle(axis, -0.14);
          normal.applyAxisAngle(axis, -0.14);
        }
      } else if (name === 'gate') {
        point.x *= 3.9;
        point.y = (point.y + 0.9462132453918457) * 3.85;
        point.z *= 1.6;
        normal.set(normal.x / 3.9, normal.y / 3.85, normal.z / 1.6).normalize();
      } else if (name === 'stone') {
        const { min, max } = gltf.accessors[p.attributes.POSITION];
        point.set(...raw.map((v, j) => (v - (min[j] + max[j]) / 2) / (max[j] - min[j])));
        normal.set(...normals[i].map((v, j) => v * (max[j] - min[j]))).normalize();
      } else {
        const { min, max } = gltf.accessors[p.attributes.POSITION];
        point.y -= min[1];
        point.multiplyScalar(
          { soldier: 2.3, loader: 2.1, massif: 1, spruce: 6.3, cliff: 1, lookout: 5.4 }[name] /
            (max[1] - min[1]),
        );
      }
      [
        ...point.toArray().map((v) => v * 2048),
        ...normal.toArray().map((v) => v * 32767),
        ...uvs[i].map((v) => v * 4096),
      ].forEach((v, j) => {
        assert(Number.isFinite(v) && v >= -32768 && v <= 32767, 'Quantized vertex out of range');
        vertices.writeInt16LE(Math.round(v), i * 16 + j * 2);
      });
    });
    indices.forEach((v, i) => index.writeUInt16LE(v, i * 2));
    const material = gltf.materials[p.material],
      pbr = material.pbrMetallicRoughness;
    batches.push({
      id: meshId,
      group,
      color: '#ffffff',
      metal: 0,
      positionScale: 2048,
      vertices: vertices.toString('base64'),
      indices: index.toString('base64'),
      maps: {
        color: map(pbr.baseColorTexture),
        normal: map(material.normalTexture),
        metalRoughness: map(pbr.metallicRoughnessTexture),
      },
    });
  }
await writeFile(path.join(root, `src/models/${name}-rodin.json`), JSON.stringify(batches) + '\n');
console.log(
  `${name}: ${batches.length} parts, ${gltf.images.length} shared PBR images, ${batches.reduce((n, b) => n + Buffer.from(b.indices, 'base64').length / 6, 0)} triangles`,
);
