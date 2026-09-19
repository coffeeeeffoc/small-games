/** Glacier geometry stays outside the shared driving/collision envelope. Metres, Y up. */
export const glacierArchDistances = (length: number) => [72, length * 0.4, length * 0.74];
type Point = [number, number, number];
export type GlacierMesh = {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
};
const mesh = (): GlacierMesh => ({ positions: [], normals: [], uvs: [], indices: [] });

function triangle(g: GlacierMesh, a: Point, b: Point, c: Point) {
  const u = b.map((v, i) => v - a[i]),
    v = c.map((n, i) => n - a[i]);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(...n) || 1,
    start = g.positions.length / 3;
  for (const p of [a, b, c]) {
    g.positions.push(...p);
    g.normals.push(...n.map((value) => value / length));
    // Ice veins follow the wall vertically; top faces use horizontal projection.
    g.uvs.push(
      (Math.abs(n[0]) > Math.abs(n[2]) ? p[2] : p[0]) / 9,
      (Math.abs(n[1]) > length * 0.7 ? p[2] : p[1]) / 13,
    );
  }
  g.indices.push(start, start + 1, start + 2);
}
function quad(g: GlacierMesh, a: Point, b: Point, c: Point, d: Point) {
  triangle(g, a, b, c);
  triangle(g, a, c, d);
}

/** Faceted, tapered glacier columns; no box silhouettes or texture-stretched cubes. */
export function glacierRock(seed: number, radius = 1, height = 1) {
  const g = mesh(),
    sides = 13,
    levels = [0, 0.12, 0.43, 0.76, 1];
  const point = (ring: number, index: number): Point => {
    const angle = ((index % sides) * Math.PI * 2) / sides;
    const r =
      radius *
      (0.86 +
        0.09 * Math.sin(index * 2.3 + seed) +
        0.1 * Math.cos(index * 4.1 + ring * 1.7 + seed));
    return [
      Math.cos(angle) * r,
      levels[ring] * height * (1 + 0.045 * Math.sin(index * 1.8 + seed)),
      Math.sin(angle) * r,
    ];
  };
  for (let ring = 0; ring < levels.length - 1; ring++)
    for (let i = 0; i < sides; i++)
      quad(g, point(ring, i), point(ring + 1, i), point(ring + 1, i + 1), point(ring, i + 1));
  for (let i = 0; i < sides; i++) triangle(g, [0, height, 0], point(4, i + 1), point(4, i));
  return g;
}

/** A barrel-vault ice bridge: 26m opening, 17m crown clearance, 12m depth. */
export function glacierArch(snow = false) {
  const g = mesh(),
    steps = 32,
    depth = 6;
  const point = (i: number, outer: boolean, z: number): Point => {
    const angle = (i * Math.PI) / steps;
    const ripple = Math.sin(i * 2.1 + z) * 0.28;
    const radius = outer
      ? 19 + ripple + (snow ? 1.25 : 0)
      : snow
        ? 19 + ripple
        : 13 + Math.sin(i * 1.7) * 0.2;
    return [Math.cos(angle) * radius, 4 + Math.sin(angle) * radius, z];
  };
  for (let i = 0; i < steps; i++) {
    if (snow && (i < 3 || i > steps - 4)) continue;
    for (const z of [-depth, depth]) {
      const a = point(i, false, z),
        b = point(i + 1, false, z),
        c = point(i + 1, true, z),
        d = point(i, true, z);
      if (z < 0) quad(g, a, b, c, d);
      else quad(g, d, c, b, a);
    }
    quad(
      g,
      point(i, false, depth),
      point(i + 1, false, depth),
      point(i + 1, false, -depth),
      point(i, false, -depth),
    );
    quad(
      g,
      point(i, true, -depth),
      point(i + 1, true, -depth),
      point(i + 1, true, depth),
      point(i, true, depth),
    );
  }
  return g;
}

/** Jagged ridges with a snow line, shared by near and distant mountain groups. */
export function glacierMountain(seed: number, snow: boolean) {
  const g = mesh(),
    sides = 19;
  const point = (i: number, top: boolean): Point => {
    const angle = (i * Math.PI * 2) / sides,
      r = 1 + 0.17 * Math.sin(i * 3 + seed);
    const snowline = 0.35 + 0.2 * Math.sin(i * 2.2 + seed) ** 2;
    return top
      ? [Math.cos(angle) * r * 0.52, snowline, Math.sin(angle) * r * 0.52]
      : [Math.cos(angle) * r, 0, Math.sin(angle) * r];
  };
  for (let i = 0; i < sides; i++) {
    if (snow) triangle(g, point(i, true), [0.13, 1, -0.08], point(i + 1, true));
    else quad(g, point(i, false), point(i, true), point(i + 1, true), point(i + 1, false));
  }
  return g;
}
