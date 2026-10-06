import * as T from 'three';
import { MeshKit } from './scene-mesh.js';
import { brokenBrick, stones } from './scene-masonry.js';

/** Intact infill disappears on impact; surviving courses form an irregular missing-brick breach. */
export function breachedTowerRing(k: MeshKit, ring: T.Group, height: number, center: number) {
  k.box(ring, 0, height / 2, -0.9, 4.6, height, 2.8, '#b7a583', 0.16);
  const facing = new T.Group();
  for (let row = 0; row < Math.ceil(height / 0.9); row++) {
    const y = Math.min(height - 0.28, row * 0.9 + 0.45);
    for (let col = 0; col < 5; col++) {
      const left = Math.max(-2.3, -2.3 + col * 1.15 - (row % 2) * 0.55);
      const right = Math.min(2.3, -2.3 + (col + 1) * 1.15 - 0.08 - (row % 2) * 0.55);
      if (right <= left) continue;
      const x = (left + right) / 2;
      const distance = Math.hypot((x + 0.3) / 1.3, (y - center) / 1.45);
      const missing = distance < 1.05 + Math.sin(row * 11 + col * 7) * 0.18;
      const brick = k.box(
        missing ? facing : ring,
        x,
        y,
        1.8,
        right - left,
        0.8,
        1.2,
        stones[(row + col) % 5]!,
        0.14,
      );
      brick.rotation.z = Math.sin(row * 11 + col * 7) * 0.025;
    }
  }
  // Chipped ends are stone surfaces, without a rectangular black backing or wooden shutter.
  for (const [x, y, size, seed] of [
    [-1.6, center - 0.5, 0.4, 1],
    [1.25, center + 0.45, 0.5, 2],
    [-0.2, center - 1.4, 0.5, 3],
    [0.2, center + 1.3, 0.45, 4],
  ]) {
    const brick = brokenBrick(k, ring, x!, y!, 2.28, size!, seed!);
    brick.rotation.z = (seed! - 2) * 0.13;
  }
  for (let j = 0; j < 3; j++)
    k.box(ring, -1.65 + j * 1.65, height + 0.65, 0, 1.02, 1.3, 4.82, '#d5c29c', 0.16);
  k.compact(facing);
  return facing;
}

export function brokenTowerStump(k: MeshKit) {
  const stump = new T.Group();
  for (let i = 0; i < 11; i++) {
    const brick = brokenBrick(
      k,
      stump,
      -1.7 + (i % 4) * 1.08,
      14.05 + Math.floor(i / 4) * 0.48,
      i < 7 ? 2 : -1.8,
      0.65 + (i % 3) * 0.13,
      i,
    );
    brick.rotation.set((i % 2) * 0.08, Math.sin(i * 3) * 0.12, Math.sin(i * 7) * 0.2);
  }
  k.compact(stump);
  stump.visible = false;
  return stump;
}

export function towerRubble(k: MeshKit, g: T.Group, x: number, z: number) {
  for (let i = 0; i < 24; i++) {
    const row = Math.floor(i / 8),
      column = i % 8;
    const brick = brokenBrick(
      k,
      g,
      x - 3.2 + column * 0.86 + Math.sin(i * 3) * 0.25,
      0.35 + row * 0.48,
      z + 6.4 + Math.cos(i * 5) * (2.4 - row * 0.4),
      0.6 + (i % 4) * 0.12,
      i,
    );
    brick.rotation.set(Math.sin(i * 13) * 0.35, i * 1.8, Math.cos(i * 7) * 0.25);
  }
  // A readable section of the original wall remains among the detached bricks.
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 3 - row; col++) {
      const brick = brokenBrick(
        k,
        g,
        x - 2.3 + col * 1.05,
        0.65 + row * 0.72,
        z + 7.2,
        0.8,
        row * 3 + col,
      );
      brick.rotation.y = -0.25;
      brick.rotation.z = 0.15;
    }
}
