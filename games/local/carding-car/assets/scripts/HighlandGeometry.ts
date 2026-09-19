import type { ThemeScenery } from './ThemeDefinition.ts';
import type { TrackData } from './TrackGenerator.ts';

type Point = [number, number, number];
type Mesh = NonNullable<ThemeScenery['meshes']>[number];
const mesh = (color: string): Mesh => ({
  color,
  geometry: { positions: [], normals: [], indices: [] },
});

function quad(target: Mesh, ...points: [Point, Point, Point, Point]) {
  const g = target.geometry,
    offset = g.positions.length / 3;
  const [a, b, c] = points,
    u = b.map((v, i) => v - a[i]),
    v = c.map((v, i) => v - a[i]);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(...n) || 1;
  for (const point of points) {
    g.positions.push(...point);
    g.normals.push(...n.map((v) => v / length));
  }
  // Foundations are seen from both the road and the valley.
  g.indices.push(...[0, 1, 2, 0, 2, 3, 2, 1, 0, 3, 2, 0].map((i) => i + offset));
}

function segmentDistance(a: Point, b: Point, c: Point, d: Point) {
  const cross = (p: Point, q: Point, r: Point) =>
    (q[0] - p[0]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[0] - p[0]);
  const ab = cross(a, b, c) * cross(a, b, d),
    cd = cross(c, d, a) * cross(c, d, b);
  if (
    ab <= 0 &&
    cd <= 0 &&
    Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <=
      Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) &&
    Math.max(Math.min(a[2], b[2]), Math.min(c[2], d[2])) <=
      Math.min(Math.max(a[2], b[2]), Math.max(c[2], d[2]))
  )
    return 0;
  const distance = (p: Point, q: Point, r: Point) => {
    const dx = r[0] - q[0],
      dz = r[2] - q[2];
    const t = Math.max(
      0,
      Math.min(1, ((p[0] - q[0]) * dx + (p[2] - q[2]) * dz) / (dx * dx + dz * dz || 1)),
    );
    return Math.hypot(p[0] - q[0] - dx * t, p[2] - q[2] - dz * t);
  };
  return Math.min(distance(a, c, d), distance(b, c, d), distance(c, a, b), distance(d, a, b));
}

/** Exact horizontal footprint test: no retaining wall can close a main/shortcut junction. */
function footprintFits(track: TrackData, corners: Point[]) {
  const minX = Math.min(...corners.map((p) => p[0])),
    maxX = Math.max(...corners.map((p) => p[0]));
  const minZ = Math.min(...corners.map((p) => p[2])),
    maxZ = Math.max(...corners.map((p) => p[2]));
  const inside = (p: Point) => {
    const signs = corners.map((a, i) => {
      const b = corners[(i + 1) % corners.length];
      return (b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0]);
    });
    return signs.every((v) => v >= 0) || signs.every((v) => v <= 0);
  };
  for (const [points, width] of [
    [track.main, track.width],
    [track.shortcut, track.shortcutWidth],
  ] as const) {
    const radius = width / 2 + 0.3;
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1],
        q = points[i];
      if (
        Math.max(p.x, q.x) + radius < minX ||
        Math.min(p.x, q.x) - radius > maxX ||
        Math.max(p.z, q.z) + radius < minZ ||
        Math.min(p.z, q.z) - radius > maxZ
      )
        continue;
      const a: Point = [p.x, p.y, p.z],
        b: Point = [q.x, q.y, q.z];
      if (inside(a) || inside(b)) return false;
      for (let j = 0; j < corners.length; j++)
        if (segmentDistance(a, b, corners[j], corners[(j + 1) % corners.length]) < radius)
          return false;
    }
  }
  return true;
}

