import * as T from 'three';
import type { MeshKit } from './scene-mesh.js';
import { landNoise, riverCenter } from './scene-valley.js';

/** Mixed original conifers and broadleaf trees, grown as overlapping groves on the actual terraces. */
export function canyonForest(
  k: MeshKit,
  parent: T.Group,
  height: (x: number, z: number) => number,
) {
  const matrices: T.Matrix4[][] = Array.from({ length: 6 }, () => []),
    pose = new T.Object3D();
  const groves = [
    [-34, -48, 9, 16],
    [-34, -94, 11, 21],
    [-26, -136, 12, 19],
    [-7, -66, 9, 16],
    [-6, -109, 12, 22],
    [-25, -180, 20, 21],
  ];
  for (let grove = 0; grove < groves.length; grove++) {
    const [cx, cz, wide, deep] = groves[grove]!;
    for (let i = 0; i < 43; i++) {
      const angle = i * 2.399 + grove,
        radius = Math.sqrt((i + 0.7) / 43),
        x = cx! + Math.cos(angle) * radius * wide!,
        z = cz! + Math.sin(angle) * radius * deep!,
        y = height(x, z);
      if (Math.abs(x - riverCenter(z)) < 12 || y < -0.5) continue;
      if (Math.abs(height(x + 0.7, z) - y) + Math.abs(height(x, z + 0.7) - y) > 3.0) continue;
      pose.position.set(x, y - 0.08, z);
      pose.rotation.set(0, i * 1.83, (landNoise(x, z) - 0.5) * 0.075);
      const scale = 0.65 + landNoise(x * 0.7, z * 0.7) * 0.85;
      pose.scale.set(scale * (0.88 + (i % 3) * 0.12), scale, scale);
      pose.updateMatrix();
      matrices[(i + grove * 2) % 6]!.push(pose.matrix.clone());
    }
  }
  for (let kind = 0; kind < 6; kind++) {
    const key = `original-forest:${kind}`,
      high = treeGeometry(kind, false),
      low = treeGeometry(kind, true);
    high.userData.lowGeometry = low;
    k.geometries.set(key, high);
    k.geometries.set('low:' + key, low);
    const material = new T.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      side: T.DoubleSide,
    });
    k.materials.set(`forest:${kind}`, material);
    const trees = new T.InstancedMesh(high, material, matrices[kind]!.length);
    matrices[kind]!.forEach((matrix, id) => trees.setMatrixAt(id, matrix));
    trees.castShadow = trees.receiveShadow = true;
    trees.computeBoundingSphere();
    parent.add(trees);
  }
}

function treeGeometry(kind: number, low: boolean) {
  const positions: number[] = [],
    colors: number[] = [];
  const triangle = (a: T.Vector3, b: T.Vector3, c: T.Vector3, shade: T.Color) => {
    for (const p of [a, b, c]) {
      positions.push(p.x, p.y, p.z);
      colors.push(shade.r, shade.g, shade.b);
    }
  };
  const branch = (start: T.Vector3, end: T.Vector3, radius: number) => {
    const axis = end.clone().sub(start).normalize(),
      cross = new T.Vector3(0, 1, 0).cross(axis);
    if (cross.lengthSq() < 0.01) cross.set(1, 0, 0);
    cross.normalize();
    const other = axis.clone().cross(cross),
      shade = new T.Color('#655b3e');
    for (let side = 0; side < 6; side++) {
      const a = (side * Math.PI) / 3,
        b = ((side + 1) * Math.PI) / 3,
        offsetA = cross.clone().multiplyScalar(Math.cos(a)).addScaledVector(other, Math.sin(a)),
        offsetB = cross.clone().multiplyScalar(Math.cos(b)).addScaledVector(other, Math.sin(b));
      const p = start.clone().addScaledVector(offsetA, radius),
        q = start.clone().addScaledVector(offsetB, radius),
        r = end.clone().addScaledVector(offsetB, radius * 0.25),
        s = end.clone().addScaledVector(offsetA, radius * 0.25);
      triangle(p, q, r, shade);
      triangle(p, r, s, shade);
    }
  };
  const leaf = (center: T.Vector3, angle: number, length: number, width: number, seed: number) => {
    const axis = new T.Vector3(Math.cos(angle), 0.28 + Math.sin(seed) * 0.2, Math.sin(angle)),
      across = new T.Vector3(-Math.sin(angle), 0.1, Math.cos(angle)),
      tip = center.clone().addScaledVector(axis, length),
      base = center.clone().addScaledVector(axis, -length * 0.28),
      left = center.clone().addScaledVector(across, width),
      right = center.clone().addScaledVector(across, -width),
      ridge = center.clone().add(new T.Vector3(0, width * 0.5, 0)),
      shade = new T.Color(kind < 4 ? '#446743' : '#6f8849');
    shade.multiplyScalar(0.8 + landNoise(seed, kind) * 0.4);
    triangle(base, left, ridge, shade);
    triangle(left, tip, ridge, shade);
    triangle(tip, right, ridge, shade);
    triangle(right, base, ridge, shade);
  };
  const h = kind < 4 ? 5.7 + kind * 0.55 : 5.2 + (kind - 4) * 0.7;
  branch(new T.Vector3(), new T.Vector3(0.1, h, 0), 0.2);
  const tiers = low ? 4 : 6,
    boughs = low ? 4 : 5;
  for (let tier = 0; tier < tiers; tier++) {
    const t = (tier + 0.5) / tiers,
      y = kind < 4 ? 0.8 + t * (h - 1.1) : 1.8 + t * (h - 2.0),
      reach = kind < 4 ? (1 - t) * 2.2 + 0.18 : 1.9 * Math.sin(t * Math.PI * 0.85) + 0.5;
    for (let arm = 0; arm < boughs; arm++) {
      const angle = (arm * Math.PI * 2) / boughs + tier * 1.37 + kind,
        start = new T.Vector3(0.03, y, 0),
        end = new T.Vector3(
          Math.cos(angle) * reach,
          y + (kind < 4 ? -0.25 : 0.35),
          Math.sin(angle) * reach,
        );
      branch(start, end, 0.045 * (1 - t * 0.7));
      for (let twig = 0; twig < (low ? 3 : 5); twig++) {
        const along = (twig + 1) / (low ? 3.5 : 5.5),
          center = start.clone().lerp(end, along);
        for (const side of [-1, 1]) {
          const direction = angle + side * 0.82,
            width = kind < 4 ? 0.22 : 0.32,
            length = kind < 4 ? 0.63 : 0.75;
          leaf(center, direction, length, width, twig * 3.17 + tier * 7 + arm);
        }
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
