import * as T from 'three';
import type { MeshKit } from './scene-mesh.js';
import { sculpture } from './scene-sculpture.js';
import massif from './models/massif-rodin.json';

/** The reference-derived massif is real textured geometry behind the playable valley. */
export function distantMassif(k: MeshKit, parent: T.Group) {
  const mountains = new T.Group();
  sculpture(k, massif, { base: mountains });
  mountains.scale.set(100, 110, 65);
  mountains.position.set(-65, -15, -225);
  parent.add(mountains);
  const far = new T.Group();
  sculpture(k, massif, { base: far });
  far.scale.set(80, 90, 60);
  far.position.set(115, -20, -245);
  far.rotation.y = -0.35;
  parent.add(far);
}
