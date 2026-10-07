import { describe, it, expect } from 'vitest';
import { project, unproject, aimPoint } from './projection.js';
import { createBattle } from './rules.js';
import { LEVELS } from './levels.js';
describe('oblique aiming', () => {
  it('round trips world points, and picks visible live module faces', () => {
    const b = createBattle(LEVELS[0]);
    for (const m of b.modules) {
      const p = project(m.x, m.y),
        world = unproject(p.x, p.y);
      expect(world.x).toBeCloseTo(m.x);
      expect(world.y).toBeCloseTo(m.y);
      expect(aimPoint(p.x, p.y, b)).toEqual({ x: m.x, y: m.y });
    }
  });
  it('outside release stays in shootable space instead of silently rejecting', () => {
    const p = aimPoint(2000, -2000, createBattle(LEVELS[0]));
    expect(p.x).toBeGreaterThanOrEqual(220);
    expect(p.x).toBeLessThanOrEqual(880);
    expect(p.y).toBeGreaterThanOrEqual(95);
    expect(p.y).toBeLessThanOrEqual(360);
  });
});
