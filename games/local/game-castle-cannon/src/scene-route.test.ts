import { expect, it } from 'vitest';
import { createBattle, shoot, step } from './rules.js';
import { LEVELS } from './levels.js';
import { soldierPosition, routeCenter } from './scene-space.js';
import { groundHeight } from './scene-terrain.js';

it('the visible formation waits outside the closed door, follows supported ground, and enters after opening', () => {
  const battle = createBattle(LEVELS[0]);
  step(battle, 3);
  expect(battle.units.every((u) => soldierPosition(u.x, u.id).z > 14)).toBe(true);
  shoot(battle, 'solid', 590, 280);
  step(battle, 4);
  expect(battle.modules[0].hp).toBe(0);
  expect(battle.units.some((u) => soldierPosition(u.x, u.id).z < 14)).toBe(true);
  for (const unit of battle.units) {
    const point = soldierPosition(unit.x, unit.id);
    expect(Math.abs(point.x - routeCenter(point.z))).toBeLessThan(1.2);
    expect(groundHeight(point.x, point.z)).toBeCloseTo(-0.12);
  }
});
