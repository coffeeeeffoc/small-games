import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { decorateFacade, facadeKind } from '../src/facade-detail.ts';
import { compactCityScene, disposeCityRender, granularSurface } from '../src/render-budget.ts';

test('real city material names separate stone, brick and glazing from roofs and street objects', () => {
  const glb = readFileSync(
    new URL('../../../../assets/bund/runtime/world/city_-2_-1.glb', import.meta.url),
  );
  const source = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
  const names = new Set(source.materials.map((material: { name: string }) => material.name));
  for (const [name, expected] of [
    ['Limestone | warm ivory', 1],
    ['Carved stone | cream', 1],
    ['Window glass | deep teal', 2],
    ['Heritage red brick', 3],
    ['Patinated copper | jade', 0],
  ] as const) {
    assert(names.has(name), `${name} must be present in the real waterfront tile`);
    const material = new THREE.MeshStandardMaterial();
    material.name = name;
    assert.equal(facadeKind(material), expected);
    material.dispose();
  }
  for (const [name, expected] of [
    ['Pale blue curtain wall', 2],
    ['Tower glass | blue', 2],
    ['Tower ribs | silver', 0],
    ['Warm lamp glass', 0],
    ['Promenade paving', 0],
  ] as const) {
    const material = new THREE.MeshStandardMaterial();
    material.name = name;
    assert.equal(facadeKind(material), expected);
    material.dispose();
  }
});

test('both compact presets retain material boundaries without adding draws, triangles or mutating source geometry', () => {
  const names = [
    'Limestone | warm ivory',
    'Pale blue curtain wall',
    'Heritage red brick',
    'Patinated copper | jade',
    'Promenade paving',
    'Warm lamp glass',
  ];
  const materials = names.map((name) => {
    const material = new THREE.MeshStandardMaterial();
    material.name = name;
    return material;
  });
  const geometry = new THREE.BoxGeometry(10, 12, 8),
    source = new THREE.Group();
  source.add(new THREE.Mesh(geometry, materials));
  const positions = Array.from(geometry.getAttribute('position').array),
    indices = Array.from(geometry.index!.array);
  for (const cell of [0.12, 0.35]) {
    const render = compactCityScene(source, cell),
      mesh = render.scene.children[0] as THREE.Mesh;
    assert.equal(render.scene.children.length, 1);
    assert.equal(
      mesh.geometry.getAttribute('position').count,
      indices.length,
      'Wall detail adds no triangles',
    );
    const kinds = mesh.geometry.getAttribute('bundFacadeKind'),
      panes = mesh.geometry.getAttribute('bundWindow');
    const expected = [1, 2, 3, 0, 0, 0];
    expected.forEach((kind, face) => {
      for (let vertex = face * 6; vertex < face * 6 + 6; vertex++) {
        assert.equal(kinds.getX(vertex), kind);
        assert.equal(
          panes.getX(vertex),
          kind === 2 ? 1 : 0,
          'Only glazing receives night room lights',
        );
      }
    });
    decorateFacade(mesh.material as THREE.Material);
    assert.equal(
      render.scene.children.length,
      1,
      'Decorating the merged tile creates no draw nodes',
    );
    disposeCityRender(render);
  }
  assert.equal(geometry.getAttribute('bundFacadeKind'), undefined);
  assert.deepEqual(Array.from(geometry.getAttribute('position').array), positions);
  assert.deepEqual(Array.from(geometry.index!.array), indices);
  geometry.dispose();
  materials.forEach((material) => material.dispose());
});

test('facade decoration composes with stone grain and merged night lighting, and remains stable on repeated preparation', () => {
  const stone = new THREE.MeshStandardMaterial();
  stone.name = 'Limestone | warm ivory';
  granularSurface(stone, 'stone');
  decorateFacade(stone);
  const prepared = stone.onBeforeCompile,
    cacheKey = stone.customProgramCacheKey();
  decorateFacade(stone);
  assert.equal(
    stone.onBeforeCompile,
    prepared,
    'Returning to original detail must keep its shader rather than wrap it again',
  );
  assert.equal(stone.customProgramCacheKey(), cacheKey);
  const shader = {
    ...THREE.ShaderLib.standard,
    uniforms: { ...THREE.ShaderLib.standard.uniforms },
  };
  stone.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  assert(shader.uniforms.bundPaving, 'Previously installed grain remains active');
  assert(
    shader.fragmentShader.includes('vBundSurface'),
    'The original stone grain projection survives composition',
  );
  assert(shader.fragmentShader.includes('vBundDetailKind'));
  assert(
    !shader.vertexShader.includes('attribute float bundFacadeKind'),
    'Original models require no new vertex attribute',
  );
  const source = new THREE.Group(),
    geometry = new THREE.BoxGeometry();
  source.add(new THREE.Mesh(geometry, stone));
  const compact = compactCityScene(source, 0.35),
    material = compact.ownedMaterials[0];
  granularSurface(material as THREE.MeshStandardMaterial, 'stone');
  decorateFacade(material);
  const compactShader = {
    ...THREE.ShaderLib.standard,
    uniforms: { ...THREE.ShaderLib.standard.uniforms },
  };
  material.onBeforeCompile(compactShader, {} as THREE.WebGLRenderer);
  assert(compactShader.vertexShader.includes('attribute float bundFacadeKind'));
  assert(
    compactShader.fragmentShader.includes('totalEmissiveRadiance *= vBundWindow'),
    'Merged stone and ornament do not become emissive at night',
  );
  disposeCityRender(compact);
  geometry.dispose();
  stone.dispose();
});
