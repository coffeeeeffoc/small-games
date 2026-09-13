import { expect, it, vi } from 'vitest';
import * as geometry from '../src/first-person/geometry';
import {
  buildRoom,
  bossMesh,
  printerMesh,
  type Face,
  type Point,
} from '../src/first-person/geometry';
import { createScene, eyeHeight } from '../src/first-person/model';
import { createOfficeRenderer } from '../src/first-person/render';
import { partitionRoom, visibleFaces } from '../src/first-person/visibility';

const subtract = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Point, b: Point): Point => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

// Independent triangle ray casting checks the painter's last polygon against actual depth.
function hit(face: Face, eye: Point, ray: Point): number {
  let nearest = Infinity;
  for (let index = 1; index < face.points.length - 1; index += 1) {
    const a = face.points[0]!;
    const edge1 = subtract(face.points[index]!, a);
    const edge2 = subtract(face.points[index + 1]!, a);
    const p = cross(ray, edge2);
    const determinant = dot(edge1, p);
    if (Math.abs(determinant) < 1e-8) continue;
    const offset = subtract(eye, a);
    const u = dot(offset, p) / determinant;
    const q = cross(offset, edge1);
    const v = dot(ray, q) / determinant;
    if (u < 0 || u > 1 || v < 0 || u + v > 1) continue;
    const depth = dot(edge2, q) / determinant;
    if (depth > 0.08) nearest = Math.min(nearest, depth);
  }
  return nearest;
}

it('draws the nearest real surface last around desks, screens, the boss, and ceiling', () => {
  const state = createScene(1);
  const faces = buildRoom(state);
  const room = partitionRoom(faces);
  const poses = [
    { x: 1.6, z: 1.5, yaw: 0, pitch: 0, crouched: false },
    { x: 11.5, z: 15.3, yaw: Math.PI, pitch: 0, crouched: false },
    { x: 1.6, z: 15.3, yaw: Math.PI / 2, pitch: 0, crouched: true },
    { x: 7.2, z: 9, yaw: 0.3, pitch: 0.35, crouched: false },
    { x: 2.2, z: 7.3, yaw: 1.3, pitch: -0.3, crouched: true },
  ];
  for (const pose of poses) {
    state.player = pose;
    state.crouched = pose.crouched;
    state.distractionLeft = 10.7;
    state.boss = { ...state.boss, x: 7.2, z: 10.6, yaw: 1.8 };
    const eye: Point = [pose.x, eyeHeight(state), pose.z];
    const actors = [...bossMesh(state), ...printerMesh(state)];
    const original = [...faces, ...actors];
    const ordered = visibleFaces(room, eye, actors);
    const sy = Math.sin(pose.yaw),
      cy = Math.cos(pose.yaw);
    const sp = Math.sin(pose.pitch),
      cp = Math.cos(pose.pitch);
    for (let x = 70; x < 960; x += 160)
      for (let y = 50; y < 540; y += 80) {
        const horizontal = (x - 480) / 486;
        const vertical = (259.2 - y) / 486;
        const depth = cp - vertical * sp;
        const ray: Point = [
          horizontal * cy + depth * sy,
          vertical * cp + sp,
          -horizontal * sy + depth * cy,
        ];
        const nearest = Math.min(...original.map((face) => hit(face, eye, ray)));
        let painted = Infinity;
        for (const face of ordered) {
          const distance = hit(face, eye, ray);
          if (Number.isFinite(distance)) painted = distance;
        }
        expect(painted, `${JSON.stringify(pose)} pixel ${x},${y}`).toBeCloseTo(nearest, 5);
      }
  }
  function measure(node: typeof room): { depth: number; faces: number } {
    if (!node) return { depth: 0, faces: 0 };
    const back = measure(node.back),
      front = measure(node.front);
    return {
      depth: 1 + Math.max(back.depth, front.depth),
      faces: node.faces.length + back.faces + front.faces,
    };
  }
  expect(measure(room).depth).toBeLessThan(32);
  expect(measure(room).faces).toBeLessThan(10_000);
});

it('removes picked-up objects, animates only the active printer, and retains one anchored sign', () => {
  const state = createScene();
  const initial = buildRoom(state);
  const labels = visibleFaces(partitionRoom(initial), [7, 1.65, 9], []).filter((face) => face.text);
  expect(labels.map((face) => face.text).sort()).toEqual(
    initial
      .filter((face) => face.text)
      .map((face) => face.text)
      .sort(),
  );
  expect(labels.every((face) => face.textAnchor)).toBe(true);
  state.holdingFile = true;
  const withoutFiles = buildRoom(state);
  expect(withoutFiles.length).toBeLessThan(initial.length);
  state.coffeeTaken = true;
  expect(buildRoom(state).length).toBeLessThan(withoutFiles.length);
  expect(printerMesh(state)).toEqual([]);
  state.distractionLeft = 12;
  const firstPaper = printerMesh(state);
  expect(firstPaper.length).toBeGreaterThan(0);
  state.distractionLeft = 11.6;
  expect(printerMesh(state)).not.toEqual(firstPaper);
  state.distractionLeft = 0;
  expect(printerMesh(state)).toEqual([]);
});

it('rebuilds static geometry on inventory changes, never on printer animation frames', () => {
  const build = vi.spyOn(geometry, 'buildRoom');
  const ctx = {
    clearRect() {},
    fillRect() {},
    fillText() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    fill() {},
    stroke() {},
    createRadialGradient: () => ({ addColorStop() {} }),
  } as unknown as CanvasRenderingContext2D;
  try {
    const state = createScene();
    const paint = createOfficeRenderer();
    paint(ctx, 960, 540, state);
    state.distractionLeft = 12;
    paint(ctx, 960, 540, state);
    state.distractionLeft = 11.9;
    paint(ctx, 960, 540, state);
    expect(build).toHaveBeenCalledTimes(1);
    state.holdingFile = true;
    paint(ctx, 960, 540, state);
    state.coffeeTaken = true;
    paint(ctx, 960, 540, state);
    expect(build).toHaveBeenCalledTimes(3);
  } finally {
    build.mockRestore();
  }
});
