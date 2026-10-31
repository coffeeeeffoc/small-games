import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../src/render.mjs';
import { Game } from '../src/engine.mjs';
import {
  piecePose,
  rotateVector,
  cubeFaces,
  cubeGeometry,
} from '../assets/scripts/core/projection.js';

const renderer = (dims = [8, 8, 18]) => {
  const value = new Renderer({ getContext: () => ({}) });
  value.dims = [...dims];
  value.width = 390;
  value.height = 500;
  value._fit();
  return value;
};
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('all six quarter turns stay rigid and end at the rule result, including wall kicks', () => {
  let kicked = 0;
  for (let seed = 1; seed <= 16; seed++)
    for (const plane of ['XY', 'XZ', 'YZ'])
      for (const direction of [-1, 1]) {
        const game = new Game({ seed });
        while (game.move(0, -1)) {}
        while (game.move(1, -1)) {}
        game.drainEvents();
        if (!game.rotate(plane, direction)) continue;
        const event = game.drainEvents().find((e) => e.type === 'rotate');
        if (event.kick.some((n) => n !== 0)) kicked++;
        for (const progress of [0, 0.2, 0.5, 0.9, 1]) {
          const pose = piecePose(event, progress);
          for (let i = 0; i < 4; i++)
            for (let j = i + 1; j < 4; j++) {
              const before = Math.hypot(...event.from[i].map((n, a) => n - event.from[j][a]));
              const during = Math.hypot(...pose.cells[i].map((n, a) => n - pose.cells[j][a]));
              assert.ok(Math.abs(before - during) < 1e-9, 'no shrinking or stretching');
            }
          if (progress === 0 || progress === 1) {
            const expected = progress === 0 ? event.from : event.to;
            pose.cells.forEach((cell, i) =>
              cell.forEach((n, a) => assert.ok(Math.abs(n - expected[i][a]) < 1e-9)),
            );
          }
          assert.ok(Math.abs(Math.hypot(...rotateVector([1, 0, 0], pose.rotation)) - 1) < 1e-9);
        }
      }
  assert.ok(kicked > 0, 'wall kicks exercised');
});

test('rounded cube patches stay inside the collision cell with unit outward normals', () => {
  assert.equal(cubeFaces.length, 54);
  assert.equal(cubeFaces.filter((f) => f.center).length, 6);
  for (const face of cubeFaces) {
    assert.ok(Math.abs(Math.hypot(...face.normal) - 1) < 1e-9);
    assert.ok(face.normal[face.axis] * face.sign > 0);
    for (const vertex of face.vertices) {
      assert.ok(vertex.every((n) => Math.abs(n) <= 0.5 + 1e-12));
      const offset = vertex.map((n) => n - Math.max(-0.45, Math.min(0.45, n)));
      assert.ok(Math.abs(Math.hypot(...offset) - 0.05) < 1e-9);
    }
  }
});

test('orbit coasts briefly, is frame-rate independent, and cancels on preset or new drag', () => {
  const a = renderer(),
    b = renderer();
  a.orbit(30, 20);
  b.orbit(30, 20);
  const release = { ...a.camera };
  a.coast(0.1);
  for (let i = 0; i < 10; i++) b.coast(0.01);
  assert.ok(Math.abs(a.camera.yaw - b.camera.yaw) < 1e-9);
  assert.ok(a.camera.yaw < release.yaw && release.yaw - a.camera.yaw < 0.5);
  for (let i = 0; i < 60; i++) a.coast(1 / 60);
  assert.deepEqual(a.velocity, { x: 0, y: 0 });
  const stopped = { ...a.camera };
  a.coast(1);
  assert.deepEqual(a.camera, stopped);
  b.stopOrbit();
  assert.deepEqual(b.velocity, { x: 0, y: 0 });
  b.orbit(20, 10);
  b.setView('top');
  const preset = { ...b.camera };
  b.coast(1);
  assert.deepEqual(b.camera, preset);
});

test('top view separates the same XY position at different heights', () => {
  const view = renderer();
  view.setView('top');
  view._fit();
  for (const [x, y] of [
    [1.5, 1.5],
    [4, 4],
    [6.5, 6.5],
  ]) {
    assert.ok(
      distance(view.project([x, y, 0.5]), view.project([x, y, 2.5])) > 3,
      'Different layers have a visible screen-space offset, including the center column',
    );
  }
});

test('perspective makes nearer cubes visibly larger', () => {
  const view = renderer();
  view.setView('top');
  view._fit();
  const lower = distance(view.project([2, 2, 0]), view.project([3, 2, 0]));
  const upper = distance(view.project([2, 2, 16]), view.project([3, 2, 16]));
  assert.ok(upper > lower * 1.1, 'Upper levels show perspective foreshortening');
});

test('camera drag crosses the top and horizon without hitting a pitch clamp', () => {
  const view = renderer();
  view.setView('top');
  const before = view.project([1, 2, 3]);
  view.orbit(0, 120);
  assert.ok(view._direction()[1] < 0, 'Dragging through top view crosses the pole');
  assert.ok(distance(before, view.project([1, 2, 3])) > 3);
  view.setView('front');
  view.orbit(0, -120);
  assert.ok(view.camera.pitch < 0, 'Dragging through the horizon keeps rotating');
});

