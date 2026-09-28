import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aircraftCamera,
  groundAxes,
  terrainRay,
  heightfieldHeight,
  type Position,
} from '../assets/scripts/core/CameraMath.ts';
import { FLIGHT, MAP, terrainHeight } from '../assets/scripts/core/Data.ts';
import { Flight, muzzlePosition } from '../assets/scripts/core/Flight.ts';

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
  const muzzle = project(frame, muzzlePosition(plane));
  assert(
    muzzle.depth > 0.2 && Math.abs(muzzle.x) < 1 && Math.abs(muzzle.y) < 1,
    'actual fixed muzzle is in front of the near plane and visible in the wide sensor',
  );
  assert(Math.hypot(...Object.values(difference(muzzlePosition(plane), frame.position))) > 1);

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
      for (const zoom of [0.8, 1, 3.2]) {
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
  const mountZ = -0.55 * Math.cos(0.2) + 0.8 * Math.sin(0.2);
  close(pitched.position.y, plane.y - 0.8 * Math.cos(0.2) - 0.55 * Math.sin(0.2));
  close(pitched.position.x, plane.x + 0.4 * Math.cos(plane.yaw) + mountZ * Math.sin(plane.yaw));
  close(pitched.position.z, plane.z - 0.4 * Math.sin(plane.yaw) + mountZ * Math.cos(plane.yaw));
  assert(muzzle.x < 0 && muzzle.y > 0, 'fixed cannon projects into the upper-left sensor quadrant');

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
