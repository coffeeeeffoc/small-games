import assert from 'node:assert/strict';
import test from 'node:test';
import { createAimGesture, updateAimGesture, settleAimGesture } from '../src/aim.mjs';
import { aimPreview } from '../src/core.mjs';

const degrees = (shot) => (Math.atan2(shot.dx, -shot.dy) * 180) / Math.PI;
const coin = (x = 500, y = 400, pocketed = false) => ({ x, y, r: 18, pocketed });
function gesture(width = 390, coins = [coin()]) {
  const scale = width / 1000;
  const game = { striker: { x: 500, y: 790, r: 24 }, coins };
  const g = createAimGesture(1, 500, 790, scale, 0, game);
  const point = (x, y) => ({ x: 500 + x / scale, y: 790 + y / scale });
  return { g, point, game };
}

test('pixel dead zone accumulates deliberate movement without short-pull angle amplification', () => {
  for (const width of [306, 376, 358]) {
    const { g, point } = gesture(width);
    const initial = updateAimGesture(g, point(0, 12), 10);
    for (const x of [0.5, -1, 1.5, 0]) assert.equal(updateAimGesture(g, point(x, 12), 20), initial);
    const adjusted = updateAimGesture(g, point(4, 12), 30);
    assert(degrees(adjusted) < -0.5 && degrees(adjusted) > -0.8);
    assert(Math.abs(degrees(adjusted)) < (Math.atan2(4, 12) * 180) / Math.PI / 10);
  }
});

test('a resting fingertip lift keeps the displayed shot; a held small adjustment settles once', () => {
  const { g, point } = gesture();
  const initial = updateAimGesture(g, point(0, 30), 10);
  assert.equal(updateAimGesture(g, point(4, 30), 160), initial);
  assert.equal(settleAimGesture(g, 220), initial);
  const adjusted = settleAimGesture(g, 230);
  assert.notEqual(adjusted, initial);
  assert(Math.abs(degrees(adjusted)) < 1);
  assert.equal(settleAimGesture(g, 2000), adjusted);
});

test('transient jitter returning to the accepted point is discarded', () => {
  const { g, point } = gesture();
  const initial = updateAimGesture(g, point(0, 40), 10);
  updateAimGesture(g, point(4, 40), 160);
  assert.equal(updateAimGesture(g, point(0.5, 40), 180), initial);
  assert.equal(settleAimGesture(g, 400), initial);
});

test('large deliberate movement stays responsive and crossing the angle wrap is continuous', () => {
  const { g, point } = gesture(390, [coin(250, 790)]);
  const initial = updateAimGesture(g, point(60, 1), 10);
  const next = updateAimGesture(g, point(60, -8), 160);
  assert.notEqual(next, initial);
  assert(Math.abs(degrees(next) - degrees(initial)) < 3);
  // Direction near ±π must take the short rotation, not flip around the board.
  const other = gesture(390, [coin(250, 790)]);
  const a = updateAimGesture(other.g, other.point(60, -1), 10);
  const b = updateAimGesture(other.g, other.point(60, 8), 20);
  assert(Math.abs(degrees(b) - degrees(a)) < 3);
});

test('returning to the origin cancels power and a new pull sets a fresh coarse direction', () => {
  const { g, point } = gesture();
  updateAimGesture(g, point(0, 50), 10);
  const cancelled = updateAimGesture(g, point(1, 2), 160);
  assert.equal(cancelled.power, 0);
  assert.equal(g.pending, null);
  const next = updateAimGesture(g, point(40, 0), 170);
  assert(Math.abs(degrees(next) + 90) < 1e-10);
});

test('free aim follows deliberate movement while a real target enables fine adjustment', () => {
  const free = gesture(390, []),
    targeted = gesture();
  updateAimGesture(free.g, free.point(0, 80), 10);
  updateAimGesture(targeted.g, targeted.point(0, 80), 10);
  const fast = updateAimGesture(free.g, free.point(12, 80), 20),
    fine = updateAimGesture(targeted.g, targeted.point(12, 80), 20);
  assert(Math.abs(degrees(fast) + (Math.atan2(12, 80) * 180) / Math.PI) < 1e-10);
  assert(Math.abs(degrees(fine)) < 2);
  assert(Math.abs(degrees(fast)) > Math.abs(degrees(fine)) * 4);
});

test('missed, pocketed and rail-occluded coins do not slow free aim', () => {
  for (const coins of [[coin(800, 400)], [coin(500, 400, true)], [coin(500, 20)]]) {
    const { g, point } = gesture(390, coins);
    updateAimGesture(g, point(0, 80), 10);
    const next = updateAimGesture(g, point(12, 80), 20);
    assert(Math.abs(degrees(next)) > 8);
  }
});

test('acquiring and leaving a target changes gain without snapping the accepted angle', () => {
  const { g, point, game } = gesture(390, [coin(600, 400)]);
  updateAimGesture(g, point(0, 80), 10);
  const acquired = updateAimGesture(g, point(-20, 80), 20);
  assert(aimPreview(game, acquired.dx, acquired.dy).hit);
  const fine = updateAimGesture(g, point(-30, 80), 30);
  assert(degrees(fine) - degrees(acquired) < 1.5);
  const left = updateAimGesture(g, point(-100, 80), 40);
  assert.equal(aimPreview(game, left.dx, left.dy).hit, null);
  const free = updateAimGesture(g, point(-120, 80), 50);
  const rawDelta = ((Math.atan2(120, 80) - Math.atan2(100, 80)) * 180) / Math.PI;
  assert(Math.abs(degrees(free) - degrees(left) - rawDelta) < 1e-10);
  assert(degrees(free) < 30);
});

test('resting free aim also rejects release jitter and settles a held change only once', () => {
  const { g, point } = gesture(390, []);
  const initial = updateAimGesture(g, point(0, 80), 10);
  assert.equal(updateAimGesture(g, point(4, 80), 160), initial);
  assert.equal(settleAimGesture(g, 220), initial);
  const accepted = settleAimGesture(g, 230);
  assert(Math.abs(degrees(accepted)) > 2.5);
  assert.equal(settleAimGesture(g, 2000), accepted);
});
