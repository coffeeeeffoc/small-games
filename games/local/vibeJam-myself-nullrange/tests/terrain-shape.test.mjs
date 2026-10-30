import assert from 'node:assert/strict';
import { test } from 'node:test';
import { terrainVertex, TERRAIN_STEP } from '../assets/scripts/core/terrain.ts';

test('mountain ridges have volume instead of grid-sized needles and vertical sheets', () => {
  let steepest = 0,
    tallestNeedle = 0,
    highest = 0;
  for (let z = -8192; z <= 8192; z += TERRAIN_STEP)
    for (let x = -8192; x <= 8192; x += TERRAIN_STEP) {
      const height = terrainVertex(x, z);
      const neighbours = [
        [-TERRAIN_STEP, 0],
        [TERRAIN_STEP, 0],
        [0, -TERRAIN_STEP],
        [0, TERRAIN_STEP],
      ].map(([dx, dz]) => terrainVertex(x + dx, z + dz));
      steepest = Math.max(steepest, ...neighbours.map((h) => Math.abs(h - height) / TERRAIN_STEP));
      tallestNeedle = Math.max(tallestNeedle, height - neighbours.reduce((a, b) => a + b, 0) / 4);
      highest = Math.max(highest, height);
    }
  console.log({ steepest, tallestNeedle, highest });
  assert.ok(steepest < 3, 'a 64m terrain cell must not become a near-vertical wall');
  assert.ok(tallestNeedle < 90, 'a single vertex must not form a hundreds-of-metres needle');
  assert.ok(highest > 2000, 'removing needles must preserve mountains above cruise altitude');
});
