import * as T from 'three';
import { MeshKit } from './scene-mesh.js';
import { stones } from './scene-masonry.js';

/** Broad halls and stepped keep volumes form an interior city, rather than a row of columns. */
export function innerCastle(k: MeshKit, g: T.Group) {
  hall(k, g, 11, -34, 17, 15, 31, 0, false);
  hall(k, g, 10, -35, 10, 11, 6, 31, false);
  hall(k, g, -3, -32, 12, 11, 22);
  hall(k, g, 25, -39, 14, 15, 28);
  hall(k, g, 19, -48, 12, 12, 35);
  // Lower connecting wings expose the courtyard and the setback of the higher keep.
  hall(k, g, 2, -26, 18, 8, 13);
  hall(k, g, 23, -28, 11, 8, 14);
  for (const [x, y, z] of [
    [10, 38, -35],
    [-3, 26, -32],
    [25, 32, -39],
  ])
    k.flag(g, x!, y!, z!, false, 0.65);
}
function hall(
  k: MeshKit,
  g: T.Group,
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  base = 0,
  roof = true,
) {
  k.box(g, x, base + h / 2, z, w, h, d, '#bda984', 0.3);
  for (const side of [-1, 1]) {
    k.box(
      g,
      x + side * (w / 2 - 0.4),
      base + h / 2,
      z + d / 2 + 0.2,
      1.4,
      h + 0.3,
      1.1,
      '#c6b28e',
      0.18,
    );
    k.box(
      g,
      x + side * (w / 2 - 0.4),
      base + h / 2,
      z - d / 2 - 0.2,
      1.4,
      h + 0.3,
      1.1,
      '#c6b28e',
      0.18,
    );
  }
  k.box(g, x, base + h - 0.3, z + d / 2 + 0.2, w + 0.5, 0.6, 0.8, '#d5c29c', 0.14);
  for (let row = 0; row < Math.min(6, Math.floor(h / 1.4)); row++)
    for (let col = 0; col < Math.floor(w / 2); col++)
      k.box(
        g,
        x - w / 2 + 1.1 + col * 2,
        base + h - 1 - row * 1.4,
        z + d / 2 + 0.04,
        1.82,
        1.27,
        0.3,
        stones[(row + col) % 5]!,
        0.11,
      );
  for (let i = 0; i < Math.floor(w / 3.4); i++) {
    const opening = new T.Shape();
    opening.moveTo(-0.45, 0);
    opening.lineTo(0.45, 0);
    opening.lineTo(0.45, 1.2);
    opening.absarc(0, 1.2, 0.45, 0, Math.PI, false);
    opening.lineTo(-0.45, 0);
    k.mesh(
      g,
      new T.ShapeGeometry(opening, 8),
      '#62533f',
      x - w / 2 + 2 + i * 3.4,
      base + h - 4.4,
      z + d / 2 + 0.28,
    );
  }
  if (!roof) {
    for (let i = 0; i < Math.ceil(w / 2.3); i++) {
      for (const side of [-1, 1])
        k.box(
          g,
          x - w / 2 + 0.6 + i * 2.3,
          base + h + 0.8,
          z + (side * d) / 2,
          1.35,
          1.7,
          1.1,
          '#d5c29c',
          0.12,
        );
    }
    k.banner(g, x, base + h - 2.5, z + d / 2 + 0.5, 3, 8, false);
    return;
  }
  const geometry = new T.ConeGeometry(1, 3.5, 4);
  const cover = k.mesh(g, geometry, '#a06a45', x, base + h + 1.4, z);
  cover.rotation.y = Math.PI / 4;
  cover.scale.set((w + 1.8) * 0.72, 1, (d + 1.8) * 0.72);
  k.box(g, x, base + h, z + d / 2 + 0.6, w + 1.7, 0.35, 0.5, '#8b663f', 0.1);
}
