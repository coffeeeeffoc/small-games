import { expect, it, vi } from 'vitest';
import * as T from 'three';
import { WorldCache } from './scene-world-cache.js';

function fixture() {
  const scene = new T.Scene(),
    root = new T.Group(),
    material = new T.MeshStandardMaterial(),
    geometry = new T.BoxGeometry(),
    wall = new T.Mesh(geometry, material),
    moving = new T.Mesh(geometry, material),
    camera = new T.PerspectiveCamera();
  root.add(wall);
  scene.add(root, moving);
  scene.background = new T.Color('#aaccee');
  let target: T.WebGLRenderTarget | null = null,
    captures = 0,
    failCapture = false,
    failDynamic = false;
  const renderer = {
    extensions: { has: () => true },
    shadowMap: { enabled: false, needsUpdate: false },
    autoClear: true,
    info: { render: { triangles: 24, calls: 2 } },
    getSize: (size: T.Vector2) => size.set(768, 432),
    setRenderTarget: (value: T.WebGLRenderTarget | null) => {
      target = value;
    },
    clear: vi.fn(),
    render: (value: T.Scene) => {
      if (value !== scene) {
        const quad = value.children[0] as T.Mesh;
        expect(quad.material).toMatchObject({
          depthTest: true,
          depthWrite: true,
          depthFunc: T.AlwaysDepth,
        });
        return;
      }
      if (target) {
        captures++;
        expect(root.visible).toBe(true);
        expect(material.colorWrite).toBe(true);
        expect(material.depthWrite).toBe(true);
        moving.onBeforeRender(
          renderer as unknown as T.WebGLRenderer,
          scene,
          camera,
          geometry,
          material,
          root,
        );
        expect(material.colorWrite).toBe(false);
        expect(material.depthWrite).toBe(false);
        if (failCapture) throw new Error('capture failed');
        moving.onAfterRender(
          renderer as unknown as T.WebGLRenderer,
          scene,
          camera,
          geometry,
          material,
          root,
        );
        renderer.shadowMap.needsUpdate = false;
      } else {
        expect(root.visible).toBe(false);
        expect(moving.visible).toBe(true);
        expect(material.colorWrite).toBe(true);
        expect(material.depthWrite).toBe(true);
        if (failDynamic) throw new Error('dynamic failed');
      }
    },
  };
  const cache = new WorldCache(renderer as unknown as T.WebGLRenderer, [root]);
  cache.registerDynamic(moving);
  return {
    scene,
    root,
    material,
    geometry,
    moving,
    camera,
    renderer,
    cache,
    captures: () => captures,
    target: () => target,
    failCapture: () => {
      failCapture = true;
    },
    failDynamic: () => {
      failDynamic = true;
    },
    dispose: () => {
      cache.dispose();
      material.dispose();
      geometry.dispose();
    },
  };
}
it('reuses only static color/depth while dynamic objects remain live and damage invalidates it', () => {
  const f = fixture();
  f.cache.draw(f.scene, f.camera, 'gate:3');
  f.moving.position.x = 10;
  f.cache.draw(f.scene, f.camera, 'gate:3');
  expect(f.captures()).toBe(1);
  f.cache.draw(f.scene, f.camera, 'gate:0');
  expect(f.captures()).toBe(2);
  f.renderer.shadowMap.enabled = true;
  f.renderer.shadowMap.needsUpdate = true;
  f.cache.draw(f.scene, f.camera, 'gate:0');
  expect(f.captures()).toBe(3);
  expect(f.root.visible).toBe(true);
  expect(f.target()).toBeNull();
  f.dispose();
});
it('restores shared material writes and render target if the static pass fails', () => {
  const f = fixture();
  f.failCapture();
  expect(() => f.cache.draw(f.scene, f.camera, 'gate:3')).toThrow('capture failed');
  expect(f.material.colorWrite).toBe(true);
  expect(f.material.depthWrite).toBe(true);
  expect(f.target()).toBeNull();
  f.dispose();
});
it('restores background, visibility and clearing if the dynamic pass fails', () => {
  const f = fixture(),
    background = f.scene.background;
  f.failDynamic();
  expect(() => f.cache.draw(f.scene, f.camera, 'gate:3')).toThrow('dynamic failed');
  expect(f.scene.background).toBe(background);
  expect(f.root.visible).toBe(true);
  expect(f.renderer.autoClear).toBe(true);
  f.dispose();
});
