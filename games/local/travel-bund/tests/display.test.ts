import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientDelta, clientToElement, landscapeViewport } from '../src/display.ts';

function element({ rotated, width = 844, height = 390, scale = 1, left = 17, top = 31 }) {
  const rect = {
    left,
    top,
    width: (rotated ? height : width) * scale,
    height: (rotated ? width : height) * scale,
    right: left + (rotated ? height : width) * scale,
  };
  return {
    clientWidth: width,
    clientHeight: height,
    closest: () => (rotated ? {} : null),
    getBoundingClientRect: () => rect,
  } as unknown as HTMLElement;
}

test('a portrait touch viewport keeps the complete game in logical landscape', () => {
  assert.deepEqual(landscapeViewport(390, 844, true), { width: 844, height: 390, rotated: true });
  assert.deepEqual(landscapeViewport(320, 568, true), { width: 568, height: 320, rotated: true });
  assert.deepEqual(landscapeViewport(844, 390, true), { width: 844, height: 390, rotated: false });
  assert.deepEqual(landscapeViewport(900, 1100, false), {
    width: 900,
    height: 1100,
    rotated: false,
  });
  assert.deepEqual(landscapeViewport(568, 568, true), { width: 568, height: 568, rotated: false });
});

test('rotation maps all corners and interior touches onto an offset, scaled game', () => {
  for (const rotated of [true, false]) {
    for (const scale of [1, 0.75]) {
      const game = element({ rotated, scale });
      // These physical coordinates are the clockwise CSS transform of the
      // logical test points, calculated independently of the input helper.
      for (const [x, y] of [
        [0, 0],
        [844, 0],
        [0, 390],
        [844, 390],
        [207, 119],
      ]) {
        const physicalX = 17 + (rotated ? 390 - y : x) * scale;
        const physicalY = 31 + (rotated ? x : y) * scale;
        const result = clientToElement(game, physicalX, physicalY);
        assert(Math.abs(result.x - x) < 1e-8, `${rotated}/${scale}: logical x at ${x},${y}`);
        assert(Math.abs(result.y - y) < 1e-8, `${rotated}/${scale}: logical y at ${x},${y}`);
      }
    }
  }
});

test('a rotated joystick receives forward and sideways input in its own axes', () => {
  const joystick = element({ rotated: true, width: 104, height: 104, left: 250, top: 23 });
  const center = { x: 302, y: 75 };
  assert.deepEqual(clientToElement(joystick, center.x, center.y), { x: 52, y: 52 });
  assert.deepEqual(clientToElement(joystick, center.x + 30, center.y), { x: 52, y: 22 });
  assert.deepEqual(clientToElement(joystick, center.x, center.y + 30), { x: 82, y: 52 });
});

test('camera drag converts both axes without changing distance or sign convention', () => {
  assert.deepEqual(clientDelta(20, 35, false), [20, 35]);
  assert.deepEqual(clientDelta(20, 35, true), [35, -20]);
  assert.deepEqual(clientDelta(-20, -35, true), [-35, 20]);
  for (const [x, y] of [
    [0, 12],
    [12, 0],
    [-30, 40],
  ]) {
    const [logicalX, logicalY] = clientDelta(x, y, true);
    assert.equal(Math.hypot(logicalX, logicalY), Math.hypot(x, y));
  }
});
