import * as T from 'three';
import type { MeshKit } from './scene-mesh.js';
import { disposeVariantGeometry } from './scene-compact.js';
/** The squad shares the exact original model; individual motion and casualties stay independent. */
export class TroopBatch {
  readonly root = new T.Group();
  readonly poses: T.Group[];
  private parts: { mesh: T.InstancedMesh; local: T.Matrix4 }[] = [];
  constructor(kit: MeshKit, count: number, contactMaterial: T.Material) {
    const model = kit.person(),
      contact = new T.Mesh(new T.CircleGeometry(0.42, 12), contactMaterial);
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.02;
    model.add(contact);
    model.updateMatrixWorld(true);
    model.traverse((child) => {
      if (!(child instanceof T.Mesh)) return;
      const mesh = new T.InstancedMesh(child.geometry, child.material, count);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.parts.push({ mesh, local: child.matrixWorld.clone() });
      this.root.add(mesh);
    });
    this.poses = Array.from({ length: count }, () => {
      const pose = new T.Group();
      pose.scale.setScalar(1.25);
      return pose;
    });
  }
  sync() {
    const matrix = new T.Matrix4(),
      visible = this.poses.filter((pose) => pose.visible);
    for (const pose of this.poses) pose.updateMatrixWorld(true);
    for (const part of this.parts) {
      part.mesh.count = visible.length;
      visible.forEach((pose, id) => {
        part.mesh.setMatrixAt(id, matrix.multiplyMatrices(pose.matrixWorld, part.local));
      });
      part.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  dispose() {
    for (const part of this.parts) {
      disposeVariantGeometry(part.mesh);
      part.mesh.dispose();
    }
    this.root.clear();
  }
}
