import * as T from 'three';
import type { MeshKit } from './scene-mesh.js';
import { landNoise, riverCenter } from './scene-valley.js';
import { sculptedGeometry } from './scene-sculpture.js';
import spruce from './models/spruce-rodin.json';

/** The reviewed spruce shares one mesh/material across the river terraces. */
export function canyonForest(
  k: MeshKit,
  parent: T.Group,
  height: (x: number, z: number) => number,
) {
  const matrices: T.Matrix4[] = [],
    pose = new T.Object3D();
  const groves = [
    [-34, -48, 9, 16],
    [-34, -94, 11, 21],
    [-26, -136, 12, 19],
    [-7, -66, 9, 16],
    [-6, -109, 12, 22],
    [-25, -180, 20, 21],
  ];
  for (const [grove, [cx, cz, wide, deep]] of groves.entries()) {
    for (let i = 0; i < 29; i++) {
      const angle = i * 2.399 + grove,
        radius = Math.sqrt((i + 0.7) / 29);
      const x = cx! + Math.cos(angle) * radius * wide!,
        z = cz! + Math.sin(angle) * radius * deep!,
        y = height(x, z);
      if (Math.abs(x - riverCenter(z)) < 12 || y < -0.5) continue;
      if (Math.abs(height(x + 0.7, z) - y) + Math.abs(height(x, z + 0.7) - y) > 3) continue;
      pose.position.set(x, y - 0.08, z);
      pose.rotation.set(0, i * 1.83, (landNoise(x, z) - 0.5) * 0.075);
      const scale = 0.65 + landNoise(x * 0.7, z * 0.7) * 0.85;
      pose.scale.set(scale * (0.88 + (i % 3) * 0.12), scale, scale);
      pose.updateMatrix();
      matrices.push(pose.matrix.clone());
    }
  }
  const key = 'rodin-spruce';
  if (!k.geometries.has(key)) k.geometries.set(key, sculptedGeometry(spruce[0]!));
  const trees = new T.InstancedMesh(
    k.geometries.get(key)!,
    k.pbrMaterial(spruce[0]!.maps),
    matrices.length,
  );
  matrices.forEach((matrix, i) => trees.setMatrixAt(i, matrix));
  trees.castShadow = trees.receiveShadow = true;
  trees.computeBoundingSphere();
  parent.add(trees);
}
