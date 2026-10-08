import { it, expect, vi } from 'vitest';
import { SiegeScene } from './scene.js';
import { MeshKit } from './scene-mesh.js';
import { moduleModel } from './scene-castle.js';
import { siegeCamera, moduleAimPoint, toScreen } from './scene-space.js';
import { createBattle, shoot, step } from './rules.js';
import { LEVELS } from './levels.js';
import type { View } from './view.js';
import { Group } from 'three';
import { orientCannon } from './scene-gun.js';

it('turns through the shortest angle and settles across the signed-angle boundary', () => {
  const cannon = { base: new Group(), barrel: new Group() };
  cannon.base.rotation.y = Math.PI - 0.001;
  cannon.barrel.rotation.x = 0.1;
  const view = {
    aim: { x: 250, y: 100, sceneHit: { point: { x: 0.001, y: 3.1, z: 1 }, targetId: null } },
    p: { motion: true },
  } as View;
  expect(orientCannon(cannon, createBattle(LEVELS[0]), view)).toBe(false);
  expect(cannon.base.rotation.y).toBeGreaterThan(Math.PI - 0.001);
  expect(cannon.base.rotation.y).toBeLessThan(Math.PI + 0.002);
});

it('keeps distinct drag positions after the first gate shot', () => {
  const kit = new MeshKit(),
    battle = createBattle(LEVELS[0]);
  const models = new Map(battle.modules.map((m) => [m.id, moduleModel(kit, m, battle)]));
  for (const model of models.values()) model.updateMatrixWorld(true);
  const scene = Object.assign(Object.create(SiegeScene.prototype), {
    camera: siegeCamera(),
    modules: models,
  }) as SiegeScene;
  expect(shoot(battle, 'solid', 590, 280)).toBe(true);
  step(battle, 3);
  const left = scene.pick(430, 340, battle),
    right = scene.pick(580, 340, battle);
  expect(right, 'dragging over the wall must not collapse to one fixed empty aim').not.toEqual(
    left,
  );
  kit.dispose();
});

it('refreshes CPU picking before a busy GPU can defer rapid retries or level changes', () => {
  const kit = new MeshKit(),
    image = {},
    camera = siegeCamera();
  const state = {
    battle: createBattle(LEVELS[0]),
    camera,
    modules: new Map(),
    surface: { image },
    frame: { ready: vi.fn(() => false) },
    quality: { apply: vi.fn() },
    reset: vi.fn((battle: ReturnType<typeof createBattle>) => {
      state.battle = battle;
      state.modules = new Map(battle.modules.map((m) => [m.id, moduleModel(kit, m, battle)]));
      for (const model of state.modules.values()) model.updateMatrixWorld(true);
    }),
  };
  const scene = Object.assign(Object.create(SiegeScene.prototype), state) as SiegeScene;
  // Use the live scene object as the reset destination, just as the production reset does.
  scene['reset'] = vi.fn((battle) => {
    state.reset(battle);
    Object.assign(scene, { battle: state.battle, modules: state.modules });
  });
  for (const index of [0, 0, 1, 1, 2, 0, 2]) {
    const battle = createBattle(LEVELS[index]);
    expect(scene.render({ b: battle, p: { lowPower: false } } as View)).toBe(image);
    expect(state.reset).toHaveBeenLastCalledWith(battle);
    for (const m of battle.modules) {
      const p = toScreen(moduleAimPoint(m, battle), camera);
      const expected =
        m.kind === 'obstacle' ? battle.modules.find((module) => module.kind === 'gate')! : m;
      expect(scene.pick(p.x, p.y, battle)).toMatchObject({ x: expected.x, y: expected.y });
    }
    expect(scene.render({ b: battle, p: { lowPower: false } } as View)).toBe(image);
  }
  expect(state.reset).toHaveBeenCalledTimes(7);
  expect(state.frame.ready).toHaveBeenCalledTimes(14);
  kit.dispose();
});
