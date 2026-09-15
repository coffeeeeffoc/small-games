import { Vector4, MathUtils } from 'three';
import { NURBSCurve } from 'three/addons/curves/NURBSCurve.js';

// Authored in the original Blender coordinates: X east, Y north, Z up.
export const waypoints = [
  { name: '俯瞰两岸', eye: [-3300, -3600, 3300], look: [650, -120, 130] },
  { name: '沿江掠过外滩', eye: [280, -1600, 800], look: [-430, -100, 80] },
  { name: '万国建筑群', eye: [280, -80, 520], look: [-500, 140, 70] },
  { name: '苏州河口', eye: [680, 650, 780], look: [-350, 600, 70] },
  { name: '转向陆家嘴', eye: [1150, 1250, 1050], look: [1000, -120, 230] },
  { name: '飞越浦东天际线', eye: [2200, 200, 1100], look: [1000, -250, 230] },
  { name: '回望黄浦江', eye: [1300, -1900, 1250], look: [250, 120, 140] },
  { name: '两岸全景', eye: [-2800, -3300, 2800], look: [650, -120, 130] },
];
const fromBlender = ([x, y, z]: number[]) => new Vector4(x, z, -y, 1);
const knots = [0, 0, 0, 0, 0.2, 0.4, 0.6, 0.8, 1, 1, 1, 1];
// Cubic B-splines have continuous curvature through turns; arc-length sampling
// prevents the short river segments from taking as long as the long approach.
const path = new NURBSCurve(
  3,
  knots,
  waypoints.map((p) => fromBlender(p.eye)),
);
const focus = new NURBSCurve(
  3,
  knots,
  waypoints.map((p) => fromBlender(p.look)),
);
path.arcLengthDivisions = 2000;
// High-altitude transit is faster; close passes slow down without speed steps.
const travelTimes = [0];
for (let i = 1; i <= 600; i++) {
  const altitude = path.getPointAt((i - 0.5) / 600).y;
  const speed = 0.6 + 1.4 * MathUtils.smoothstep(altitude, 700, 2300);
  travelTimes.push(travelTimes[i - 1] + 1 / speed);
}
function distanceAtTime(time: number) {
  const wanted = time * travelTimes[600];
  let low = 0,
    high = 600;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (travelTimes[middle] < wanted) low = middle;
    else high = middle;
  }
  return (low + (wanted - travelTimes[low]) / (travelTimes[high] - travelTimes[low])) / 600;
}
export const clamp = (p: number) => Math.max(0, Math.min(1, Number.isFinite(p) ? p : 0));
export function travelDistance(p: number): number {
  p = clamp(p);
  const ramp = 0.08;
  if (p > 1 - ramp) return 1 - travelDistance(1 - p);
  if (p < ramp)
    return (p / 2 - (ramp * Math.sin((Math.PI * p) / ramp)) / (2 * Math.PI)) / (1 - ramp);
  return (p - ramp / 2) / (1 - ramp);
}
// Hysteresis prevents repeated swaps when hovering near a distance boundary.
export const needsDetail = (distance: number, detailed: boolean) =>
  distance < (detailed ? 1550 : 1300);
export function settleProgress(current: number, target: number, delta: number) {
  const next = MathUtils.damp(current, target, 7, delta);
  return Math.abs(next - target) < 0.00002 ? target : next;
}
export function flightFrame(p: number) {
  const progress = clamp(p);
  const t = path.getUtoTmapping(distanceAtTime(travelDistance(progress)), 0);
  const eye = path.getPoint(t),
    look = focus.getPoint(t);
  const before = path.getTangent(Math.max(0, t - 0.012));
  const after = path.getTangent(Math.min(1, t + 0.012));
  return {
    eye,
    look,
    bank: MathUtils.clamp(before.cross(after).y * 0.65, -0.045, 0.045),
    fov: 52 + 6 * MathUtils.smoothstep(eye.y, 700, 2400),
    name: waypoints[Math.min(7, Math.floor(t * 7))].name,
  };
}
export const DURATION = 48;
