import * as T from 'three';
import type { MeshKit } from './scene-mesh.js';
import { canyonMaterial } from './scene-canyon.js';
import { landNoise } from './scene-valley.js';

/** One connected sculpted mountain range, with broad faces, secondary ridges and slope-limited snow. */
export function distantMassif(k: MeshKit, parent: T.Group) {
  const geometry = new T.PlaneGeometry(470, 150, 188, 70);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(-35, 0, -207);
  const vertices = geometry.getAttribute('position');
  const summits = [
    [-172, -207, 52, 49, 37],
    [-114, -184, 65, 32, 27],
    [-76, -178, 78, 34, 23],
    [-50, -156, 64, 25, 24],
    [-18, -176, 54, 30, 28],
    [10, -192, 70, 41, 31],
    [69, -218, 57, 52, 35],
    [127, -195, 46, 42, 33],
  ];
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i),
      z = vertices.getZ(i);
    let mass = 0;
    for (const [px, pz, high, wide, deep] of summits)
      mass = Math.max(
        mass,
        high! * Math.exp(-(((x - px!) / wide!) ** 2 + ((z - pz!) / deep!) ** 2)),
      );
    const ridge = 1 - Math.abs(landNoise(x * 0.068, z * 0.059) * 2 - 1),
      fissure = landNoise(x * 0.25, z * 0.19),
      shoulder = landNoise(x * 0.031 + 7, z * 0.029);
    vertices.setY(
      i,
      -7 + mass * (0.68 + ridge * 0.2 + fissure * 0.12) + shoulder * 7 + (fissure - 0.5) * 3.5,
    );
  }
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal'),
    colors: number[] = [];
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i),
      z = vertices.getZ(i),
      y = vertices.getY(i),
      snowLine = 43 + landNoise(x * 0.1, z * 0.1) * 10,
      snow =
        Math.max(0, Math.min(1, (y - snowLine) / 5)) *
        Math.max(0, Math.min(1, (normals.getY(i) - 0.25) / 0.35)),
      color = new T.Color('#8b9ca5').lerp(new T.Color('#e6e9dd'), snow);
    color.multiplyScalar(0.85 + landNoise(x * 0.2, z * 0.2) * 0.23);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  const massif = new T.Mesh(geometry, canyonMaterial(k));
  massif.receiveShadow = true;
  parent.add(massif);
}
