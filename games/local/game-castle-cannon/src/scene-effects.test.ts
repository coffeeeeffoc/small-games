import { expect, it } from 'vitest';
import { Vector3 } from 'three';
import { SiegeEffects } from './scene-effects.js';
import { MeshKit } from './scene-mesh.js';
import { createBattle, shoot, step } from './rules.js';
import { LEVELS } from './levels.js';

it('one real blast has a luminous peak, outward stone and smoke, then leaves only persistent damage', () => {
  const battle = createBattle(LEVELS[0]),
    kit = new MeshKit(),
    effects = new SiegeEffects(kit);
  const tower = battle.modules.find((m) => m.kind === 'tower')!;
  shoot(battle, 'blast', tower.x, tower.y);
  step(battle, 0.48);
  effects.update(battle, true, new Vector3());
  expect(tower.hp).toBe(1);
  expect(effects.metrics()).toMatchObject({
    ammo: 'blast',
    core: true,
    halo: true,
    flyingStone: 18,
    smoke: 9,
  });
  const damage = tower.hp;
  step(battle, 1.1);
  effects.update(battle, true, new Vector3());
  expect(effects.metrics()).toMatchObject({ core: false, halo: false, flyingStone: 0, smoke: 0 });
  expect(effects.glow.intensity).toBe(0);
  expect(tower.hp).toBe(damage);
  effects.dispose();
  kit.dispose();
});
