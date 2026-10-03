import test from 'node:test';
import assert from 'node:assert/strict';
import { panelEndpoints } from '../src/acoustics.js';
import {
  movePanel,
  resizePanel,
  resizeRoom,
  adjustPanelAcoustics,
  layoutPanelHandles,
} from '../src/editor-geometry.js';

const room = { width: 24, height: 18 };
const start = { x: 12, y: 9, angle: 35, length: 8 };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7);
const inside = (panel) => {
  for (const point of panelEndpoints(panel)) {
    assert.ok(point.x >= 0.2 - 1e-7 && point.x <= room.width - 0.2 + 1e-7);
    assert.ok(point.y >= 0.2 - 1e-7 && point.y <= room.height - 0.2 + 1e-7);
  }
};

test('angled movement retains the selected panel axis even at room boundaries', () => {
  const radians = (start.angle * Math.PI) / 180;
  for (const mode of ['parallel', 'perpendicular']) {
    const axis =
      mode === 'parallel'
        ? { x: Math.cos(radians), y: Math.sin(radians) }
        : { x: -Math.sin(radians), y: Math.cos(radians) };
    for (const target of [
      { x: 15, y: 12 },
      { x: 1000, y: 1000 },
      { x: -1000, y: -1000 },
    ]) {
      const moved = movePanel(start, start, target, mode, room);
      near((moved.x - start.x) * axis.y - (moved.y - start.y) * axis.x, 0);
      inside({ ...start, ...moved });
    }
    const normal = { x: start.x - axis.y * 3, y: start.y + axis.x * 3 };
    const unchanged = movePanel(start, start, normal, mode, room);
    near(unchanged.x, start.x);
    near(unchanged.y, start.y);
  }
});

test('endpoint resizing anchors the opposite end and preserves orientation and room bounds', () => {
  const ends = panelEndpoints(start);
  for (const endpoint of [0, 1]) {
    for (const pointer of [{ x: 40, y: 40 }, { x: -30, y: -30 }, start]) {
      const resized = { ...start, ...resizePanel(start, endpoint, pointer, room) };
      const anchor = panelEndpoints(resized)[1 - endpoint];
      near(anchor.x, ends[1 - endpoint].x);
      near(anchor.y, ends[1 - endpoint].y);
      assert.equal(resized.angle, start.angle);
      assert.ok(resized.length >= 0.8);
      inside(resized);
    }
  }
});

test('room handle deltas stay within supported sizes and change only the chosen axis', () => {
  assert.deepEqual(resizeRoom(room, { x: 3, y: -2 }, 'width'), { width: 27, height: 18 });
  assert.deepEqual(resizeRoom(room, { x: 3, y: -2 }, 'height'), { width: 24, height: 16 });
  assert.deepEqual(resizeRoom(room, { x: -100, y: 300 }), { width: 8, height: 100 });
  assert.deepEqual(resizeRoom(room, { x: 300, y: -100 }), { width: 120, height: 8 });
});

test('sound handle follows angled board axes and respects material limits at different zooms', () => {
  const panel = { ...start, reflection: 0.5, scatter: 35, type: 'reflector' };
  const radians = (panel.angle * Math.PI) / 180;
  for (const zoom of [2, 15]) {
    const along = adjustPanelAcoustics(
      panel,
      { x: Math.cos(radians) * 4, y: Math.sin(radians) * 4 },
      zoom,
    );
    assert.ok(along.reflection > panel.reflection);
    near(along.scatter, panel.scatter);
    const across = adjustPanelAcoustics(
      panel,
      { x: -Math.sin(radians) * 4, y: Math.cos(radians) * 4 },
      zoom,
    );
    near(across.reflection, panel.reflection);
    assert.ok(across.scatter > panel.scatter);
  }
  for (const type of ['reflector', 'absorber']) {
    const material = { ...panel, type, reflection: 0.1 };
    const loud = adjustPanelAcoustics(
      material,
      { x: Math.cos(radians) * 1000, y: Math.sin(radians) * 1000 },
      15,
    );
    const quiet = adjustPanelAcoustics(
      material,
      { x: -Math.cos(radians) * 1000, y: -Math.sin(radians) * 1000 },
      15,
    );
    assert.equal(loud.reflection, type === 'absorber' ? 0.2 : 0.95);
    assert.equal(quiet.reflection, 0);
  }
});

test('short-board handles stay visible and separated at every viewport edge', () => {
  for (const screenScale of [0.3, 0.36, 0.6, 1]) {
    for (const center of [
      { x: 86, y: 90 },
      { x: 914, y: 90 },
      { x: 86, y: 550 },
      { x: 914, y: 550 },
      { x: 500, y: 320 },
    ]) {
      for (const angle of [0, 35, 90, 135, 225, 300]) {
        const endpoints = panelEndpoints({ ...center, length: 8, angle });
        const layout = layoutPanelHandles(center, endpoints, angle, screenScale);
        const controls = [...layout.endpoints, layout.rotation, layout.acoustics];
        const occupied = [center];
        for (const point of controls) {
          assert.ok(point.x * screenScale >= 22 - 1e-7);
          assert.ok((1000 - point.x) * screenScale >= 22 - 1e-7);
          assert.ok(point.y * screenScale >= 22 - 1e-7);
          assert.ok((640 - point.y) * screenScale >= 22 - 1e-7);
          for (const other of occupied) {
            assert.ok(Math.hypot(point.x - other.x, point.y - other.y) * screenScale >= 44 - 1e-5);
          }
          occupied.push(point);
        }
      }
    }
  }
});
