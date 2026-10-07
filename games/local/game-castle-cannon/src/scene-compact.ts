import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export function disposeVariantGeometry(object: T.Object3D) {
  if (object instanceof T.Mesh || object instanceof T.Line) {
    object.geometry.userData.lowGeometry?.dispose();
    object.geometry.dispose();
  }
}
/** Preserve both silhouettes while batching static materials into shared draw calls. */
export function compactMeshes(group: T.Group) {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert(),
    children: T.Mesh[] = [];
  group.traverse((child) => {
    if (child instanceof T.Mesh && !(child instanceof T.InstancedMesh)) children.push(child);
  });
  const batches = new Map<T.Material, { high: T.BufferGeometry[]; low: T.BufferGeometry[] }>();
  for (const child of children) {
    if (Array.isArray(child.material)) continue;
    const matrix = new T.Matrix4().multiplyMatrices(inverse, child.matrixWorld),
      clone = (geometry: T.BufferGeometry) =>
        (geometry.index ? geometry.toNonIndexed() : geometry.clone()).applyMatrix4(matrix),
      batch = batches.get(child.material) ?? { high: [], low: [] };
    batch.high.push(clone(child.geometry));
    batch.low.push(clone(child.geometry.userData.lowGeometry ?? child.geometry));
    batches.set(child.material, batch);
    child.parent?.remove(child);
  }
  for (const [material, variants] of batches) {
    const high = mergeGeometries(variants.high),
      low = mergeGeometries(variants.low);
    for (const geometry of [...variants.high, ...variants.low]) geometry.dispose();
    if (!high || !low) throw new Error('Cannot merge scene geometry');
    high.userData.lowGeometry = low;
    const mesh = new T.Mesh(high, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}
