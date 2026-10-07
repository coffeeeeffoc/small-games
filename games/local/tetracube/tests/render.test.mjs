import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../src/render.mjs';

const renderer = (dims = [8, 8, 18]) => {
  const value = new Renderer({ getContext: () => ({}) });
  value.dims = [...dims];
  value.width = 390;
  value.height = 500;
  value._fit();
  return value;
};
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

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
  assert.ok(view.camera.pitch > Math.PI / 2, 'Dragging through top view keeps rotating');
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
