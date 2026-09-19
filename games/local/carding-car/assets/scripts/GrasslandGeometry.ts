import type { ThemeScenery } from './ThemeDefinition.ts';

type Point = [number, number, number];
type Mesh = NonNullable<ThemeScenery['meshes']>[number];

/** Small reusable, shaded art meshes. Coordinates are metres with the base at ground level. */
export function grasslandSurface(color: string, rings: Point[], sides = 16): Mesh {
  const mesh: Mesh = { color, geometry: { positions: [], normals: [], indices: [] } };
  const point = (ring: Point, i: number): Point => {
    const angle = (i * Math.PI * 2) / sides;
    return [Math.cos(angle) * ring[0], ring[1], Math.sin(angle) * ring[2]];
  };
  for (let j = 1; j < rings.length; j++)
    for (let i = 0; i < sides; i++) {
      const a = point(rings[j - 1], i),
        b = point(rings[j], i),
        c = point(rings[j], i + 1),
        d = point(rings[j - 1], i + 1);
      grasslandTriangle(mesh, a, b, c);
      grasslandTriangle(mesh, a, c, d);
    }
  return mesh;
}

export function grasslandTriangle(mesh: Mesh, a: Point, b: Point, c: Point) {
  const ux = b[0] - a[0],
    uy = b[1] - a[1],
    uz = b[2] - a[2],
    vx = c[0] - a[0],
    vy = c[1] - a[1],
    vz = c[2] - a[2];
  const nx = uy * vz - uz * vy,
    ny = uz * vx - ux * vz,
    nz = ux * vy - uy * vx,
    length = Math.hypot(nx, ny, nz);
  if (length < 1e-9) return;
  const start = mesh.geometry.positions.length / 3;
  for (const p of [a, b, c]) {
    mesh.geometry.positions.push(...p);
    mesh.geometry.normals.push(nx / length, ny / length, nz / length);
  }
  mesh.geometry.indices.push(start, start + 1, start + 2);
}

export function placeGrasslandMesh(source: Mesh, x: number, y: number, z: number, yaw = 0): Mesh {
  const { positions, normals, indices } = source.geometry,
    c = Math.cos(yaw),
    s = Math.sin(yaw);
  const target: Mesh = { color: source.color, geometry: { positions: [], normals: [], indices } };
  for (let i = 0; i < positions.length; i += 3) {
    target.geometry.positions.push(
      x + positions[i] * c + positions[i + 2] * s,
      y + positions[i + 1],
      z + positions[i + 2] * c - positions[i] * s,
    );
    target.geometry.normals.push(
      normals[i] * c + normals[i + 2] * s,
      normals[i + 1],
      normals[i + 2] * c - normals[i] * s,
    );
  }
  return target;
}

/** A faceted canvas roof and cloth walls; no baked road or diorama base. */
export const grasslandTent = [
  grasslandSurface('#f0e7ca', [
    [3.7, 0, 3.7],
    [3.7, 2.3, 3.7],
  ]),
  grasslandSurface('#fff6da', [
    [4.2, 2.25, 4.2],
    [3.3, 3.05, 3.3],
    [0.18, 5.5, 0.18],
  ]),
  grasslandSurface('#c25e44', [
    [3.72, 0.3, 3.72],
    [3.72, 0.62, 3.72],
  ]),
  grasslandSurface('#d8c99e', [
    [4.22, 2.2, 4.22],
    [4.22, 2.38, 4.22],
  ]),
];

export const grasslandHill = (rx: number, rz: number, height: number, color: string) =>
  grasslandSurface(
    color,
    [
      [rx, 0, rz],
      [rx * 0.87, height * 0.3, rz * 0.87],
      [rx * 0.57, height * 0.75, rz * 0.57],
      [rx * 0.25, height * 0.95, rz * 0.25],
      [0, height, 0],
    ],
    24,
  );
