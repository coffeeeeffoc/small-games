import type { TrackPoint } from './TrackGenerator.ts';

export type Barrier = {
  x: number;
  z: number;
  y: number;
  heading: number;
  inwardX: number;
  inwardZ: number;
  halfWidth: number;
  halfLength: number;
  branch: 'main' | 'shortcut';
};

export function roadDistance(points: TrackPoint[], x: number, z: number) {
  let distance = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      dx = b.x - a.x,
      dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    distance = Math.min(distance, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
  }
  return distance;
}

/** Primitive boxes shared by rendering and collision, independent of visual meshes. */
export function createBarriers(
  main: TrackPoint[],
  shortcut: TrackPoint[],
  width: number,
  shortcutWidth: number,
): Barrier[] {
  const barriers: Barrier[] = [];
  for (const [points, w, branch, other, otherWidth] of [
    [main, width, 'main', shortcut, shortcutWidth],
    [shortcut, shortcutWidth, 'shortcut', main, width],
  ] as const) {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i],
        b = points[i + 1];
      const heading = Math.atan2(b.x - a.x, b.z - a.z);
      for (const side of [-1, 1]) {
        const barrier: Barrier = {
          x: (a.x + b.x) / 2 + Math.cos(heading) * side * (w / 2 + 1.4),
          z: (a.z + b.z) / 2 - Math.sin(heading) * side * (w / 2 + 1.4),
          y: (a.y + b.y) / 2,
          heading,
          inwardX: -Math.cos(heading) * side,
          inwardZ: Math.sin(heading) * side,
          halfWidth: 0.275,
          halfLength: Math.hypot(b.x - a.x, b.z - a.z) / 2 + 0.12,
          branch,
        };
        // Remove only the walls inside the other road's drivable junction, on either branch.
        let blocksJunction = false;
        for (const along of [-1, -0.5, 0, 0.5, 1])
          for (const edge of [-1, 1]) {
            const x =
              barrier.x +
              Math.sin(heading) * along * barrier.halfLength +
              Math.cos(heading) * edge * barrier.halfWidth;
            const z =
              barrier.z +
              Math.cos(heading) * along * barrier.halfLength -
              Math.sin(heading) * edge * barrier.halfWidth;
            if (roadDistance(other, x, z) < otherWidth / 2 + 1.6) blocksJunction = true;
          }
        if (!blocksJunction) barriers.push(barrier);
      }
    }
  }
  return barriers;
}
