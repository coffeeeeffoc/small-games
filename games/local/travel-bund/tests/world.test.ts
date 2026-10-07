import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Frustum, InstancedMesh, Matrix4, Mesh, PerspectiveCamera, Quaternion, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { inTriangle, movement, TRAVEL_SPEED, onWater, readVisits, clearInput, input, placementBatches, destinations } from '../src/world.ts';

test('default fast movement is frame-rate independent, diagonal-normalized and camera-relative', () => {
  assert(Math.abs(Math.hypot(...movement(1, 1, 0, TRAVEL_SPEED, 1)) - TRAVEL_SPEED) < 1e-9);
  const a = movement(0, -1, -Math.PI / 2, TRAVEL_SPEED, 1);
  assert(Math.abs(a[0] - TRAVEL_SPEED) < 1e-9);
  assert(Math.abs(a[2]) < 1e-9);
  for (const fps of [15, 30, 60, 144])
    assert(Math.abs(movement(0, -1, 0, TRAVEL_SPEED, 1 / fps)[2] * fps + TRAVEL_SPEED) < 1e-9);
});
test('shore exclusion handles both triangle winding directions and edges', () => {
  const tri = [
    [0, 0],
    [2, 0],
    [0, 2],
  ];
  assert(inTriangle(0.2, 0.2, tri));
  assert(inTriangle(0.2, 0.2, [...tri].reverse()));
  assert(inTriangle(1, 1, tri));
  assert(!inTriangle(2, 2, tri));
  assert(!onWater(3, 3, [tri]));
});
test('persisted data and cancelled controls do not leak invalid state', () => {
  assert.deepEqual(readVisits('not-json'), []);
  assert.deepEqual(readVisits('[1,"a","a",{},"b"]'), ['a', 'b']);
  input.keys.add('KeyW');
  input.stick = [1, 1];
  input.look = [10, 10];
  clearInput();
  assert.equal(input.keys.size, 0);
  assert.deepEqual(input.stick, [0, 0]);
  assert.deepEqual(input.look, [0, 0]);
});
test('runtime assets include two banks, matching collision geometry and finite transforms', () => {
  const data = JSON.parse(
    readFileSync(
      new URL('../../../../assets/bund/runtime/world/world.json', import.meta.url),
      'utf8',
    ),
  );
  assert(data.colliders.length > 2800);
  assert(data.landmarks.length >= 67);
  assert(data.benches.length > 10);
  assert(data.water.length > 0);
  for (const c of data.colliders) {
    assert(c.position.every(Number.isFinite));
    assert(c.half.every((v: number) => Number.isFinite(v) && v > 0));
  }
  for (const file of [
    'terrain',
    'water',
    ...data.tiles.map((t: { name: string }) => t.name),
    ...Object.keys(data.props),
  ]) {
    const glb = readFileSync(
      new URL(`../../../../assets/bund/runtime/world/${file}.glb`, import.meta.url),
    );
    assert.equal(glb.readUInt32LE(0), 0x46546c67);
    assert.equal(glb.readUInt32LE(8), glb.length);
  }
});

test('asset roots meet the ground and streaming tiles have spatial bounds', () => {
  const root = new URL('../../../../assets/bund/runtime/world/', import.meta.url);
  const data = JSON.parse(readFileSync(new URL('world.json', root), 'utf8'));
  const car = readFileSync(new URL('city-car.glb', root));
  const gltf = JSON.parse(car.subarray(20, 20 + car.readUInt32LE(12)).toString());
  const min = Math.min(
    ...gltf.meshes.flatMap((m) =>
      m.primitives.map((p) => gltf.accessors[p.attributes.POSITION].min[1]),
    ),
  );
  assert(Math.abs(min) < 0.002, 'Tires must meet the model origin');
  for (const p of data.props['city-car']) assert(Math.abs(p.position[1] + min - 0.02) < 0.005);
  assert(
    data.colliders.filter((c) => c.half[1] > 5 && Math.abs(c.position[1] - c.half[1] - 1) < 0.01)
      .length < 10,
    'Building foundations must not float one meter above ground',
  );
  assert(data.tiles.length > 100);
  assert(data.tiles.every((t) => t.radius > 0 && t.center.every(Number.isFinite)));
  assert(data.surfaces.length > 1000);
});

test('visible terrain has a 15 cm sidewalk curb above the asphalt', async () => {
  const scenes = [];
  for (const name of ['terrain', 'sidewalk_-2_-1']) {
    const bytes = readFileSync(new URL(`../../../../assets/bund/runtime/world/${name}.glb`, import.meta.url));
    const { scene } = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '',
    );
    scene.updateMatrixWorld(true);
    scenes.push(scene);
  }
  const height = (x, z) => {
    const [hit] = new Raycaster(new Vector3(x, 3, z), new Vector3(0, -1, 0)).intersectObjects(scenes, true);
    assert(hit, `No visible terrain at ${x}, ${z}`);
    return hit.point.y;
  };
  assert(Math.abs(height(-400, 37) - .02) < .005);
  assert(Math.abs(height(-410, 37) - .17) < .005);
});

test('street-block tree instances preserve every placement and cull distant clusters in both viewport shapes', async (t) => {
  const root = new URL('../../../../assets/bund/runtime/world/', import.meta.url);
  const data = JSON.parse(readFileSync(new URL('world.json', root), 'utf8'));
  const placements = data.props['plane-tree-planter'];
  const batches = placementBatches(placements);
  assert.equal(batches.flat().length, placements.length);
  assert.equal(new Set(batches.flat()).size, placements.length, 'Every authored tree remains in exactly one batch');
  const bytes = readFileSync(new URL('plane-tree-planter.glb', root));
  const { scene } = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '',
  );
  scene.updateMatrixWorld(true);
  for (const aspect of [390 / 844, 1440 / 900]) {
    const camera = new PerspectiveCamera(68, aspect, .25, 12000);
    camera.position.set(...destinations[0].position);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(0, destinations[0].yaw, 0);
    camera.updateMatrixWorld();
    const frustum = new Frustum().setFromProjectionMatrix(
      new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    const visibleTriangles = (groups) => {
      let triangles = 0;
      scene.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        for (const batch of groups) {
          const mesh = new InstancedMesh(object.geometry, object.material, batch.length);
          batch.forEach((p, index) => mesh.setMatrixAt(index, new Matrix4().compose(
            new Vector3(...p.position),
            new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), p.yaw),
            new Vector3(...p.scale),
          ).multiply(object.matrixWorld)));
          mesh.computeBoundingSphere();
          if (frustum.intersectsObject(mesh))
            triangles += (object.geometry.index?.count || object.geometry.attributes.position.count) / 3 * batch.length;
          mesh.dispose();
        }
      });
      return triangles;
    };
    const wholeCity = visibleTriangles([placements]), grouped = visibleTriangles(batches);
    t.diagnostic(`aspect=${aspect.toFixed(3)} tree triangles=${grouped}/${wholeCity}, preserved placements=${placements.length}`);
    assert(grouped > 0, 'Nearby visible trees remain');
    assert(grouped < wholeCity * .7, `Tree triangles must fall by at least 30% at aspect ${aspect}: ${grouped}/${wholeCity}`);
  }
});
