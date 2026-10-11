import { expect, it } from 'vitest';
import * as T from 'three';
import { SceneQuality } from './scene-quality.js';

it('battery mode preserves bounds, original textures and later skin changes across repeated switches', () => {
  const scene = new T.Scene(),
    geometry = new T.BoxGeometry(),
    low = new T.BoxGeometry(),
    texture = new T.Texture(),
    material = new T.MeshStandardMaterial({ color: '#1764a0', map: texture, vertexColors: true }),
    mesh = new T.Mesh(geometry, material),
    quality = new SceneQuality();
  scene.add(mesh);
  geometry.userData.lowGeometry = low;
  for (let i = 0; i < 3; i++) {
    quality.apply(scene, true);
    expect(mesh.geometry).toBe(low);
    mesh.geometry.computeBoundingBox();
    geometry.computeBoundingBox();
    expect(mesh.geometry.boundingBox?.equals(geometry.boundingBox!)).toBe(true);
    expect(mesh.material).toBeInstanceOf(T.MeshLambertMaterial);
    expect(mesh.material.map).toBe(texture);
    material.color.set('#cb756c');
    quality.sync();
    expect(mesh.material.color.equals(material.color)).toBe(true);
    quality.apply(scene, false);
    expect(mesh.material).toBe(material);
    expect(mesh.geometry).toBe(geometry);
  }
  quality.dispose();
  material.dispose();
  texture.dispose();
  geometry.dispose();
  low.dispose();
});

it('battery mode receives textures loaded after its first render', () => {
  const scene = new T.Scene(),
    material = new T.MeshStandardMaterial(),
    mesh = new T.Mesh(new T.BoxGeometry(), material),
    quality = new SceneQuality(),
    texture = new T.Texture();
  scene.add(mesh);
  quality.apply(scene, true);
  expect(mesh.material.map).toBeNull();
  material.map = texture;
  quality.sync();
  expect(mesh.material.map).toBe(texture);
  quality.apply(scene, false);
  quality.dispose();
  material.dispose();
  texture.dispose();
  mesh.geometry.dispose();
});
