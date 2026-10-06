import * as T from 'three';
import { MeshKit } from './scene-mesh.js';
import { grassTuft } from './scene-foliage.js';
export const riverCenter = (z: number) => -31 + (15 - z) * 0.19;
export const riverSurface = (z: number) => (z < -42 ? -1.2 : -5.6);
/** Stratified banks and tufts are original geometry, with a clear flat troop route. */
export function valleyDetails(k: MeshKit, g: T.Group, height: (x: number, z: number) => number) {
  for (let i = 0; i < 28; i++) {
    const z = -63 + i * 4.5;
    for (const side of [-1, 1]) {
      const x = riverCenter(z) + side * (7.5 + Math.sin(i * 1.8) * 1.2),
        top = height(x + side * 2, z);
      for (let layer = 0; layer < 3; layer++) {
        const stone = k.box(
          g,
          x + side * layer * 0.45,
          top - 0.8 - layer * 1.5,
          z + Math.sin(i * 7 + layer) * 0.9,
          3.3 + Math.sin(i + layer),
          1.6,
          5.4,
          ['#938b73', '#b1a27f', '#aca491'][layer]!,
          0.2,
        );
        stone.rotation.y = Math.sin(i * 13 + layer) * 0.24;
        stone.rotation.z = side * 0.06;
      }
      for (let j = 0; j < 2; j++) k.rock(g, x + side * 1.5, top, z + j * 1.3, 1.0, '#c6b28e');
    }
  }
  for (let i = 0; i < 650; i++) {
    const x = -47 + ((i * 13.731) % 76),
      z = -36 + ((i * 19.319) % 86);
    if (
      (Math.abs(x - (11.5 + Math.min(8.5, Math.max(0, 14 - z)))) < 4.4 && z > -17) ||
      Math.abs(x - riverCenter(z)) < 7
    )
      continue;
    if (x > -11 && z < 15) continue;
    const key = `tuft:${i % 4}`;
    if (!k.geometries.has(key)) k.geometries.set(key, grassTuft(i % 4));
    const tuft = k.mesh(g, k.geometries.get(key)!, '#d9e2a1', x, height(x, z) + 0.04, z);
    const material = tuft.material as T.MeshStandardMaterial;
    material.vertexColors = true;
    material.side = T.DoubleSide;
    tuft.rotation.y = i * 1.3;
    tuft.scale.setScalar(0.9 + (i % 3) * 0.35);
    tuft.castShadow = false;
  }
}
export function distantRidges(g: T.Group) {
  for (let i = 0; i < 11; i++) {
    const h = 40 + ((i * 17) % 35),
      geometry = new T.PlaneGeometry(78, 74, 36, 34);
    geometry.rotateX(-Math.PI / 2);
    const vertices = geometry.getAttribute('position'),
      colors: number[] = [];
    for (let j = 0; j < vertices.count; j++) {
      const x = vertices.getX(j),
        z = vertices.getZ(j),
        falloff = Math.pow(Math.max(0, 1 - (x / 39) ** 2 - (z / 37) ** 2), 1.3),
        folded = 1 - Math.abs(Math.sin(x * 0.19 + z * 0.08 + i)) * 0.23,
        broken =
          0.89 + Math.sin(x * 0.32 + z * 0.23) * 0.07 + Math.cos(x * 0.68 - z * 0.41) * 0.025,
        y = h * falloff * folded * broken;
      vertices.setY(j, y);
      const shade = new T.Color(y > h * 0.73 ? '#c6d6e0' : y > h * 0.4 ? '#8095a9' : '#6b8299');
      shade.multiplyScalar(0.92 + Math.sin(x * 0.73 + z * 0.44 + i) * 0.08);
      colors.push(shade.r, shade.g, shade.b);
    }
    geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const mesh = new T.Mesh(
      geometry,
      new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    );
    mesh.position.set(-120 + i * 29, -9, -178 - (i % 3) * 25);
    g.add(mesh);
  }
}
