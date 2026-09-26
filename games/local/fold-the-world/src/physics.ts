import { HEIGHT, WIDTH, overlaps, type Rect } from './geometry';
export const STEP = 1 / 120;
export const MOTION = { speed: 170, groundAcceleration: 1800, airAcceleration: 700, friction: 2100, gravity: 1600, jump: 480, coyote: 0.085, buffer: 0.11 } as const;
export interface Body { x: number; y: number; w: number; h: number; vx: number; vy: number; grounded: boolean; coyote: number; buffer: number }
export interface Input { axis: number; jump: boolean }
export const makeBody = (spawn: { x: number; y: number }): Body => ({ ...spawn, w: 22, h: 28, vx: 0, vy: 0, grounded: false, coyote: 0, buffer: 0 });
const approach = (v: number, target: number, amount: number): number => v < target ? Math.min(target, v + amount) : Math.max(target, v - amount);
export function stepBody(b: Body, solids: readonly Rect[], input: Input, dt = STEP): void {
  b.coyote = b.grounded ? MOTION.coyote : Math.max(0, b.coyote - dt);
  b.buffer = input.jump ? MOTION.buffer : Math.max(0, b.buffer - dt);
  const axis = Math.max(-1, Math.min(1, input.axis));
  const acceleration = axis ? (b.grounded ? MOTION.groundAcceleration : MOTION.airAcceleration) : (b.grounded ? MOTION.friction : MOTION.airAcceleration * 0.45);
  b.vx = approach(b.vx, axis * MOTION.speed, acceleration * dt);
  if (b.buffer > 0 && b.coyote > 0) { b.vy = -MOTION.jump; b.grounded = false; b.coyote = 0; b.buffer = 0; }
  b.vy = Math.min(900, b.vy + MOTION.gravity * dt);
  // Sweep each axis against ALL rectangles, choose nearest boundary once. Overlaps act as a union.
  const dx = b.vx * dt;
  let x = b.x + dx;
  for (const s of solids) if (b.y + b.h > s.y + 0.001 && b.y < s.y + s.h - 0.001) {
    if (dx > 0 && b.x + b.w <= s.x + 0.001 && x + b.w >= s.x) x = Math.min(x, s.x - b.w);
    if (dx < 0 && b.x >= s.x + s.w - 0.001 && x <= s.x + s.w) x = Math.max(x, s.x + s.w);
  }
  x = Math.max(0, Math.min(WIDTH - b.w, x));
  if (Math.abs(x - b.x - dx) > 0.001) b.vx = 0;
  b.x = x;
  const dy = b.vy * dt;
  let y = b.y + dy;
  b.grounded = false;
  for (const s of solids) if (b.x + b.w > s.x + 0.001 && b.x < s.x + s.w - 0.001) {
    if (dy >= 0 && b.y + b.h <= s.y + 0.001 && y + b.h >= s.y) { y = Math.min(y, s.y - b.h); b.grounded = true; }
    if (dy < 0 && b.y >= s.y + s.h - 0.001 && y <= s.y + s.h) y = Math.max(y, s.y + s.h);
  }
  if (Math.abs(y - b.y - dy) > 0.001 || b.grounded) b.vy = 0;
  b.y = y;
}
export const fell = (b: Body): boolean => b.y > HEIGHT + 60;
export const bodyOverlaps = (b: Body, rects: readonly Rect[]): boolean => rects.some(r => overlaps(b, r));
