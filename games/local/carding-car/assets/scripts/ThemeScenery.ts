import { clamp } from './KartConfig.ts';
import { pointAt, type TrackData } from './TrackGenerator.ts';

/** Offset is measured from the centre line; height follows the selected route. */
export function besideRoad(track: TrackData, distance: number, offset: number, shortcut = false) {
  const p = pointAt(track, distance, shortcut);
  return { ...p, x: p.x + Math.cos(p.heading) * offset, z: p.z - Math.sin(p.heading) * offset };
}

/** Check every branch, including a nearby main road whose width differs from the shortcut. */
export function roadClearance(track: TrackData, x: number, z: number) {
  let clearance = Infinity;
  for (const [points, width] of [[track.main, track.width], [track.shortcut, track.shortcutWidth]] as const) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], dx = b.x - a.x, dz = b.z - a.z;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      clearance = Math.min(clearance, Math.hypot(x - a.x - dx * t, z - a.z - dz * t) - width / 2);
    }
  }
  return clearance;
}

/** Conservative circular footprint. Test before placing a whole landmark, not its individual parts. */
export function clearOfRoad(track: TrackData, x: number, z: number, radius: number, margin = 2) {
  return roadClearance(track, x, z) >= radius + margin;
}

/** Ground/bridge supports are allowed below the road, roofs above the driving envelope. */
export function sceneryFits(track: TrackData, x: number, y: number, z: number, radius: number, halfHeight: number) {
  for (const [points, width] of [[track.main, track.width], [track.shortcut, track.shortcutWidth]] as const) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], dx = b.x - a.x, dz = b.z - a.z;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      if (Math.hypot(x - a.x - dx * t, z - a.z - dz * t) > width / 2 + radius + 1) continue;
      // Include the full segment elevation span so the same footprint is safe on slopes.
      if (y + halfHeight < Math.min(a.y, b.y) - 0.05 || y - halfHeight > Math.max(a.y, b.y) + 6) continue;
      return false;
    }
  }
  return true;
}
