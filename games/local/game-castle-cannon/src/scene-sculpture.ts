import * as T from 'three';
import type { MeshKit } from './scene-mesh.js';
interface SculptedBatch {
  group: string;
  color: string;
  metal: number;
  positionScale?: number;
  vertices: string;
  indices: string;
  occlusion?: string;
}
/** Blender-authored geometry is embedded: no browser-only fetch or native SDK dependency. */
export function sculpture(k: MeshKit, data: SculptedBatch[], groups: Record<string, T.Group>) {
  for (const batch of data) {
    const key = `sculpture:${batch.group}:${batch.color}:${batch.metal}`;
    if (!k.geometries.has(key)) k.geometries.set(key, sculptedGeometry(batch));
    const geometry = k.geometries.get(key)!;
    const mesh = k.mesh(groups[batch.group]!, geometry, batch.color, 0, 0, 0, batch.metal);
    if (batch.occlusion) {
      const materialKey = `${batch.color}:${batch.metal}:0.85:sculpture`;
      if (!k.materials.has(materialKey)) {
        const material = k.material(batch.color, batch.metal).clone();
        material.vertexColors = true;
        k.materials.set(materialKey, material);
      }
      mesh.material = k.materials.get(materialKey)!;
    }
  }
}
export function sculptedGeometry(batch: SculptedBatch) {
  const bytes = decode(batch.vertices),
    view = new DataView(bytes.buffer),
    count = bytes.length / 16,
    positions = new Float32Array(count * 3),
    normals = new Float32Array(count * 3),
    uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < 3; j++) {
      positions[i * 3 + j] = view.getInt16(i * 16 + j * 2, true) / (batch.positionScale ?? 4096);
      normals[i * 3 + j] = view.getInt16(i * 16 + 6 + j * 2, true) / 32767;
    }
    for (let j = 0; j < 2; j++) uv[i * 2 + j] = view.getInt16(i * 16 + 12 + j * 2, true) / 4096;
  }
  const indices = decode(batch.indices),
    indexView = new DataView(indices.buffer),
    index = new Uint16Array(indices.length / 2),
    geometry = new T.BufferGeometry();
  for (let i = 0; i < index.length; i++) index[i] = indexView.getUint16(i * 2, true);
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new T.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new T.BufferAttribute(uv, 2));
  if (batch.occlusion) {
    const values = decode(batch.occlusion),
      colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.fill(values[i]! / 255, i * 3, i * 3 + 3);
    geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
  }
  geometry.setIndex(new T.BufferAttribute(index, 1));
  return geometry;
}
function decode(value: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
    bytes = new Uint8Array(Math.floor((value.replace(/=+$/, '').length * 6) / 8));
  let bits = 0,
    buffer = 0,
    offset = 0;
  for (const char of value) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) break;
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[offset++] = (buffer >> bits) & 255;
    }
  }
  return bytes;
}
