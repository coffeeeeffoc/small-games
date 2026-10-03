export const EPSILON = 1e-7;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function normalized(x, y) {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}
export const finite = (value) => typeof value === 'number' && Number.isFinite(value);
export const rounded = (value) => Math.round(value * 1000) / 1000;
