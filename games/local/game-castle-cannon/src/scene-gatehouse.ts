import * as T from 'three';
import type { MeshKit } from './scene-mesh.js';
import { sculpture } from './scene-sculpture.js';
import model from './models/gatehouse.json';
/** Original Blender timber joints, clay tiles and curved arch stones. */
export function gatehouseDetail(k: MeshKit, g: T.Group, part: 'lookout' | 'arch', roof = true) {
  const tiles = new Set(['#795c3d', '#995335', '#a66a40', '#8e5037']);
  sculpture(
    k,
    model.filter((batch) => batch.group === part && (roof || !tiles.has(batch.color))),
    { [part]: g },
  );
}
export function brokenGateLeaves(k: MeshKit, g: T.Group, x: number, z: number) {
  for (const side of [-1, 1]) {
    const leaf = new T.Group();
    for (let i = 0; i < 5; i++) {
      const h = 6.5 + Math.sin(i * 7 + side) * 0.95;
      k.box(leaf, (i - 2) * 0.68, h / 2, 0, 0.64, h, 0.34, i % 2 ? '#926735' : '#a87843', 0.075);
    }
    for (const y of [0.8, 3.0, 5.2]) {
      k.box(leaf, 0, y, 0.23, 3.55, 0.32, 0.2, '#54493a', 0.065);
      for (let i = 0; i < 4; i++) k.sphere(leaf, -1.23 + i * 0.82, y, 0.37, 0.085, '#a9a48a', 0.65);
    }
    k.compact(leaf);
    leaf.position.set(x + side * 5.8, 0.2, z + 3.0);
    leaf.scale.set(1.37, 1.56, 1);
    leaf.rotation.set(-0.18, side * 0.62, -side * 0.3);
    g.add(leaf);
  }
}
