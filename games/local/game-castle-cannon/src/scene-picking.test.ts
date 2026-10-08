import { describe, it, expect } from 'vitest';
import { LEVELS } from './levels.js';
import { createBattle } from './rules.js';
import { MeshKit } from './scene-mesh.js';
import { moduleModel } from './scene-castle.js';
import { moduleAimPoint, siegeCamera, toScreen } from './scene-space.js';
import { pickModule } from './scene-picking.js';
describe('visible siege targets', () => {
  for (const level of LEVELS)
    it(`${level.name}: every live target remains selectable after prior destruction`, () => {
      const battle = createBattle(level),
        kit = new MeshKit(),
        camera = siegeCamera();
      const models = new Map(battle.modules.map((m) => [m.id, moduleModel(kit, m, battle)]));
      for (const model of models.values()) model.updateMatrixWorld(true);
      for (const m of battle.modules) {
        const p = toScreen(moduleAimPoint(m, battle), camera);
        const expected =
          m.kind === 'obstacle' ? battle.modules.find((module) => module.kind === 'gate')! : m;
        expect(pickModule(p.x, p.y, battle, camera, models), `all live: ${m.id}`).toMatchObject({
          x: expected.x,
          y: expected.y,
        });
      }
      for (const m of battle.modules) {
        const p = toScreen(moduleAimPoint(m, battle), camera);
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(960);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(540);
        expect(pickModule(p.x, p.y, battle, camera, models), m.id).toMatchObject({
          x: m.x,
          y: m.y,
        });
        m.hp = 0;
        models.get(m.id)!.visible = false;
      }
      kit.dispose();
    });
});