test('all camera presets and upside-down views keep each container extent on screen', () => {
  for (const dims of [
    [8, 8, 18],
    [18, 8, 8],
    [8, 18, 8],
  ]) {
    const view = renderer(dims);
    for (const preset of ['iso', 'top', 'front', 'side']) {
      view.setView(preset);
      for (const pitchOffset of [0, Math.PI / 2, Math.PI]) {
        const original = view.camera.pitch;
        view.camera.pitch += pitchOffset;
        view._fit();
        for (const point of view._corners()) {
          assert.ok(
            Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.depth),
          );
          assert.ok(point.x >= -0.01 && point.x <= view.width + 0.01, `${dims} ${preset}: X fits`);
          assert.ok(point.y >= -0.01 && point.y <= view.height + 0.01, `${dims} ${preset}: Y fits`);
        }
        view.camera.pitch = original;
      }
    }
  }
});

test('screen movement follows the same horizontal plane under perspective', () => {
  const anchor = [3.5, 3.5, 8];
  for (const preset of ['iso', 'top', 'side']) {
    const view = renderer();
    view.setView(preset);
    view._fit();
    for (const [x, y] of [
      [0.2, 0],
      [0, 0.2],
      [-0.15, 0.12],
    ]) {
      const start = view.project(anchor);
      const end = view.project([anchor[0] + x, anchor[1] + y, anchor[2]]);
      const delta = view.planeDelta(end.x - start.x, end.y - start.y, anchor);
      assert.ok(Math.abs(delta.x - x) < 0.001, `${preset}: dragged X follows the projected plane`);
      assert.ok(Math.abs(delta.y - y) < 0.001, `${preset}: dragged Y follows the projected plane`);
    }
  }
});

test('adjacent cube faces reach the same plane without a recessed connection edge', () => {
  for (let axis = 0; axis < 3; axis++) {
    const positive = cubeGeometry(1 << (axis * 2 + 1));
    const negative = cubeGeometry(1 << (axis * 2));
    for (const [mesh, sign] of [
      [positive, 1],
      [negative, -1],
    ]) {
      const edge = mesh
        .flatMap((f) => f.vertices)
        .filter((v) => Math.abs(v[axis] - sign * 0.5) < 1e-10);
      assert(edge.length > 0);
      const other = [0, 1, 2].filter((a) => a !== axis);
      for (const a of other) assert(edge.some((v) => Math.abs(v[a] - 0.5) < 1e-10));
    }
    assert.strictEqual(positive, cubeGeometry(1 << (axis * 2 + 1)));
  }
});

test('grabbed near surfaces follow right and down drags through poles and upside-down views', () => {
  for (const pitch of [0.5, 1.56, 1.58, 2.2, -1.58])
    for (const [dx, dy] of [
      [2, 0],
      [0, 2],
    ]) {
      const view = renderer();
      view.camera.pitch = pitch;
      view._fit();
      const dir = view._direction(),
        center = view.dims.map((n) => n / 2);
      const radius = Math.min(
        ...dir.map((n, i) => (Math.abs(n) < 1e-8 ? Infinity : center[i] / Math.abs(n))),
      );
      const point = center.map((n, i) => n + radius * dir[i]),
        before = view.project(point);
      view.orbit(dx, dy);
      view._fit();
      const after = view.project(point);
      assert(dx ? after.x > before.x : after.y > before.y, `pitch ${pitch}, drag ${dx},${dy}`);
      assert(Math.abs(Math.hypot(...view._direction()) - 1) < 1e-10);
      assert(Math.abs(view.right.reduce((sum, n, i) => sum + n * view.down[i], 0)) < 1e-10);
    }
});

test('zoom preserves the pinch anchor, clamps safely, and resets to a fitted view', () => {
  const view = renderer(),
    point = [4, 3, 8],
    before = view.project(point);
  const target = { x: before.x + 17, y: before.y - 9 };
  view.magnify(1.6, before, target);
  const after = view.project(point);
  assert(distance(after, target) < 1e-8);
  const start = view.project([3.5, 3.5, 8]),
    end = view.project([3.7, 3.4, 8]);
  const delta = view.planeDelta(end.x - start.x, end.y - start.y, [3.5, 3.5, 8]);
  assert(Math.abs(delta.x - 0.2) < 1e-6 && Math.abs(delta.y + 0.1) < 1e-6);
  view.magnify(100);
  assert.equal(view.zoom, 2.5);
  const atLimit = view.project(point);
  view.magnify(2);
  assert(distance(atLimit, view.project(point)) < 1e-8);
  view.magnify(0.001);
  assert.equal(view.zoom, 0.75);
  view.resetZoom();
  view._fit();
  assert.equal(view.zoom, 1);
  assert.deepEqual(view.pan, { x: 0, y: 0 });
});

test('near-horizontal movement preserves the visible direction after camera roll', () => {
  const view = renderer();
  view.setView('front');
  view._fit();
  view.right = [0, 0, 1];
  view.down = [1, 0, 0];
  view.eyeDirection = [0, 1, 0];
  view._fit();
  const point = view.dims.map((n) => n / 2),
    before = view.project(point),
    delta = view.planeDelta(0, 20, point);
  const after = view.project([point[0] + delta.x, point[1] + delta.y, point[2]]);
  assert(after.y > before.y);
  assert(Math.abs(after.x - before.x) < 1e-8);
  assert(Math.hypot(delta.x, delta.y) < 3);
});
