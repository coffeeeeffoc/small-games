import * as T from 'three';
import type { MeshKit } from './scene-mesh.js';
/** Draped cloth and a geometric fleur-de-lys stay readable at phone size. */
export function drapedBanner(
  k: MeshKit,
  parent: T.Object3D,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  blue = false,
) {
  const geometry = new T.PlaneGeometry(w, h, 8, 14),
    vertices = geometry.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    const px = vertices.getX(i),
      py = vertices.getY(i),
      t = (h / 2 - py) / h;
    vertices.setXYZ(
      i,
      px * (1 - t * 0.06),
      py + Math.max(0, t - 0.88) * Math.abs(px) * 2,
      Math.sin(px * 5.5 + t * 2.2) * (0.04 + t * 0.12),
    );
  }
  geometry.computeVertexNormals();
  const cloth = k.mesh(parent, geometry, blue ? '#226b9f' : '#8d3627', x, y - h / 2, z);
  cloth.material = (cloth.material as T.MeshStandardMaterial).clone();
  cloth.material.side = T.DoubleSide;
  k.materials.set(`banner:${x}:${z}:${blue}`, cloth.material);
  k.box(parent, x, y + 0.05, z, w + 0.5, 0.15, 0.18, '#946835');
  heraldry(k, parent, x, y - h * 0.43, z + 0.18, w * 0.53);
}
export function heraldry(
  k: MeshKit,
  parent: T.Object3D,
  x: number,
  y: number,
  z: number,
  size: number,
) {
  const key = 'fleur-de-lys';
  if (!k.geometries.has(key)) {
    const s = new T.Shape();
    s.moveTo(0, 1);
    s.bezierCurveTo(-0.32, 0.65, -0.22, 0.34, -0.1, 0.08);
    s.bezierCurveTo(-0.46, 0.78, -0.9, 0.34, -0.61, 0.05);
    s.bezierCurveTo(-0.48, -0.09, -0.37, 0.23, -0.15, -0.12);
    s.lineTo(-0.33, -0.14);
    s.lineTo(-0.33, -0.26);
    s.lineTo(-0.14, -0.26);
    s.lineTo(-0.3, -0.57);
    s.lineTo(0, -0.4);
    s.lineTo(0.3, -0.57);
    s.lineTo(0.14, -0.26);
    s.lineTo(0.33, -0.26);
    s.lineTo(0.33, -0.14);
    s.lineTo(0.15, -0.12);
    s.bezierCurveTo(0.37, 0.23, 0.48, -0.09, 0.61, 0.05);
    s.bezierCurveTo(0.9, 0.34, 0.46, 0.78, 0.1, 0.08);
    s.bezierCurveTo(0.22, 0.34, 0.32, 0.65, 0, 1);
    k.geometries.set(key, new T.ShapeGeometry(s, 6));
  }
  const emblem = k.mesh(parent, k.geometries.get(key)!, '#edd59b', x, y, z);
  emblem.scale.setScalar(size);
  emblem.castShadow = false;
}
