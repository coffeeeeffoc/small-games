// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import * as T from 'three';
import { MeshKit } from './scene-mesh.js';
import { loadSceneMaterials } from './scene-assets.js';

it('loads shared PBR images once, preserves skins and keeps missing optional maps playable', async () => {
  const kit = new MeshKit();
  kit.person(true);
  const requested: string[] = [];
  await loadSceneMaterials(kit, async (path) => {
    requested.push(path);
    if (path.endsWith('-2.jpg')) throw new Error('offline optional map');
    return document.createElement('img');
  });
  expect(new Set(requested).size).toBe(requested.length);
  const material = kit.materials.get('soldier:blue:march')!;
  expect(material.map?.colorSpace).toBe(T.SRGBColorSpace);
  expect(material.normalMap?.colorSpace).toBe(T.NoColorSpace);
  expect(material.map?.flipY).toBe(false);
  expect(material.metalnessMap).toBeNull();
  expect(material.metalness).toBe(0);
  kit.applySkin(1);
  expect(material.userData.tunicTint.toArray()).toEqual([5.2, 2.1, 0.23]);
  const dispose = vi.spyOn(material.map!, 'dispose');
  kit.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
});
