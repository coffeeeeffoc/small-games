import { terrainHeight, obstacleHeight, WATER_LEVEL } from './terrain.ts';
type Point = { x: number; y: number; z: number };
type Pose = Point & { yaw: number; pitch: number; roll: number };
// Metres, matching art/falcon-manifest.json: centre, wings, nose, tailplanes and engine underside.
export const AIRFRAME_SAMPLES = [
  [0, -1.1, 0],
  [-10.625, 0.05, 4.9],
  [10.625, 0.05, 4.9],
  [0, 0, -14.15],
  [-5.3, -0.06, 7.8],
  [5.3, -0.06, 7.8],
  [-1.18, -1.1, 9.15],
  [1.18, -1.1, 9.15],
] as const;
export const surfaceHeight = (x: number, z: number) =>
  Math.max(WATER_LEVEL, terrainHeight(x, z), obstacleHeight(x, z));
export function airframeSamples(
  p: Pose,
  samples: readonly (readonly number[])[] = AIRFRAME_SAMPLES,
): Point[] {
  const cp = Math.cos(p.pitch),
    sp = Math.sin(p.pitch),
    cr = Math.cos(p.roll),
    sr = Math.sin(p.roll);
  const cy = Math.cos(p.yaw),
    sy = Math.sin(p.yaw);
  return samples.map(([x, y, z]) => {
    // Same YZX Euler quaternion as Cocos Node.setRotationFromEuler(pitch, -yaw, roll).
    const py = y * cp - z * sp,
      pz = y * sp + z * cp;
    const rx = x * cr - py * sr,
      ry = x * sr + py * cr;
    return { x: p.x + rx * cy - pz * sy, y: p.y + ry, z: p.z + rx * sy + pz * cy };
  });
}
export function airframeFloor(p: Pose, samples: readonly (readonly number[])[] = AIRFRAME_SAMPLES) {
  let floor = surfaceHeight(p.x, p.z) + 1.1;
  for (const point of airframeSamples(p, samples))
    floor = Math.max(floor, surfaceHeight(point.x, point.z) + 0.35 - (point.y - p.y));
  return floor;
}
export function airframeContact(
  before: Pose,
  after: Pose,
  samples: readonly (readonly number[])[] = AIRFRAME_SAMPLES,
) {
  const travel = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
  const yaw = Math.atan2(Math.sin(after.yaw - before.yaw), Math.cos(after.yaw - before.yaw));
  const steps = Math.max(
    1,
    Math.ceil(
      (travel +
        15 *
          (Math.abs(yaw) +
            Math.abs(after.roll - before.roll) +
            Math.abs(after.pitch - before.pitch))) /
        4,
    ),
  );
  const at = (t: number): Pose => ({
    x: before.x + (after.x - before.x) * t,
    y: before.y + (after.y - before.y) * t,
    z: before.z + (after.z - before.z) * t,
    yaw: before.yaw + yaw * t,
    pitch: before.pitch + (after.pitch - before.pitch) * t,
    roll: before.roll + (after.roll - before.roll) * t,
  });
  for (let i = 0; i <= steps; i++) {
    const pose = at(i / steps);
    if (pose.y > airframeFloor(pose, samples)) continue;
    let lo = Math.max(0, (i - 1) / steps),
      hi = i / steps;
    for (let j = 0; j < 8; j++) {
      const mid = (lo + hi) / 2,
        p = at(mid);
      if (p.y <= airframeFloor(p, samples)) hi = mid;
      else lo = mid;
    }
    return at(lo);
  }
  return null;
}
export function cameraView(p: Pose, menu: boolean, tick: number) {
  const d = {
    x: Math.sin(p.yaw) * Math.cos(p.pitch),
    y: Math.sin(p.pitch),
    z: -Math.cos(p.yaw) * Math.cos(p.pitch),
  };
  const desired = menu
    ? { x: p.x - 28, y: p.y + 18, z: p.z + 34 }
    : {
        x: p.x - d.x * 56,
        y: p.y + 18 - d.y * 44 + Math.sin(tick * 0.13) * 0.1,
        z: p.z - d.z * 56,
      };
  const target = menu
    ? { x: p.x - 8, y: p.y + 14, z: p.z - 10 }
    : { x: p.x + d.x * 150, y: p.y + d.y * 150 - 9, z: p.z + d.z * 150 };
  const focus = { x: p.x, y: p.y + (menu ? 12 : 4), z: p.z };
  let position = desired;
  for (const fraction of [1, 0.75, 0.5, 0.3]) {
    position = {
      x: focus.x + (desired.x - focus.x) * fraction,
      y: focus.y + (desired.y - focus.y) * fraction,
      z: focus.z + (desired.z - focus.z) * fraction,
    };
    position.y = Math.max(position.y, surfaceHeight(position.x, position.z) + 6);
    let clear = true;
    for (let i = 1; i < 10; i++) {
      const t = i / 10,
        x = focus.x + (position.x - focus.x) * t,
        z = focus.z + (position.z - focus.z) * t;
      if (focus.y + (position.y - focus.y) * t < surfaceHeight(x, z) + 2) {
        clear = false;
        break;
      }
    }
    if (clear) break;
  }
  return { position, target };
}
