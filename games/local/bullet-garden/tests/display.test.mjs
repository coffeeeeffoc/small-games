import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clientToElement,
  elementToClient,
  landscapeViewport,
  isMiniGameRuntime,
} from '../src/display.mjs';
import { GardenRenderer } from '../src/renderer.mjs';

function element({ rotated, width = 844, height = 390, left = 0, top = 0, scale = 1 }) {
  const rect = {
    left,
    top,
    width: (rotated ? height : width) * scale,
    height: (rotated ? width : height) * scale,
  };
  rect.right = rect.left + rect.width;
  return {
    clientWidth: width,
    clientHeight: height,
    closest: () => (rotated ? {} : null),
    getBoundingClientRect: () => rect,
  };
}

test('phone viewport becomes landscape automatically while desktop and native landscape remain upright', () => {
  assert.deepEqual(landscapeViewport(390, 844, true), { width: 844, height: 390, rotated: true });
  assert.deepEqual(landscapeViewport(844, 390, true), { width: 844, height: 390, rotated: false });
  assert.deepEqual(landscapeViewport(800, 1000, false), {
    width: 800,
    height: 1000,
    rotated: false,
  });
});

test('all four rotated corners and an interior point map back to the same logical game position', () => {
  for (const rotated of [true, false]) {
    for (const scale of [1, 0.8]) {
      const canvas = element({ rotated, scale, left: 21, top: 38 });
      for (const point of [
        { x: 0, y: 0 },
        { x: 844, y: 0 },
        { x: 0, y: 390 },
        { x: 844, y: 390 },
        { x: 450, y: 215 },
      ]) {
        const client = elementToClient(canvas, point.x, point.y);
        const result = clientToElement(canvas, client.x, client.y);
        assert.ok(Math.abs(result.x - point.x) < 1e-8);
        assert.ok(Math.abs(result.y - point.y) < 1e-8);
      }
    }
  }
});

test('touch to the physical bottom moves a clockwise-rotated joystick right in game coordinates', () => {
  const joystick = element({ rotated: true, width: 90, height: 90, left: 260, top: 17 });
  const center = elementToClient(joystick, 45, 45);
  const dragged = clientToElement(joystick, center.x, center.y + 20);
  assert.deepEqual(dragged, { x: 65, y: 45 });
  const up = clientToElement(joystick, center.x + 20, center.y);
  assert.deepEqual(up, { x: 45, y: 25 });
});

test('rotated skill target applies camera and world scale after pointer conversion', () => {
  const renderer = {
    canvas: element({ rotated: true, left: 4, top: 8 }),
    offsetX: 18,
    offsetY: -45,
    scale: 0.5,
  };
  const client = elementToClient(renderer.canvas, 468, 215);
  const world = GardenRenderer.prototype.screenToWorld.call(renderer, client.x, client.y);
  assert.deepEqual(world, { x: 900, y: 520 });
});

test('rotated arena backing store follows its logical landscape size and preserves DPR cap', () => {
  const previous = globalThis.window;
  globalThis.window = { innerWidth: 390, innerHeight: 844, devicePixelRatio: 3 };
  try {
    const renderer = {
      canvas: { ...element({ rotated: true, width: 844, height: 266 }), width: 1, height: 1 },
      updateCamera() {},
    };
    GardenRenderer.prototype.resize.call(renderer);
    assert.deepEqual([renderer.width, renderer.height], [844, 266]);
    assert.deepEqual([renderer.canvas.width, renderer.canvas.height], [1688, 532]);
    assert.equal(renderer.dpr, 2);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

test('mini-game entry markers and native canvas SDK hide the web control, ordinary WeChat browser does not', () => {
  assert.equal(isMiniGameRuntime({}, '?runtime=minigame'), true);
  assert.equal(isMiniGameRuntime({}, '?platform=wechatgame'), true);
  assert.equal(isMiniGameRuntime({}, '?platform=bytedance-mini-game'), true);
  assert.equal(isMiniGameRuntime({ wx: { createCanvas() {}, getSystemInfoSync() {} } }), true);
  assert.equal(isMiniGameRuntime({ wx: { ready() {}, config() {} } }), false);
  assert.equal(isMiniGameRuntime({}, '?dev=1'), false);
  assert.equal(isMiniGameRuntime({}, '?runtime=web'), false);
});