/** Continuous route-shaped shoulders, masonry and granite foundations, never the drivable road. */
export function highlandRoadbed(track: TrackData): NonNullable<ThemeScenery['meshes']> {
  const ledge = mesh('#b8ac94'),
    granite = mesh('#80796b'),
    mortar = mesh('#65645d');
  const courses = ['#a79f8d', '#b4aa94', '#958e7d'].map(mesh);
  const lerp = (a: Point, b: Point, t: number): Point =>
    a.map((v, i) => v + (b[i] - v) * t) as Point;
  for (const [points, width] of [
    [track.main, track.width],
    [track.shortcut, track.shortcutWidth],
  ] as const) {
    if (points.length < 2) continue;
    const closed =
      points[0].x === points[points.length - 1].x && points[0].z === points[points.length - 1].z;
    const offset = (i: number, lateral: number, down = 0): Point => {
      const a = points[i === 0 && closed ? points.length - 2 : Math.max(0, i - 1)];
      const b = points[i === points.length - 1 && closed ? 1 : Math.min(points.length - 1, i + 1)];
      const heading = Math.atan2(b.x - a.x, b.z - a.z),
        p = points[i];
      return [
        p.x + Math.cos(heading) * lateral,
        p.y - 0.13 - down,
        p.z - Math.sin(heading) * lateral,
      ];
    };
    for (let i = 1; i < points.length; i++)
      for (const side of [-1, 1]) {
        const innerA = offset(i - 1, side * (width / 2 + 1.45)),
          innerB = offset(i, side * (width / 2 + 1.45));
        const outerA = offset(i - 1, side * (width / 2 + 3.8)),
          outerB = offset(i, side * (width / 2 + 3.8));
        const footA = offset(i - 1, side * (width / 2 + 6)),
          footB = offset(i, side * (width / 2 + 6));
        footA[1] = Math.min(-1, outerA[1] - 2);
        footB[1] = Math.min(-1, outerB[1] - 2);
        if (!footprintFits(track, [innerA, innerB, footB, footA])) continue;
        quad(ledge, innerA, innerB, outerB, outerA);
        const lowA: Point = [outerA[0], Math.max(footA[1], outerA[1] - 2.7), outerA[2]];
        const lowB: Point = [outerB[0], Math.max(footB[1], outerB[1] - 2.7), outerB[2]];
        quad(mortar, outerA, outerB, lowB, lowA);
        quad(granite, lowA, lowB, footB, footA);
        // Stone courses follow the same slope; their top always stays below the asphalt.
        const span = Math.hypot(outerB[0] - outerA[0], outerB[2] - outerA[2]);
        const columns = Math.max(1, Math.ceil(span / 2.6));
        for (let row = 0; row < 3; row++)
          for (let column = 0; column < columns; column++) {
            const a = lerp(outerA, outerB, (column + 0.03) / columns),
              b = lerp(outerA, outerB, (column + 0.97) / columns);
            const lowerA = lerp(lowA, lowB, (column + 0.03) / columns),
              lowerB = lerp(lowA, lowB, (column + 0.97) / columns);
            // Lift stone faces away from the mortar backing to avoid coplanar flicker.
            const normalA = [outerA[0] - innerA[0], outerA[2] - innerA[2]],
              normalB = [outerB[0] - innerB[0], outerB[2] - innerB[2]];
            for (const p of [a, lowerA]) {
              p[0] += normalA[0] * 0.02;
              p[2] += normalA[1] * 0.02;
            }
            for (const p of [b, lowerB]) {
              p[0] += normalB[0] * 0.02;
              p[2] += normalB[1] * 0.02;
            }
            quad(
              courses[(i + row + column) % courses.length],
              lerp(a, lowerA, (row + 0.04) / 3),
              lerp(b, lowerB, (row + 0.04) / 3),
              lerp(b, lowerB, (row + 0.94) / 3),
              lerp(a, lowerA, (row + 0.94) / 3),
            );
          }
      }
  }
  return [ledge, granite, mortar, ...courses].filter((m) => m.geometry.indices.length);
}
