import { AIRFRAME } from './Data.ts';
import { aircraftPoint } from './Flight.ts';

export type Position = { x: number; y: number; z: number };
type Height = (x: number, z: number) => number;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const radians = Math.PI / 180;

/** Interpolate the same two triangles used by the terrain mesh, including its coarse outer cells. */
export function heightfieldHeight(
  xs: readonly number[],
  zs: readonly number[],
  heights: readonly (readonly number[])[],
  x: number,
  z: number,
) {
  const cell = (axis: readonly number[], value: number) => {
    let lo = 0,
      hi = axis.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >>> 1;
      if (value < axis[mid]) hi = mid;
      else lo = mid;
    }
    return Math.min(axis.length - 2, lo);
  };
  const i = cell(xs, x),
    j = cell(zs, z);
  const u = clamp((x - xs[i]) / (xs[i + 1] - xs[i]), 0, 1);
  const v = clamp((z - zs[j]) / (zs[j + 1] - zs[j]), 0, 1);
  return u + v <= 1
    ? heights[i][j] +
        u * (heights[i + 1][j] - heights[i][j]) +
        v * (heights[i][j + 1] - heights[i][j])
    : heights[i + 1][j + 1] +
        (1 - u) * (heights[i][j + 1] - heights[i + 1][j + 1]) +
        (1 - v) * (heights[i + 1][j] - heights[i + 1][j + 1]);
}

export function terrainSlope(height: Height, x: number, z: number) {
  return {
    x: (height(x + 0.25, z) - height(x - 0.25, z)) / 0.5,
    z: (height(x, z + 0.25) - height(x, z - 0.25)) / 0.5,
  };
}

/** A rigid vehicle's up vector follows the local ground normal; yaw remains in world space. */
export function groundAxes(height: Height, x: number, z: number, yaw: number) {
  const slope = terrainSlope(height, x, z);
  const up = { x: -slope.x, y: 1, z: -slope.z };
  const n = Math.hypot(up.x, up.y, up.z);
  up.x /= n;
  up.y /= n;
  up.z /= n;
  const forward = {
    x: Math.sin(yaw),
    y: slope.x * Math.sin(yaw) + slope.z * Math.cos(yaw),
    z: Math.cos(yaw),
  };
  const length = Math.hypot(forward.x, forward.y, forward.z);
  forward.x /= length;
  forward.y /= length;
  forward.z /= length;
  const right = {
    x: up.y * forward.z - up.z * forward.y,
    y: up.z * forward.x - up.x * forward.z,
    z: up.x * forward.y - up.y * forward.x,
  };
  return { right, up, forward };
}

/** A fuselage-mounted camera, with a rollable sensor and a bounded downward viewing cone. */
export function aircraftCamera(
  aircraft: Position & { heading: number; yaw?: number; pitch?: number; bank?: number },
  center: { x: number; z: number },
  height: Height,
  zoom: number,
  aspect: number,
  sensorRotation: number,
) {
  const yaw = aircraft.yaw ?? aircraft.heading * radians;
  // The sensor stabilizes its view, but its physical position follows the complete airframe pose.
  const position = aircraftPoint({ ...aircraft, yaw }, AIRFRAME.camera);
  const target = { x: center.x, y: height(center.x, center.z), z: center.z };
  for (let i = 0; i < 3; i++) {
    const altitude = Math.max(1, position.y - target.y);
    const dx = target.x - position.x,
      dz = target.z - position.z;
    const distance = Math.hypot(dx, dz);
    const bounded = clamp(
      distance,
      altitude / Math.tan(82 * radians),
      altitude / Math.tan(2 * radians),
    );
    target.x = position.x + (distance > 1e-6 ? dx / distance : Math.sin(yaw)) * bounded;
    target.z = position.z + (distance > 1e-6 ? dz / distance : Math.cos(yaw)) * bounded;
    target.y = height(target.x, target.z);
  }
  const dx = target.x - position.x,
    dy = target.y - position.y,
    dz = target.z - position.z;
  const range = Math.hypot(dx, dy, dz),
    horizontal = Math.hypot(dx, dz);
  const elevation = Math.atan2(-dy, horizontal) / radians;
  const right = { x: -dz / horizontal, y: 0, z: dx / horizontal };
  const up = { x: (-dy * right.z) / range, y: horizontal / range, z: (dy * right.x) / range };
  const angle = sensorRotation * radians,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const rotatedUp = { x: up.x * c + right.x * s, y: up.y * c, z: up.z * c + right.z * s };
  // The wide view includes the horizon. Sky rays return null; zoom never changes aircraft position.
  const baseFov = Math.atan(Math.tan(35 * radians) * Math.max(1, 1.5 / Math.max(0.1, aspect)));
  const fov = clamp((2 * Math.atan(Math.tan(baseFov) / clamp(zoom, 0.65, 5))) / radians, 12, 88);
  return { position, target, up: rotatedUp, fov, elevation, range, sensorRotation };
}

/** First visible terrain hit inside the rendered terrain rectangle, never a y=0 fallback. */
export function terrainRay(
  origin: Position,
  direction: Position,
  height: Height,
  halfWidth: number,
  halfDepth: number,
  far = 1400,
): Position | null {
  if (
    ![...Object.values(origin), ...Object.values(direction), halfWidth, halfDepth, far].every(
      Number.isFinite,
    )
  )
    return null;
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length < 1e-8 || halfWidth <= 0 || halfDepth <= 0 || far <= 0) return null;
  const d = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
  let start = 0,
    end = far;
  for (const [o, v, extent] of [
    [origin.x, d.x, halfWidth],
    [origin.z, d.z, halfDepth],
  ]) {
    if (Math.abs(v) < 1e-8) {
      if (Math.abs(o) > extent) return null;
    } else {
      const a = (-extent - o) / v,
        b = (extent - o) / v;
      start = Math.max(start, Math.min(a, b));
      end = Math.min(end, Math.max(a, b));
    }
  }
  if (start > end) return null;
  const point = (t: number) => ({
    x: origin.x + d.x * t,
    y: origin.y + d.y * t,
    z: origin.z + d.z * t,
  });
  const clearance = (t: number) => {
    const p = point(t);
    return p.y - height(p.x, p.z);
  };
  if (clearance(start) < 0) return null;
  // ponytail: one-unit ray steps suit the broad low hills; use grid DDA if terrain gains sub-unit cliffs.
  for (let previous = start; previous < end; ) {
    const next = Math.min(end, previous + 1);
    if (clearance(next) <= 0) {
      let lo = previous,
        hi = next;
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        if (clearance(mid) > 0) lo = mid;
        else hi = mid;
      }
      return point((lo + hi) / 2);
    }
    previous = next;
  }
  return null;
}
