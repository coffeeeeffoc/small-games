import * as T from 'three';
import { MeshKit } from './scene-mesh.js';
import { sculpture } from './scene-sculpture.js';
import model from './models/cannon.json';
export function cannonModel(k: MeshKit) {
  const base = new T.Group(),
    barrel = new T.Group();
  sculpture(k, model, { base, barrel });
  k.compact(base);
  k.compact(barrel);
  base.position.set(-21, 0.46, 14);
  base.scale.setScalar(1.75);
  base.rotation.y = -1.15;
  barrel.position.set(0, 3.1, 0);
  barrel.rotation.x = 0.3;
  base.add(barrel);
  return { base, barrel };
}
