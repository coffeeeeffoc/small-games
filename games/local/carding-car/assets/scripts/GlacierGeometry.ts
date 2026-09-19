import { pointAt, type TrackData } from './TrackGenerator.ts';
import { sceneryFits } from './ThemeScenery.ts';

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

/** A barrel vault with a route-sized opening and 12m depth. */
export function glacierArch(snow = false, opening = 13) {
  const g = mesh(),
    steps = 32,
    depth = 6;
  const point = (i: number, outer: boolean, z: number): Point => {
    const angle = (i * Math.PI) / steps;
    const ripple = Math.sin(i * 2.1 + z) * 0.28;
    const radius = outer
      ? opening + 6 + ripple + (snow ? 1.25 : 0)
      : snow
        ? opening + 6 + ripple
        : opening + Math.sin(i * 1.7) * 0.2;
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

/** Conservative bounds contain whole triangles, not just vertices at an arch's feet. */
export function glacierArchFits(track: TrackData, distance: number, opening: number) {
  const p = pointAt(track, distance), c = Math.cos(p.heading), s = Math.sin(p.heading);
  for (const snow of [false, true]) {
    const g = glacierArch(snow, opening);
    for (let i = 0; i < g.indices.length; i += 3) {
      const vertices = g.indices.slice(i, i + 3).map((index) => {
        const [x, y, z] = g.positions.slice(index * 3, index * 3 + 3);
        return [p.x + x * c + z * s, p.y + y, p.z + z * c - x * s];
      });
      const x = vertices.reduce((sum, v) => sum + v[0], 0) / 3,
        z = vertices.reduce((sum, v) => sum + v[2], 0) / 3,
        lo = Math.min(...vertices.map(v => v[1])), hi = Math.max(...vertices.map(v => v[1])),
        radius = Math.max(...vertices.map(v => Math.hypot(v[0] - x, v[2] - z)));
      if (!sceneryFits(track, x, (lo + hi) / 2, z, radius, (hi - lo) / 2)) return false;
    }
  }
  return true;
}

export function glacierArches(track: TrackData) {
  return glacierArchDistances(track.length).flatMap(preferred => {
    // Tight bends or another branch can pass through the feet: move the complete portal.
    for (let step = 0; step < 12; step++) {
      const distance = preferred + (step % 2 ? -1 : 1) * Math.ceil(step / 2) * 18;
      for (const extra of [5, 8, 11]) {
        const opening = track.width / 2 + extra;
        if (glacierArchFits(track, distance, opening))
          return [{ ...pointAt(track, distance), distance, opening }];
      }
    }
    return [];
  });
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
  const ridge = (i: number): Point => [
    Math.cos(i * Math.PI * 2 / sides) * 0.18,
    0.83 + 0.17 * Math.sin((i % sides) * 2.1 + seed) ** 2,
    Math.sin(i * Math.PI * 2 / sides) * 0.18,
  ];
  for (let i = 0; i < sides; i++) {
    if (snow) {
      quad(g, point(i, true), ridge(i), ridge(i + 1), point(i + 1, true));
      triangle(g, ridge(i), [0.04, 1.06, -0.03], ridge(i + 1));
    }
    else quad(g, point(i, false), point(i, true), point(i + 1, true), point(i + 1, false));
  }
  return g;
}
