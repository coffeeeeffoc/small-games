export const C = {
  step: 1000 / 120, maxFrame: 100, gravity: 1.25,
  chargeMs: 1000, actionCooldown: 330,
  jumpMin: 5.5, jumpMax: 12.5, swingMin: 2, swingMax: 12,
  walkForce: 0.0036, walkSpeed: 3.2, maxSpeed: 19, maxAngular: 0.25,
  bodyMass: 2, armMass: 0.16, armLength: 46,
  bodyFriction: 0.5, groundFriction: 0.65, bodyAir: 0.005, armAir: 0.015,
  standSpring: 0.25, standDamping: 0.8, standTorque: 0.25,
  armSpring: 0.012, armDamping: 0.035, armTorque: 0.02,
  gripRadius: 18, armSlack: 8, releaseMs: 330, regrabMs: 550, hysteresis: 28,
  jointStiffness: 0.72, gripStiffness: 0.8, damping: 0.12,
  supportMs: 50, safeMs: 600, safeSpeed: 1.65,
  scenePriority: 4, directionPriority: 10,
} as const;
export type Vec = { x: number; y: number };
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec, n: number): Vec => ({ x: a.x * n, y: a.y * n });
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
export const length = (a: Vec) => Math.hypot(a.x, a.y);
export const distance = (a: Vec, b: Vec) => length(sub(a, b));
export const unit = (a: Vec): Vec => length(a) > 0.0001 ? mul(a, 1 / length(a)) : { x: 0, y: -1 };
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const rotate = (p: Vec, angle: number): Vec => ({ x: p.x * Math.cos(angle) - p.y * Math.sin(angle), y: p.x * Math.sin(angle) + p.y * Math.cos(angle) });
export const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export function segmentDistance(p: Vec, a: Vec, b: Vec) {
  const d = sub(b, a); const t = clamp(dot(sub(p, a), d) / (dot(d, d) || 1), 0, 1);
  return distance(p, add(a, mul(d, t)));
}
export const TEAM = [
  { name: '阿橙', color: 0xee7650, hex: '#ee7650', badge: '▲' },
  { name: '小蓝', color: 0x4caac0, hex: '#4caac0', badge: '◆' },
  { name: '芽芽', color: 0xa1b553, hex: '#a1b553', badge: '●' },
];
