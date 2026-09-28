// Original, deterministic source assets. No downloads, paid services or external uploads.
import { mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../assets/resources/', import.meta.url);
await mkdir(new URL('audio/', root), { recursive: true });
await mkdir(new URL('models/', root), { recursive: true });
for (const [name, freq, seconds] of [
  ['rapid', 155, 0.1],
  ['blast', 105, 0.18],
  ['heavy', 64, 0.28],
  ['hit', 230, 0.16],
  ['alert', 680, 0.2],
  ['impact1', 60, 0.65],
  ['impact2', 37, 1.15],
  ['engine', 42, 2],
]) {
  const rate = 22050,
    n = Math.floor(rate * seconds),
    b = Buffer.alloc(44 + n * 2);
  b.write('RIFF');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  let seed = 123;
  for (let i = 0; i < n; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const t = i / rate,
      envelope = Math.exp((-t / seconds) * 7) * Math.min(1, i / 80),
      noise = (seed / 4294967296 - 0.5) * 0.5;
    const sample =
      name === 'engine'
        ? (Math.sin(2 * Math.PI * 42 * t) * 0.4 +
            Math.sin(2 * Math.PI * 84 * t) * 0.12 +
            Math.sin(2 * Math.PI * 126 * t) * 0.08) *
          (0.85 + Math.sin(2 * Math.PI * 6 * t) * 0.15)
        : (Math.sin(2 * Math.PI * freq * t * (1 - t * 0.25)) * 0.6 +
            noise * (name.startsWith('impact') ? 1.5 : 1)) *
          envelope;
    b.writeInt16LE(Math.round(sample * 17000), 44 + i * 2);
  }
  await writeFile(new URL(`audio/${name}.wav`, root), b);
}
// One 12-triangle glTF cube, three nodes; ground-centered, +Y up, +Z forward.
const positions = new Float32Array([
  -1, 0, -1, 1, 0, -1, 1, 2, -1, -1, 2, -1, -1, 0, 1, 1, 0, 1, 1, 2, 1, -1, 2, 1,
]);
const indices = new Uint16Array([
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6,
  1, 6, 5,
]);
const bin = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(indices.buffer)]);
const model = {
  asset: { version: '2.0', generator: 'Night Overwatch original procedural source' },
  scene: 0,
  scenes: [{ name: 'beacon', nodes: [0, 1, 2] }],
  nodes: [
    { mesh: 0, scale: [0.9, 0.15, 0.9] },
    { mesh: 0, scale: [0.18, 1.6, 0.18], translation: [0, 0.3, 0] },
    { mesh: 0, scale: [0.5, 0.2, 0.5], translation: [0, 3.5, 0] },
  ],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
  materials: [
    {
      pbrMetallicRoughness: {
        baseColorFactor: [0.5, 0.8, 0.7, 1],
        metallicFactor: 0,
        roughnessFactor: 1,
      },
      doubleSided: true,
    },
  ],
  buffers: [
    {
      byteLength: bin.length,
      uri: 'data:application/octet-stream;base64,' + bin.toString('base64'),
    },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
    { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength, target: 34963 },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: 8,
      type: 'VEC3',
      min: [-1, 0, -1],
      max: [1, 2, 1],
    },
    { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' },
  ],
};
await writeFile(new URL('models/beacon.gltf', root), JSON.stringify(model));
console.log('Generated 8 original PCM WAVs and glTF beacon (36 triangles).');
