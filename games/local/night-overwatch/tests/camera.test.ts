import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aircraftCamera,
  groundAxes,
  terrainRay,
  heightfieldHeight,
  type Position,
} from '../assets/scripts/core/CameraMath.ts';
import { AIRFRAME, FLIGHT, MAP, WEAPONS, terrainHeight } from '../assets/scripts/core/Data.ts';
import { Flight, aircraftPoint, muzzlePosition } from '../assets/scripts/core/Flight.ts';

const dot = (a: Position, b: Position) => a.x * b.x + a.y * b.y + a.z * b.z;
const difference = (a: Position, b: Position) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const unit = (p: Position) => {
  const length = Math.hypot(p.x, p.y, p.z);
  return { x: p.x / length, y: p.y / length, z: p.z / length };
};
const close = (actual: number, expected: number, tolerance = 1e-5) =>
  assert(Math.abs(actual - expected) < tolerance, `${actual} must be near ${expected}`);
const aspect = 16 / 9;
type Frame = ReturnType<typeof aircraftCamera>;
function axes(frame: Frame) {
  const forward = unit(difference(frame.target, frame.position));
  const up = frame.up;
  const right = {
    x: forward.y * up.z - forward.z * up.y,
    y: forward.z * up.x - forward.x * up.z,
    z: forward.x * up.y - forward.y * up.x,
  };
  return { forward, up, right };
}
function project(frame: Frame, p: Position) {
  const { forward, up, right } = axes(frame),
    relative = difference(p, frame.position);
  const depth = dot(relative, forward),
    half = Math.tan((frame.fov * Math.PI) / 360);
  return {
    x: dot(relative, right) / (depth * half * aspect),
    y: dot(relative, up) / (depth * half),
    depth,
  };
}
function screenRay(frame: Frame, x: number, y: number) {
  const { forward, up, right } = axes(frame),
    half = Math.tan((frame.fov * Math.PI) / 360);
  return unit({
    x: forward.x + right.x * x * half * aspect + up.x * y * half,
    y: forward.y + right.y * x * half * aspect + up.y * y * half,
    z: forward.z + right.z * x * half * aspect + up.z * y * half,
  });
}

