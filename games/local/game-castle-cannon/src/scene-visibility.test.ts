import { describe, it, expect } from 'vitest';
import { Raycaster, Vector2, type Object3D } from 'three';
import { LEVELS } from './levels.js';
import { createBattle } from './rules.js';
import { MeshKit } from './scene-mesh.js';
import { castleShell, moduleModel } from './scene-castle.js';
import { moduleAimPoint, siegeCamera, toScreen } from './scene-space.js';
function belongsTo(object: Object3D, root: Object3D) {
  let node: Object3D | null = object;
  while (node && node !== root) node = node.parent;
  return node === root;
}
describe('castle architecture preserves the actual target sight lines', () => {
  for (const level of LEVELS)
    it(`${level.name}: walls and gatehouses do not hide live target aiming surfaces`, () => {
      const battle = createBattle(level),
        kit = new MeshKit(),
        camera = siegeCamera();
      const shell = castleShell(kit);
      shell.updateMatrixWorld(true);
      for (const module of battle.modules) {
        const model = moduleModel(kit, module, battle);
        model.updateMatrixWorld(true);
        const point = toScreen(moduleAimPoint(module, battle), camera),
          ray = new Raycaster();
        ray.setFromCamera(new Vector2(point.x / 480 - 1, 1 - point.y / 270), camera);
        // The obstacle may initially be behind a closed door; the permanent wall must not hide it.
        const first = ray.intersectObjects([shell, model], true)[0];
        expect(first && belongsTo(first.object, model), module.id).toBe(true);
      }
      kit.dispose();
    });
});
