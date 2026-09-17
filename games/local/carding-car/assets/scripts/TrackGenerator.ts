import { clamp } from './KartConfig.ts';
export type TrackPoint = { x: number; z: number; y: number; s: number };
const controls = [
  [0, -145],
  [110, -145],
  [160, -105],
  [150, -50],
  [100, -15],
  [132, 25],
  [160, 70],
  [135, 125],
  [85, 142],
  [45, 115],
  [45, 62],
  [12, 38],
  [-22, 63],
  [-22, 125],
  [-65, 145],
  [-125, 125],
  [-145, 60],
  [-100, 12],
  [-130, -35],
  [-150, -95],
  [-100, -145],
];
const catmull = (a: number, b: number, c: number, d: number, t: number) =>
  0.5 *
  (2 * b +
    (-a + c) * t +
    (2 * a - 5 * b + 4 * c - d) * t * t +
    (-a + 3 * b - 3 * c + d) * t * t * t);

export function createTrack() {
  const main: TrackPoint[] = [];
  const n = controls.length;
  for (let i = 0; i <= n * 20; i++) {
    const segment = Math.floor(i / 20) % n,
      t = (i % 20) / 20;
    const p = [-1, 0, 1, 2].map((j) => controls[(segment + j + n) % n]);
    const x = catmull(p[0][0], p[1][0], p[2][0], p[3][0], t);
    const z = catmull(p[0][1], p[1][1], p[2][1], p[3][1], t);
    const previous = main[main.length - 1];
    const ramp = i / 20;
    const y = ramp > 15.9 && ramp < 16.8 ? 3.3 * Math.sin(((ramp - 15.9) / 0.9) * Math.PI) ** 2 : 0;
    main.push({
      x,
      z,
      y,
      s: previous ? previous.s + Math.hypot(x - previous.x, z - previous.z) : 0,
    });
  }
  const start = main[8 * 20],
    end = main[14 * 20];
  const shortcut: TrackPoint[] = [];
  let shortcutLength = 0;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const x = start.x + (end.x - start.x) * t,
      z = start.z + (end.z - start.z) * t + Math.sin(t * Math.PI) * 3;
    if (i) shortcutLength += Math.hypot(x - shortcut[i - 1].x, z - shortcut[i - 1].z);
    shortcut.push({ x, z, y: 0, s: start.s + (end.s - start.s) * t });
  }
  return {
    main,
    shortcut,
    checkpoints: [2, 4, 6, 8, 14, 16, 18, 20].map((i) => main[i * 20].s),
    length: main[main.length - 1].s,
    width: 14,
    shortcutWidth: 5.4,
    shortcutStart: start.s,
    shortcutEnd: end.s,
    shortcutLength,
  };
}
export type TrackData = ReturnType<typeof createTrack>;
export const wrapDistance = (s: number, length: number) => ((s % length) + length) % length;

export function pointAt(track: TrackData, distance: number, shortcut = false) {
  const s = wrapDistance(distance, track.length);
  const points =
    shortcut && s >= track.shortcutStart && s <= track.shortcutEnd ? track.shortcut : track.main;
  let i = 1;
  while (i < points.length - 1 && points[i].s < s) i++;
  const a = points[i - 1],
    b = points[i],
    t = clamp((s - a.s) / (b.s - a.s), 0, 1);
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    y: a.y + (b.y - a.y) * t,
    heading: Math.atan2(b.x - a.x, b.z - a.z),
  };
}

export function projectOnTrack(track: TrackData, x: number, z: number, previousS?: number) {
  let best = {
    distance: Infinity,
    s: 0,
    x: 0,
    z: 0,
    y: 0,
    heading: 0,
    lateral: 0,
    width: track.width,
    branch: 'main',
  };
  // ponytail: ~460 segments for four karts; add a spatial index only if profiling requires it.
  for (const [points, branch, width] of [
    [track.main, 'main', track.width],
    [track.shortcut, 'shortcut', track.shortcutWidth],
  ] as const) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        dx = b.x - a.x,
        dz = b.z - a.z;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
      const px = a.x + dx * t,
        pz = a.z + dz * t,
        dist = Math.hypot(x - px, z - pz);
      const s = a.s + (b.s - a.s) * t;
      if (
        previousS !== undefined &&
        Math.abs(wrapDistance(s - previousS + track.length / 2, track.length) - track.length / 2) >
          12
      )
        continue;
      if (dist < best.distance)
        best = {
          distance: dist,
          s,
          x: px,
          z: pz,
          y: a.y + (b.y - a.y) * t,
          heading: Math.atan2(dx, dz),
          lateral: ((x - px) * dz - (z - pz) * dx) / Math.hypot(dx, dz),
          width,
          branch,
        };
    }
  }
  return best;
}
