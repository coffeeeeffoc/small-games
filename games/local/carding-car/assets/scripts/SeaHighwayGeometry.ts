import { pointAt, type TrackData, type TrackPoint } from './TrackGenerator.ts';
import { besideRoad, sceneryFits } from './ThemeScenery.ts';

type Point = [number, number, number];
type Mesh = { positions: number[]; normals: number[]; indices: number[] };
const mesh = (): Mesh => ({ positions: [], normals: [], indices: [] });

function quad(g: Mesh, a: Point, b: Point, c: Point, d: Point) {
  const u = b.map((v, i) => v - a[i]),
    v = c.map((v, i) => v - a[i]);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(...n) || 1,
    start = g.positions.length / 3;
  for (const p of [a, b, c, d]) {
    g.positions.push(...p);
    g.normals.push(...n.map((v) => v / length));
  }
  g.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

/** Test the entire volume, not only the endpoints; a cable may cut across another bend. */
function beam(track: TrackData, g: Mesh, a: Point, b: Point, radius: number, topRadius = radius) {
  const delta = b.map((v, i) => v - a[i]),
    length = Math.hypot(...delta);
  if (length < 0.01) return;
  const axis = delta.map((v) => v / length),
    horizontal = Math.hypot(axis[0], axis[2]);
  const u = horizontal < 0.001 ? [1, 0, 0] : [axis[2] / horizontal, 0, -axis[0] / horizontal];
  const v = [axis[1] * u[2], axis[2] * u[0] - axis[0] * u[2], -axis[1] * u[0]];
  const steps = Math.ceil(length / 1.5),
    r = Math.max(radius, topRadius);
  const bound =
    r * Math.hypot(Math.abs(u[0]) + Math.abs(v[0]), Math.abs(u[2]) + Math.abs(v[2])) +
    Math.hypot(delta[0], delta[2]) / steps / 2;
  const halfHeight = r * (Math.abs(u[1]) + Math.abs(v[1])) + Math.abs(delta[1]) / steps / 2;
  for (let i = 0; i < steps; i++) {
    const p = a.map((v, j) => v + (delta[j] * (i + 0.5)) / steps);
    if (!sceneryFits(track, p[0], p[1], p[2], bound, halfHeight)) return;
  }
  const ring = (p: Point, r: number): Point[] =>
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([s, t]) => p.map((value, i) => value + r * (u[i] * s + v[i] * t)) as Point);
  const bottom = ring(a, radius),
    top = ring(b, topRadius);
  for (let i = 0; i < 4; i++) quad(g, bottom[i], bottom[(i + 1) % 4], top[(i + 1) % 4], top[i]);
  quad(g, ...([...bottom].reverse() as [Point, Point, Point, Point]));
  quad(g, ...(top as [Point, Point, Point, Point]));
}

/** Same smoothed lateral frame as Track.ribbon, so the bridge follows every road vertex. */
function deck(
  g: Mesh,
  points: TrackPoint[],
  width: number,
  other: TrackPoint[],
  otherWidth: number,
) {
  if (points.length < 2) return;
  const closed = points[0].x === points.at(-1)!.x && points[0].z === points.at(-1)!.z;
  const rings = points.map((p, i) => {
    const a = points[i === 0 && closed ? points.length - 2 : Math.max(0, i - 1)];
    const b = points[i === points.length - 1 && closed ? 1 : Math.min(points.length - 1, i + 1)];
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    let top = p.y - 0.18;
    // At sloping forks, one branch's concrete must stay below BOTH asphalt surfaces.
    // Include adjacent span lengths so their interiors cannot rise through the other branch.
    const reach =
      width / 2 +
      1.8 +
      Math.max(Math.hypot(p.x - a.x, p.z - a.z), Math.hypot(p.x - b.x, p.z - b.z));
    for (let j = 1; j < other.length; j++) {
      const c = other[j - 1],
        d = other[j],
        dx = d.x - c.x,
        dz = d.z - c.z;
      const t = Math.max(
        0,
        Math.min(1, ((p.x - c.x) * dx + (p.z - c.z) * dz) / (dx * dx + dz * dz || 1)),
      );
      if (Math.hypot(p.x - c.x - dx * t, p.z - c.z - dz * t) < reach + otherWidth / 2 + 1)
        top = Math.min(top, Math.min(c.y, d.y) - 0.2);
    }
    return [
      [-1, 0],
      [1, 0],
      [1, -1.12],
      [-1, -1.12],
    ].map(
      ([side, y]) =>
        [
          p.x + Math.cos(heading) * side * (width / 2 + 1.8),
          top + y,
          p.z - Math.sin(heading) * side * (width / 2 + 1.8),
        ] as Point,
    );
  });
  for (let i = 1; i < rings.length; i++)
    for (let j = 0; j < 4; j++)
      quad(g, rings[i - 1][j], rings[i][j], rings[i][(j + 1) % 4], rings[i - 1][(j + 1) % 4]);
}

export function seaBridge(track: TrackData) {
  const decks = mesh(),
    piers = mesh(),
    towers = mesh(),
    cables = mesh();
  const water = Math.min(...track.main.map((p) => p.y), ...track.shortcut.map((p) => p.y)) - 6;
  for (const [points, width, shortcut] of [
    [track.main, track.width, false],
    [track.shortcut, track.shortcutWidth, true],
  ] as const) {
    if (points.length < 2) continue;
    deck(
      decks,
      points,
      width,
      shortcut ? track.main : track.shortcut,
      shortcut ? track.width : track.shortcutWidth,
    );
    const start = shortcut ? track.shortcutStart : 0;
    const length = shortcut ? track.shortcutLength : track.length;
    const ratio = shortcut ? (track.shortcutEnd - start) / length : 1;
    for (let distance = 18; distance < length - 8; distance += 44) {
      const p = pointAt(track, start + distance * ratio, shortcut);
      beam(track, piers, [p.x, water - 0.2, p.z], [p.x, p.y - 1.35, p.z], 1.65);
    }
    // A first tower is visible from the grid; every branch owns its own distance range.
    for (let distance = Math.min(56, length / 2); distance < length - 15; distance += 205) {
      const s = start + distance * ratio,
        center = pointAt(track, s, shortcut);
      const tops: Point[] = [];
      for (const side of [-1, 1]) {
        const base = besideRoad(track, s, side * (width / 2 + 5), shortcut);
        const top = besideRoad(track, s, side * (width / 2 + 2.6), shortcut);
        tops.push([top.x, center.y + 27, top.z]);
        beam(track, towers, [base.x, center.y - 1.1, base.z], tops.at(-1)!, 1.35, 0.78);
        beam(track, piers, [base.x, water - 0.2, base.z], [base.x, center.y - 1.4, base.z], 2.1);
        for (const direction of [-1, 1])
          for (const reach of [10, 18, 26, 34, 42, 50]) {
            if (
              shortcut &&
              (distance + direction * reach < 4 || distance + direction * reach > length - 4)
            )
              continue;
            const anchor = besideRoad(
              track,
              s + direction * reach * ratio,
              side * (width / 2 + 2.7),
              shortcut,
            );
            beam(
              track,
              cables,
              [anchor.x, anchor.y + 0.7, anchor.z],
              [top.x, center.y + 23.5, top.z],
              0.09,
            );
          }
      }
      beam(
        track,
        towers,
        [tops[0][0], center.y + 20, tops[0][2]],
        [tops[1][0], center.y + 20, tops[1][2]],
        0.9,
      );
    }
  }
  return { decks, piers, towers, cables, water };
}
