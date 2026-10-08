import { expect, it } from 'vitest';
import * as T from 'three';
import { MeshKit } from './scene-mesh.js';
import { compactMeshes } from './scene-compact.js';
import { canyonForest } from './scene-forest.js';
import { terrain, groundHeight } from './scene-terrain.js';
import { siegeCamera } from './scene-space.js';

it('static batching preserves every tree instance and its authored placement', () => {
  const group = new T.Group(),
    geometry = new T.BoxGeometry(),
    material = new T.MeshStandardMaterial();
  const trees = new T.InstancedMesh(geometry, material, 2);
  const pose = new T.Matrix4().makeTranslation(7, 3, -9);
  trees.setMatrixAt(1, pose);
  group.add(trees, new T.Mesh(geometry, material));
  compactMeshes(group);
  const actual = new T.Matrix4();
  trees.getMatrixAt(1, actual);
  expect(trees.parent).toBe(group);
  expect(trees.count).toBe(2);
  expect(actual.elements).toEqual(pose.elements);
  geometry.dispose();
  material.dispose();
});

it('spruce groves grow on supported terrain and appear in the fixed valley view', () => {
  const kit = new MeshKit(),
    group = new T.Group(),
    camera = siegeCamera();
  canyonForest(kit, group, groundHeight);
  let visible = 0,
    total = 0;
  for (const object of group.children) {
    expect(object).toBeInstanceOf(T.InstancedMesh);
    const trees = object as T.InstancedMesh,
      pose = new T.Matrix4();
    for (let i = 0; i < trees.count; i++) {
      trees.getMatrixAt(i, pose);
      const p = new T.Vector3().setFromMatrixPosition(pose);
      expect(p.y).toBeCloseTo(groundHeight(p.x, p.z) - 0.08, 4);
      p.y += 3;
      p.project(camera);
      if (p.x > -0.96 && p.x < -0.1 && p.y > -0.1 && p.y < 0.85) visible++;
      total++;
    }
  }
  expect(total).toBeGreaterThan(100);
  expect(visible).toBeGreaterThan(35);
  expect(group.children.length).toBe(1);
  kit.dispose();
});

it('continuous canyon, winding river and instanced groves batch without losing geometry', () => {
  const kit = new MeshKit(),
    landscape = terrain(kit);
  expect(landscape.children.filter((o) => o instanceof T.InstancedMesh)).toHaveLength(1);
  for (const mesh of landscape.children)
    if (mesh instanceof T.Mesh) {
      expect(mesh.geometry.getAttribute('position').count).toBeGreaterThan(0);
      expect(mesh.geometry.boundingSphere?.radius ?? 1).toBeGreaterThan(0);
    }
  for (const [x, z] of [
    [25, -70],
    [80, -60],
    [15, 0],
  ])
    expect(groundHeight(x!, z!)).toBeCloseTo(-0.12);
  kit.dispose();
});
