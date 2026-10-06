import * as T from 'three';
import type { MeshKit } from './scene-mesh.js';
import { sculpture } from './scene-sculpture.js';
import model from './models/gatehouse.json';
/** Original Blender timber joints, clay tiles and curved arch stones. */
export function gatehouseDetail(k: MeshKit, g: T.Group, part: 'lookout' | 'arch') {
  sculpture(
    k,
    model.filter((batch) => batch.group === part),
    { [part]: g },
  );
}
export function brokenGateLeaves(k: MeshKit, g: T.Group, x: number, z: number) {
  for (const side of [-1, 1]) {
    const leaf = new T.Group();
    for (let i = 0; i < 5; i++) {
      const h = 4.5 + Math.sin(i * 7 + side) * 0.6;
      k.box(leaf, (i - 2) * 0.55, h / 2, 0, 0.5, h, 0.34, i % 2 ? '#926735' : '#a87843', 0.075);
    }
    for (const y of [0.65, 2.25, 3.75]) {
      k.box(leaf, 0, y, 0.23, 2.85, 0.32, 0.2, '#54493a', 0.065);
      for (let i = 0; i < 4; i++) k.sphere(leaf, -0.95 + i * 0.63, y, 0.37, 0.085, '#a9a48a', 0.65);
    }
    k.compact(leaf);
    leaf.position.set(x + side * 4.5, 0.2, z + 4.2);
    leaf.scale.set(1.37, 1.56, 1);
    leaf.rotation.set(-0.28, side * 0.2, -side * 0.25);
    g.add(leaf);
  }
}
