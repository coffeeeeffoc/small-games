import type { Battle } from './rules.js';
/** Oblique camera shared by visible geometry and picking; rules stay in world coordinates. */
export function project(x: number, y: number, z = 0) {
  return { x: 35 + x * 0.9 + (y - 200) * 0.2, y: 137 - x * 0.17 + y * 0.73 - z };
}
export function unproject(x: number, y: number) {
  const a = x + 5,
    b = y - 137;
  return { x: (a * 0.73 - b * 0.2) / 0.691, y: (b * 0.9 + a * 0.17) / 0.691 };
}
export function aimPoint(x: number, y: number, b: Battle) {
  const candidates = b.modules
    .filter((m) => m.hp > 0)
    .map((m) => {
      const p = project(m.x, m.y);
      return { m, p, distance: Math.hypot((x - p.x) / 0.8, (y - p.y) / 1.6) };
    })
    .filter((t) => Math.abs(x - t.p.x) < 38 && Math.abs(y - t.p.y) < 55)
    .sort((a, c) => a.distance - c.distance);
  if (candidates[0]) return { x: candidates[0].m.x, y: candidates[0].m.y };
  const p = unproject(x, y);
  return { x: Math.max(220, Math.min(880, p.x)), y: Math.max(95, Math.min(360, p.y)) };
}
