import * as T from 'three';
import { MeshKit } from './scene-mesh.js';
import { riverCenter, valleyHeight } from './scene-valley.js';
import { approachRoad, approachDetails } from './scene-approach.js';
import { routeCenter } from './scene-space.js';
import { canyonGround } from './scene-canyon.js';
import { canyonRiver } from './scene-river.js';
import { canyonForest } from './scene-forest.js';
import { distantMassif } from './scene-massif.js';
const noise = (x: number, z: number) =>
  Math.sin(x * 0.41 + z * 0.12) * Math.cos(z * 0.27 - x * 0.2);
export function groundHeight(x: number, z: number) {
  if (z > -20 && z < 48 && Math.abs(x - routeCenter(z)) < 4.2) return -0.12;
  if (x > -11 && x < 35 && z > -20 && z < 48) {
    if (x < 6.4 && z > 16) {
      const shelf = Math.max(0, Math.min(1, (x + 10) / 13));
      return -0.12 - 5.8 * (1 - shelf) ** 1.4 + noise(x, z) * 0.36 * (1 - shelf);
    }
    return -0.12;
  }
  if (x > -29 && x < -11 && z > 10 && z < 28) return -1.5 + noise(x, z) * 0.35;
  return valleyHeight(x, z);
}
export function terrain(k: MeshKit) {
  const g = new T.Group();
  canyonGround(k, g, groundHeight);
  canyonRiver(k, g);
  distantMassif(k, g);
  canyonForest(k, g, groundHeight);
  approachRoad(g);
  bridge(k, g);
  approachDetails(k, g, groundHeight);
  k.compact(g);
  return g;
}
function bridge(k: MeshKit, parent: T.Group) {
  const g = new T.Group();
  const shape = new T.Shape();
  shape.moveTo(-11, 0);
  shape.lineTo(-11, 8);
  shape.lineTo(11, 8);
  shape.lineTo(11, 0);
  shape.lineTo(7, 0);
  shape.quadraticCurveTo(0, 12, -7, 0);
  shape.lineTo(-11, 0);
  const arch = new T.ExtrudeGeometry(shape, {
    depth: 3,
    bevelEnabled: true,
    bevelSize: 0.1,
    bevelThickness: 0.1,
    bevelSegments: 1,
    steps: 1,
  });
  k.mesh(g, arch, '#baa98a', 0, -5.5, -1.5);
  k.box(g, 0, 2.8, 0, 23, 0.55, 4, '#cbb68e');
  for (let i = 0; i < 15; i++) {
    k.box(g, -11 + i * 1.55, 3.8, -1.6, 1.45, 1.8, 0.5, '#bdad8c');
    k.box(g, -11 + i * 1.55, 3.8, 1.6, 1.45, 1.8, 0.5, '#bdad8c');
  }
  g.position.set(riverCenter(-50), 0, -50);
  parent.add(g);
}
