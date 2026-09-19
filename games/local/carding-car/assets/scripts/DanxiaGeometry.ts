import type { ThemeScenery } from './ThemeDefinition.ts';

type Point = [number, number, number];
type Mesh = NonNullable<ThemeScenery['meshes']>[number];

// Natural sandstone strata, bottom to top. No road, base slab or collision geometry.
export const danxiaStrata = [
  '#b95f3c',
  '#d98548',
  '#e2b867',
  '#d9ce9e',
  '#8e9b81',
  '#d5ba79',
  '#d77645',
  '#b95937',
];

/** Rounded, solid ridge: closed contour rings prevent strata collapsing into knife-like ends. */
export function danxiaRidge(
  x: number,
  y: number,
  z: number,
  length: number,
  width: number,
  height: number,
  yaw: number,
  seed: number,
): Mesh[] {
  // Unequal sediment thickness, with one extra ring rounding off the upper red cap.
  const levels = [0, 0.16, 0.29, 0.4, 0.46, 0.57, 0.72, 0.86, 0.96, 0.99, 1];
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  const point = (i: number, layer: number, lobe: number, segments: number): Point => {
    const angle = ((i % segments) * Math.PI * 2) / segments;
    const t =
      levels[layer] + 0.018 * Math.sin(layer * 1.9 + seed) * Math.sin(levels[layer] * Math.PI);
    // A cosine hillside has a broad, gentle foot and a rounded summit instead of a vertical skirt.
    const dome =
      (0.45 * Math.acos(2 * t - 1)) / Math.PI + 0.55 * Math.cos((t * Math.PI) / 2) ** 0.7;
    const erosion = 0.91 + 0.045 * Math.sin(angle * 3 + seed) + 0.03 * Math.cos(angle * 5 - seed);
    const lx =
      length *
      ((lobe ? 0.26 : -0.1) +
        Math.cos(angle) * dome * erosion * (lobe ? 0.23 : 0.39) +
        (1 - dome) * 0.012 * Math.sin(seed));
    const lz =
      width *
      (Math.sin(angle) * dome * erosion * (lobe ? 0.38 : 0.47) +
        (1 - dome) * 0.018 * Math.cos(seed));
    const strataTilt =
      Math.sin(t * Math.PI) *
      (0.05 * Math.cos(angle + seed) + 0.035 * Math.sin(angle * 3 - seed + t * 4));
    const rise = lobe ? 0.57 + 0.12 * Math.sin(seed * 1.3) : 1;
    return [x + lx * c + lz * s, y + height * rise * (t * 0.9 + strataTilt), z + lz * c - lx * s];
  };
  const result: Mesh[] = danxiaStrata.map((color) => ({
    color,
    geometry: { positions: [], normals: [], indices: [] },
  }));
  const triangle = (part: Mesh, a: Point, b: Point, d: Point) => {
    const u = b.map((v, i) => v - a[i]),
      v = d.map((n, i) => n - a[i]);
    const normal = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    const magnitude = Math.hypot(...normal);
    if (magnitude < 1e-8) return;
    const g = part.geometry,
      first = g.positions.length / 3;
    for (const p of [a, b, d]) {
      g.positions.push(...p);
      g.normals.push(...normal.map((n) => n / magnitude));
    }
    g.indices.push(first, first + 1, first + 2);
  };
  for (const [lobe, segments] of [
    [0, 16],
    [1, 8],
  ])
    for (let layer = 0; layer < levels.length - 1; layer++) {
      const part = result[Math.min(layer, result.length - 1)];
      for (let i = 0; i < segments; i++) {
        const a = point(i, layer, lobe, segments),
          b = point(i + 1, layer, lobe, segments);
        const d = point(i, layer + 1, lobe, segments),
          e = point(i + 1, layer + 1, lobe, segments);
        triangle(part, a, d, e);
        triangle(part, a, e, b);
        if (layer === 0) {
          const offset = length * (lobe ? 0.26 : -0.1);
          triangle(part, [x + offset * c, y, z - offset * s], a, b);
        }
      }
    }
  // Smooth only the exposed rock faces across layer boundaries; keep the underside flat.
  const normals = new Map<string, number[]>();
  const key = (p: number[], i: number) =>
    p
      .slice(i, i + 3)
      .map((v) => v.toFixed(6))
      .join(',');
  for (const { geometry: g } of result)
    for (let i = 0; i < g.positions.length; i += 3) {
      if (g.normals[i + 1] < -0.5) continue;
      const k = key(g.positions, i),
        total = normals.get(k) ?? [0, 0, 0];
      for (let j = 0; j < 3; j++) total[j] += g.normals[i + j];
      normals.set(k, total);
    }
  for (const { geometry: g } of result)
    for (let i = 0; i < g.positions.length; i += 3) {
      if (g.normals[i + 1] < -0.5) continue;
      const total = normals.get(key(g.positions, i))!,
        size = Math.hypot(...total);
      for (let j = 0; j < 3; j++) g.normals[i + j] = total[j] / size;
    }
  return result;
}
