import assert from 'node:assert/strict';
import test from 'node:test';
import {
  landscapeViewport,
  clientToElement,
  elementToClient,
  isMiniGameRuntime,
} from '../ui/display.mjs';

test('all portrait viewports receive a landscape layout without relying on rotation APIs', () => {
  assert.deepEqual(landscapeViewport(390, 844), { width: 844, height: 390, rotated: true });
  assert.deepEqual(landscapeViewport(844, 390), { width: 844, height: 390, rotated: false });
  assert.deepEqual(landscapeViewport(568, 320), { width: 568, height: 320, rotated: false });
});

function element(rotated, scale = 1) {
  const width = 160,
    height = 90;
  const rect = {
    left: 12,
    top: 24,
    width: (rotated ? height : width) * scale,
    height: (rotated ? width : height) * scale,
  };
  return {
    clientWidth: width,
    clientHeight: height,
    closest: () => (rotated ? {} : null),
    getBoundingClientRect: () => ({ ...rect, right: rect.left + rect.width }),
  };
}

for (const rotated of [false, true]) {
  test(`${rotated ? 'rotated' : 'physical landscape'} touch targets round-trip under scaling`, () => {
    for (const scale of [0.75, 1, 2]) {
      const target = element(rotated, scale);
      for (const point of [
        { x: 0, y: 0 },
        { x: 80, y: 45 },
        { x: 160, y: 90 },
        { x: 21, y: 73 },
      ]) {
        const client = elementToClient(target, point.x, point.y);
        const logical = clientToElement(target, client.x, client.y);
        assert.ok(Math.abs(logical.x - point.x) < 1e-9);
        assert.ok(Math.abs(logical.y - point.y) < 1e-9);
      }
    }
  });
}

test('clockwise layout maps logical rightward movement to downward physical drag', () => {
  const target = element(true);
  const begin = elementToClient(target, 80, 45);
  const end = elementToClient(target, 120, 45);
  assert.equal(end.x, begin.x);
  assert.equal(end.y - begin.y, 40);
  assert.deepEqual(clientToElement(target, end.x, end.y), { x: 120, y: 45 });
});

test('a WeChat browser is not mistaken for a native minigame host', () => {
  assert.equal(isMiniGameRuntime({ location: { search: '' }, wx: {} }), false);
  assert.equal(isMiniGameRuntime({ location: { search: '?runtime=wechat' } }), true);
  assert.equal(isMiniGameRuntime({ wx: { createCanvas() {}, getSystemInfoSync() {} } }), true);
});
