import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  lifeBlocks,
  localPoint,
  nearbyLife,
  streetColliders,
  visitorPose,
  MAX_LIFE_BLOCKS,
  LIFE_RADIUS,
} from '../src/life.ts';
import { readSettings } from '../src/settings.ts';
const data = JSON.parse(
  readFileSync(
    new URL('../../../../assets/bund/runtime/world/world.json', import.meta.url),
    'utf8',
  ),
);

test('street life stays on authored decks, is bounded nearby and uses the same kiosk footprints for collision', () => {
  const blocks = lifeBlocks(data),
    near = nearbyLife(blocks, [-377, 2, 37]);
  assert(near.length > 0 && near.length <= MAX_LIFE_BLOCKS);
  assert(near.some((b) => b.id === 'welcome'));
  assert.deepEqual(nearbyLife(blocks, [9000, 0, 9000]), []);
  for (const b of near) assert(Math.hypot(b.position[0] + 377, b.position[2] - 37) < LIFE_RADIUS);
  for (const b of blocks) {
    assert(Math.abs(b.position[1] - 0.92) < 1e-6);
    for (let i = 0; i < 3; i++)
      for (const t of [0, 20, 99]) {
        const p = visitorPose(b, i, t);
        assert(p.position.every(Number.isFinite));
        assert(Math.hypot(p.position[0] - b.position[0], p.position[2] - b.position[2]) < 5);
      }
  }
  assert.equal(
    streetColliders(blocks).length,
    blocks.filter((b) => b.kiosk).length + blocks.length * 3,
  );
  const p = localPoint({ position: [10, 1, 20], yaw: Math.PI / 2, scale: [1, 1, 1] }, 2, 3);
  assert.deepEqual(p, [13, 1, 18]);
});
test('actual Blender GLB has usable articulated joints, vertex colours, ground origins and a mobile asset budget', async () => {
  const bytes = readFileSync(
    new URL('../../../../assets/bund/runtime/life/street-life.glb', import.meta.url),
  );
  assert(bytes.length < 750000);
  const { scene } = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    '',
  );
  let triangles = 0;
  for (const name of [
    'kiosk',
    'flowers',
    'banner',
    'visitor-body',
    'visitor-arm-left',
    'visitor-arm-right',
    'visitor-leg-left',
    'visitor-leg-right',
    'pigeon-body',
    'pigeon-wing-left',
    'pigeon-wing-right',
  ]) {
    const mesh = scene.getObjectByName(name) as THREE.Mesh;
    assert(mesh?.isMesh, name);
    assert(mesh.geometry.getAttribute('color'), `${name} retains authored colours`);
    triangles += (mesh.geometry.index?.count || mesh.geometry.getAttribute('position').count) / 3;
  }
  assert(triangles < 18000);
  const arm = scene.getObjectByName('visitor-arm-right')!;
  assert(Math.abs(arm.position.y - 1.37) < 0.001, 'Shoulder stays at its authored pivot');
  const floor = new THREE.Box3().setFromObject(scene.getObjectByName('kiosk')!);
  assert(Math.abs(floor.min.y) < 0.03);
});
test('tour preferences reject malformed persisted values and honour mobile and reduced-motion defaults', () => {
  assert.equal(readSettings(null, true).quality, 0);
  assert.equal(readSettings(null, false).quality, 1);
  assert.equal(readSettings(null, true, true).motion, false);
  assert.deepEqual(readSettings('broken', true), readSettings('null', true));
  const valid = readSettings(
    '{"quality":2,"sensitivity":1.4,"sound":false,"crowd":false,"motion":false,"night":true}',
    true,
  );
  assert.deepEqual(valid, {
    quality: 2,
    sensitivity: 1.4,
    sound: false,
    crowd: false,
    motion: false,
    night: true,
  });
  const invalid = readSettings('{"quality":9,"sensitivity":-2,"sound":"false"}', true);
  assert.equal(invalid.quality, 0);
  assert.equal(invalid.sensitivity, 1);
  assert.equal(invalid.sound, true);
});
