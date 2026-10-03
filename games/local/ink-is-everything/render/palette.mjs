export const INK = '#20221d';
export const PAPER = '#ddd1b4';
export const RED = '#9b4537';
export const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function random(seed) {
  let n = 2166136261;
  for (const c of String(seed)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return () => {
    n += 0x6d2b79f5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TAU = Math.PI * 2;
export const CLAMP = (n, a, b) => Math.min(b, Math.max(a, n));
export const RECLAIM = '#356f68';
export const RECLAIM_LIGHT = '#b9e4ca';
export const GEAR = '#b38a3c';
