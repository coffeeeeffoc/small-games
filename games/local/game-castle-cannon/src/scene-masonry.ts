import * as T from 'three';
import { MeshKit } from './scene-mesh.js';
import { chamferedBox } from './scene-geometry.js';

export const stones = ['#cbb78e', '#d4c19b', '#bda984', '#e0ccaa', '#c6b28e'];
export function stoneWall(
  k: MeshKit,
  g: T.Group,
  x: number,
  z: number,
  width: number,
  height: number,
  depth = 2,
) {
  k.box(g, x, height / 2, z, width, height, depth, '#958264', 0.16);
  masonry(k, g, x, z + depth / 2, width, height);
  masonry(k, g, x - width / 2 - 0.05, z, depth, height, true);
  for (let i = 0; i < width / 1.8; i++) {
    const h = 1.18 + Math.sin(i * 13 + x) * 0.18;
    const block = k.box(
      g,
      x - width / 2 + 0.55 + i * 1.8,
      height + h / 2,
      z,
      1.05,
      h,
      depth + 0.3,
      stones[i % 5]!,
      0.16,
    );
    block.rotation.z = Math.sin(i * 17 + x) * 0.025;
  }
}
export function masonry(
  k: MeshKit,
  g: T.Group,
  x: number,
  z: number,
  width: number,
  height: number,
  side = false,
  back = false,
) {
  for (let row = 0; row < Math.floor(height / 0.94); row++) {
    const cell = 1.48 + Math.sin(row * 7 + x) * 0.19;
    for (let col = 0; col < Math.ceil(width / 1.28) + 1; col++) {
      const left = Math.max(-width / 2, -width / 2 + col * cell - ((row % 2) * cell) / 2);
      const right = Math.min(
        width / 2,
        -width / 2 + (col + 1) * cell - 0.045 - ((row % 2) * cell) / 2,
      );
      if (right <= left) continue;
      const variation = Math.sin(row * 37 + col * 19 + x),
        along = (left + right) / 2;
      const block = k.box(
        g,
        side ? x - 0.12 - variation * 0.07 : x + along,
        row * 0.94 + 0.47 + variation * 0.035,
        side ? z + along : z + (back ? -1 : 1) * (0.12 + variation * 0.07),
        side ? 0.46 : right - left,
        0.86 + variation * 0.08,
        side ? right - left : 0.46,
        stones[Math.floor((Math.sin(row * 79 + col * 37 + x * 11) + 1) * 17) % stones.length]!,
        0.15,
      );
      block.rotation[side ? 'x' : 'z'] = variation * 0.025;
    }
  }
}
/** A chipped masonry fragment, with the same limestone material as its parent wall. */
export function brokenBrick(
  k: MeshKit,
  g: T.Group,
  x: number,
  y: number,
  z: number,
  size: number,
  seed: number,
) {
  const key = `fractured-brick:${seed % 5}`;
  if (!k.geometries.has(key)) {
    const geometry = chamferedBox(1.55, 0.85, 0.95, 0.12),
      v = geometry.getAttribute('position');
    for (let i = 0; i < v.count; i++) {
      const px = v.getX(i),
        py = v.getY(i),
        pz = v.getZ(i);
      v.setXYZ(
        i,
        px,
        py - (py > 0 ? Math.max(0, px + 0.25) * (0.22 + (seed % 5) * 0.07) : 0),
        pz + Math.sin(px * 8 + py * 5 + pz * 3 + (seed % 5)) * 0.04,
      );
    }
    geometry.computeVertexNormals();
    k.geometries.set(key, geometry);
  }
  const mesh = k.mesh(g, k.geometries.get(key)!, stones[seed % 5]!, x, y, z);
  mesh.scale.setScalar(size);
  return mesh;
}
