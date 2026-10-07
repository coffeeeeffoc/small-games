import * as T from 'three';
import type { MeshKit } from './scene-mesh.js';
/** Cloth has real folds and a tapered split hem; its sun crest is our original heraldry. */
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
  const sun = k.mesh(
    parent,
    new T.CircleGeometry(w * 0.19, 12),
    '#edd59b',
    x,
    y - h * 0.4,
    z + 0.18,
  );
  sun.castShadow = false;
  for (let ray = 0; ray < 8; ray++) {
    const a = (ray * Math.PI) / 4;
    const beam = k.box(
      parent,
      x + Math.sin(a) * w * 0.28,
      y - h * 0.4 + Math.cos(a) * w * 0.28,
      z + 0.18,
      w * 0.06,
      w * 0.16,
      0.025,
      '#edd59b',
      0,
    );
    beam.rotation.z = -a;
  }
}
