import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_FOV, MAX_ZOOM, MIN_ZOOM, wheelZoom, zoomFov } from '../src/camera-controls.ts';

test('zoom magnifies the image with a bounded perspective field of view', () => {
  assert.equal(zoomFov(1), DEFAULT_FOV);
  const magnification = Math.tan(DEFAULT_FOV * Math.PI / 360) / Math.tan(zoomFov(2) * Math.PI / 360);
  assert(Math.abs(magnification - 2) < 1e-10);
  assert.equal(zoomFov(100), zoomFov(MAX_ZOOM));
  assert.equal(zoomFov(0.01), zoomFov(MIN_ZOOM));
});

test('wheel pixel, line and page deltas zoom in the same direction and stay bounded', () => {
  assert.equal(wheelZoom(1, -16, 0, 800), wheelZoom(1, -1, 1, 800));
  assert.equal(wheelZoom(1, 800, 0, 800), wheelZoom(1, 1, 2, 800));
  assert(wheelZoom(1, -100, 0, 800) > 1);
  assert(wheelZoom(1, 100, 0, 800) < 1);
  assert.equal(wheelZoom(MAX_ZOOM, -300, 0, 800), MAX_ZOOM);
  assert.equal(wheelZoom(MIN_ZOOM, 300, 0, 800), MIN_ZOOM);
});
