import * as T from 'three';
import type { MeshKit } from './scene-mesh.js';
import { sculpture } from './scene-sculpture.js';
import model from './models/lookout-rodin.json';
import gate from './models/gate-rodin.json';
/** Reviewed oak fighting gallery with slate tiles and actual open viewing slots. */
export function gatehouseDetail(k: MeshKit, g: T.Group) {
  sculpture(k, model, { base: g });
}
export function brokenGateLeaves(k: MeshKit, g: T.Group, x: number, z: number) {
  const leaves: T.Group[] = [];
  for (const side of [-1, 1]) {
    const leaf = new T.Group();
    const group = side < 0 ? 'left' : 'right';
    sculpture(
      k,
      gate.filter((part) => part.group === group),
      { [group]: leaf },
    );
    k.compact(leaf);
    leaf.position.set(x, 0, z);
    leaf.scale.set(1.37, 1.56, 1);
    leaf.userData.side = side;
    g.add(leaf);
    leaves.push(leaf);
  }
  g.userData.leaves = leaves;
}