test('camera: terrain picking, mount, FOV, complete roll, orbit parallax and ground attitude', () => {
  const coarse = [
    [0, 2],
    [4, 10],
  ];
  close(heightfieldHeight([0, 10], [0, 20], coarse, 2, 4), 1.2);
  close(heightfieldHeight([0, 10], [0, 20], coarse, 8, 16), 7.2);
  close(heightfieldHeight([0, 10], [0, 20], coarse, 5, 10), 3);
  const plane = new Flight().aircraft;
  const frame = aircraftCamera(plane, { x: 0, z: 0 }, terrainHeight, 1, aspect, 0);
  const skyFraction =
    (1 - Math.tan((frame.elevation * Math.PI) / 180) / Math.tan((frame.fov * Math.PI) / 360)) / 2;
  assert(skyFraction > 0.05 && skyFraction < 0.2, `dusk skyline occupies ${skyFraction}`);
  assert.deepEqual(frame.position, aircraftPoint(plane, AIRFRAME.camera));
  assert(Math.hypot(...Object.values(difference(muzzlePosition(plane), frame.position))) < 1,
    'gun and camera separation is metres, not tens of metres');

  const points = [
    { x: -90, z: 25 },
    { x: -42, z: -31 },
    { x: 30, z: 23 },
    { x: 82, z: -42 },
  ];
  for (const angle of [0, 0.7, 1.8, 3.3, 5.7])
    for (const rotation of [0, 37, 90, 180, 270, 360]) {
      const pose = {
        ...plane,
        x: Math.cos(angle) * FLIGHT.radius,
        z: Math.sin(angle) * FLIGHT.radius,
        yaw: -angle,
        heading: (-angle * 180) / Math.PI,
      };
      for (const zoom of [0.8, 1, 3.2, 5]) {
        const camera = aircraftCamera(pose, { x: 0, z: 0 }, terrainHeight, zoom, aspect, rotation);
        for (const p of points) {
          const q = project(camera, { ...p, y: terrainHeight(p.x, p.z) });
          const hit = terrainRay(
            camera.position,
            screenRay(camera, q.x, q.y),
            terrainHeight,
            MAP.halfWidth * 1.8,
            MAP.halfDepth * 1.8,
          );
          assert(hit, 'projected ground remains pickable after orbit/roll/zoom');
          close(hit.x, p.x, 1e-4);
          close(hit.z, p.z, 1e-4);
          close(hit.y, terrainHeight(hit.x, hit.z), 1e-4);
        }
        const basis = axes(camera);
        close(dot(basis.up, basis.forward), 0);
        close(dot(basis.right, basis.forward), 0);
        close(dot(basis.up, basis.up), 1);
      }
    }
  const zoomed = aircraftCamera(plane, { x: 0, z: 0 }, terrainHeight, 3, aspect, 0);
  assert(zoomed.fov < frame.fov);
  assert.deepEqual(zoomed.position, frame.position, 'optical zoom never teleports the camera');
  const high = aircraftCamera(
    { ...plane, y: plane.y + 50 },
    { x: 0, z: 0 },
    terrainHeight,
    1,
    aspect,
    0,
  );
  assert(high.range > frame.range && high.elevation > frame.elevation);
  const wide = aircraftCamera(
    { ...plane, x: plane.x + 30 },
    { x: 0, z: 0 },
    terrainHeight,
    1,
    aspect,
    0,
  );
  assert(wide.range > frame.range && wide.elevation < frame.elevation);
  const nearNadir = aircraftCamera(
    { ...plane, x: 0, z: 0 },
    { x: 0, z: 0 },
    terrainHeight,
    1,
    aspect,
    0,
  );
  assert(nearNadir.elevation < 83 && Object.values(nearNadir.up).every(Number.isFinite));
  const pitched = aircraftCamera(
    { ...plane, pitch: 0.2 },
    { x: 0, z: 0 },
    terrainHeight,
    1,
    aspect,
    0,
  );
  assert.deepEqual(pitched.position, aircraftPoint({ ...plane, pitch: 0.2 }, AIRFRAME.camera));
  const shifted = aircraftCamera(plane, { x: 80, z: -40 }, terrainHeight, 1, aspect, 0);
  const rolled = aircraftCamera(plane, { x: 0, z: 0 }, terrainHeight, 1, aspect, 90);
  for (let weapon = 0; weapon < WEAPONS.length; weapon++) {
    const position = muzzlePosition(plane, weapon);
    const initial = project(frame, position), pan = project(shifted, position), roll = project(rolled, position);
    assert(Math.hypot(initial.x - pan.x, initial.y - pan.y) > 0.01,
      'panning changes the physical gun projection; no fixed screen corner');
    assert(Math.hypot(initial.x - roll.x, initial.y - roll.y) > 0.01);
    assert.deepEqual(shifted.position, frame.position, 'panning never moves the sensor mount');
  }

  const flat = () => 0;
  for (const d of [
    { x: 0, y: 1, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: NaN, y: -1, z: 0 },
  ])
    assert.equal(terrainRay({ x: 0, y: 10, z: 0 }, d, flat, 10, 10), null);
  assert.equal(terrainRay({ x: 20, y: 10, z: 0 }, { x: 0, y: -1, z: 0 }, flat, 10, 10), null);
  assert.equal(terrainRay({ x: 0, y: -1, z: 0 }, { x: 0, y: -1, z: 0 }, flat, 10, 10), null);
  const hill = (x: number) => 8 * Math.exp(-((x / 3) ** 2));
  const obstructed = terrainRay({ x: -10, y: 5, z: 0 }, { x: 1, y: -0.1, z: 0 }, hill, 50, 50);
  assert(
    obstructed && obstructed.x < 0,
    'ray stops at the front hillside, never hidden ground behind it',
  );
  const uphill = terrainRay({ x: -10, y: 3, z: 0 }, { x: 1, y: 0.1, z: 0 }, hill, 50, 50);
  assert(uphill, 'a low aircraft can see hillside hits above its horizontal plane');

  const slope = (x: number, z: number) => 0.2 * x - 0.12 * z;
  for (const heading of [0, 0.7, 2, 5]) {
    const ground = groundAxes(slope, 4, 7, heading);
    close(dot(ground.forward, ground.up), 0);
    close(dot(ground.right, ground.up), 0);
    close(dot(ground.right, ground.right), 1);
    close(ground.forward.y, 0.2 * ground.forward.x - 0.12 * ground.forward.z);
  }
});
