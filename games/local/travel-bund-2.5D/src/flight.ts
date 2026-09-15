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
export const chapters = [
  {
    at: 0,
    title: '沿着江，飞入上海',
    short: '两岸全景',
    text: '从城市轮廓，走近一扇窗、一座钟楼。',
  },
  {
    at: 0.31,
    title: '江风掠过钟楼',
    short: '万国建筑',
    text: '贴近西岸，慢慢看清外滩的屋顶与立面。',
  },
  {
    at: 0.48,
    title: '在江湾，转个身',
    short: '苏州河口',
    text: '沿着河口转弯，让两岸在眼前展开。',
  },
  {
    at: 0.7,
    title: '抬头，是陆家嘴',
    short: '浦东天际线',
    text: '从江面抬升，穿过高低错落的天际线。',
  },
  {
    at: 1,
    title: '把两岸，收进眼底',
    short: '回望上海',
    text: '向回滚动，还能再看一遍刚才的风景。',
  },
];
export const chapterAt = (p: number) =>
  chapters.reduce((at, chapter, i) => (clamp(p) >= chapter.at - 0.075 ? i : at), 0);
export const wheelStep = (delta: number, mode: number, height: number) =>
  MathUtils.clamp((delta * (mode === 1 ? 16 : mode === 2 ? height : 1)) / 10000, -0.06, 0.06);
// Hysteresis prevents repeated swaps when hovering near a distance boundary.
export const needsDetail = (distance: number, detailed: boolean) =>
  distance < (detailed ? 1550 : 1300);
export function settleProgress(current: number, target: number, delta: number, response = 12) {
  // Bound long seeks, then ease into the target. Integrate the linear/exponential
  // portions exactly so touch screens and slower frames cover the same distance.
  const distance = Math.abs(target - current),
    rate = 0.25;
  const linearTime = Math.max(0, (distance - rate / response) / rate);
  const movingTime = Math.min(Math.max(0, delta), linearTime);
  const remaining =
    (distance - rate * movingTime) * Math.exp(-response * Math.max(0, delta - movingTime));
  const next = target - Math.sign(target - current) * remaining;
  return Math.abs(next - target) < 0.00002 ? target : next;
}
export function flightFrame(p: number) {
  const progress = clamp(p);
  // Input maps to travel immediately, including the very first wheel notch.
  const t = path.getUtoTmapping(distanceAtTime(progress), 0);
  const eye = path.getPoint(t),
    look = focus.getPoint(t);
  const before = path.getTangent(Math.max(0, t - 0.012));
  const after = path.getTangent(Math.min(1, t + 0.012));
  // Approach landmarks from above the river; all original geometry stays fixed.
  const approach = (center: number, width: number) =>
    Math.exp(-(((progress - center) / width) ** 2));
  const close = approach(0.31, 0.09) + approach(0.7, 0.1);
  eye.y -= (190 * approach(0.31, 0.09) + 250 * approach(0.7, 0.1)) * Math.sin(Math.PI * progress);
  return {
    eye,
    look,
    bank: MathUtils.clamp(before.cross(after).y * 0.65, -0.045, 0.045),
    fov: 52 + 6 * MathUtils.smoothstep(eye.y, 700, 2400) - 5 * close,
    name: chapters[chapterAt(progress)].short,
  };
}
export const DURATION = 48;
