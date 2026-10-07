import * as T from 'three';
import type { MeshKit } from './scene-mesh.js';
import { riverCenter, riverSurface } from './scene-valley.js';

/** The stream is actual winding geometry, at the same lower level carved into its rock banks. */
export function canyonRiver(k: MeshKit, parent: T.Group) {
  for (const [front, back, waterY] of [
    [55, -42, -5.6],
    [-42, -180, -1.2],
  ]) {
    const positions: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    const rows = 150,
      columns = 10;
    for (let row = 0; row <= rows; row++) {
      const z = front! + ((back! - front!) * row) / rows,
        center = riverCenter(z);
      for (let col = 0; col <= columns; col++) {
        const t = col / columns,
          x = center + (t - 0.5) * (12.1 + Math.sin(z * 0.17) * 0.45),
          color = new T.Color('#528f9a').lerp(new T.Color('#a1bec0'), Math.abs(t - 0.5) * 0.55);
        const wave = Math.sin(z * 4.1 + x * 2.3) * 0.025 + Math.sin(z * 7.1 - x * 4.2) * 0.012;
        positions.push(x, waterY! + wave, z);
        colors.push(color.r, color.g, color.b);
        if (row < rows && col < columns) {
          const a = row * (columns + 1) + col;
          indices.push(a, a + 1, a + columns + 1, a + 1, a + columns + 2, a + columns + 1);
        }
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const water = new T.Mesh(
      geometry,
      new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.24, metalness: 0.25 }),
    );
    water.receiveShadow = true;
    parent.add(water);
  }
  // Narrow, curved foam veins follow the current rather than straight bars across a rectangular river.
  for (let vein = 0; vein < 5; vein++) {
    const positions: number[] = [],
      indices: number[] = [];
    for (let row = 0; row <= 160; row++) {
      const z = 52 - row * 1.4,
        x = riverCenter(z) + Math.sin(z * 0.18 + vein) * 1.3 + (vein - 2) * 2.1;
      for (const side of [-1, 1])
        positions.push(
          x + side * Math.max(0.002, Math.sin(row * 0.21 + vein) * 0.05),
          riverSurface(z) + 0.05,
          z,
        );
      if (row < 160) {
        const a = row * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute(
      'uv',
      new T.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    parent.add(new T.Mesh(geometry, k.material('#c5dce0')));
  }
  waterfall(parent, riverCenter(-42));
}

function waterfall(parent: T.Group, center: number) {
  const geometry = new T.PlaneGeometry(12.1, 4.7, 48, 32),
    positions = geometry.getAttribute('position'),
    colors: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      stream = Math.sin(x * 6.4 + Math.sin(y * 2.1) * 0.5) * 0.5 + 0.5,
      churn = Math.max(0, -y / 2.35),
      color = new T.Color('#83b4bf').lerp(new T.Color('#e9eeea'), stream * 0.52 + churn * 0.38);
    positions.setXYZ(
      i,
      x * (0.96 + Math.sin(y * 3.2) * 0.025),
      y + Math.sin(x * 7.3) * 0.055,
      Math.sin(x * 1.9 + y * 2.1) * 0.08 + churn * churn * 0.38,
    );
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const sheet = new T.Mesh(
    geometry,
    new T.MeshStandardMaterial({
      vertexColors: true,
      side: T.DoubleSide,
      roughness: 0.25,
      metalness: 0.12,
    }),
  );
  sheet.position.set(center, -3.45, -41.86);
  parent.add(sheet);
}
