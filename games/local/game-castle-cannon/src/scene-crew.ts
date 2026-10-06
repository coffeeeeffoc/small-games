import * as T from 'three';
import type { MeshKit } from './scene-mesh.js';
import { sculpture } from './scene-sculpture.js';
import crewModel from './models/crew.json';
/** Two visible working poses, authored together with the cannon rather than generic infantry. */
export function workingCrew(k: MeshKit, parent: T.Group) {
  const loader = new T.Group(),
    gunner = new T.Group();
  sculpture(k, crewModel, { loader, gunner });
  for (const [crew, x, z] of [
    [loader, -18, 19],
    [gunner, -14.5, 18],
  ] as const) {
    crew.position.set(x, 0.4, z);
    crew.scale.setScalar(1.8);
    crew.rotation.y = Math.atan2(-(-21 - x), -(14 - z));
    parent.add(crew);
  }
}
