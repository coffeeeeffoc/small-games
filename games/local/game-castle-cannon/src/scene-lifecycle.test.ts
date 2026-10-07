import { it, expect, vi } from 'vitest';
import { SiegeScene } from './scene.js';
import { MeshKit } from './scene-mesh.js';
import { moduleModel } from './scene-castle.js';
import { siegeCamera, moduleAimPoint, toScreen } from './scene-space.js';
import { createBattle } from './rules.js';
import { LEVELS } from './levels.js';
import type { View } from './view.js';

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
      expect(scene.pick(p.x, p.y, battle)).toEqual({ x: expected.x, y: expected.y });
    }
    expect(scene.render({ b: battle, p: { lowPower: false } } as View)).toBe(image);
  }
  expect(state.reset).toHaveBeenCalledTimes(7);
  expect(state.frame.ready).toHaveBeenCalledTimes(14);
  kit.dispose();
});
