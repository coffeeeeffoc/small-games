import { terrainHeight, obstacleHeight } from './terrain.ts';
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
  Math.max(terrainHeight(x, z), obstacleHeight(x, z));
export function airframeSamples(p: Pose): Point[] {
  const cp = Math.cos(p.pitch),
    sp = Math.sin(p.pitch),
    cr = Math.cos(p.roll),
    sr = Math.sin(p.roll);
  const cy = Math.cos(p.yaw),
    sy = Math.sin(p.yaw);
  return AIRFRAME_SAMPLES.map(([x, y, z]) => {
    // Same YZX Euler quaternion as Cocos Node.setRotationFromEuler(pitch, -yaw, roll).
    const py = y * cp - z * sp,
      pz = y * sp + z * cp;
    const rx = x * cr - py * sr,
      ry = x * sr + py * cr;
    return { x: p.x + rx * cy - pz * sy, y: p.y + ry, z: p.z + rx * sy + pz * cy };
  });
}
export function airframeFloor(p: Pose) {
  let floor = surfaceHeight(p.x, p.z) + 7;
  for (const point of airframeSamples(p))
    floor = Math.max(floor, surfaceHeight(point.x, point.z) + 2.5 - (point.y - p.y));
  return floor;
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
        x: p.x - d.x * 34,
        y: p.y + 13 - d.y * 25 + Math.sin(tick * 0.13) * 0.1,
        z: p.z - d.z * 34,
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
