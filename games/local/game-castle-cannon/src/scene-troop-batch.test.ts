import { expect, it } from 'vitest';
import * as T from 'three';
import { MeshKit } from './scene-mesh.js';
import { TroopBatch } from './scene-troop-batch.js';
import { animateTroops } from './scene-units.js';
import { createBattle } from './rules.js';
import { LEVELS } from './levels.js';
import type { View } from './view.js';
it('batches independent troop positions and hides actual casualties without changing surviving poses', () => {
  const kit = new MeshKit(),
    material = new T.MeshBasicMaterial(),
    batch = new TroopBatch(kit, 12, material),
    battle = createBattle(LEVELS[0]);
  battle.units[0]!.hp = 0;
  battle.events.push({ time: 0, type: 'casualty', target: '0' });
  battle.time = 1;
  const view = { b: battle, p: { motion: true } } as View;
  animateTroops(batch.poses, battle, view);
  batch.sync();
  expect(batch.poses[0]!.visible).toBe(false);
  expect(batch.poses[1]!.visible).toBe(true);
  expect(batch.root.children).toHaveLength(2); // one textured soldier batch plus contact shadows
  const mesh = batch.root.children[0] as T.InstancedMesh,
    matrix = new T.Matrix4();
  expect(mesh.count).toBe(11);
  mesh.getMatrixAt(0, matrix);
  expect(
    new T.Vector3().setFromMatrixPosition(matrix).distanceTo(batch.poses[1]!.position),
  ).toBeLessThan(0.0001);
  batch.dispose();
  material.dispose();
  kit.dispose();
});
