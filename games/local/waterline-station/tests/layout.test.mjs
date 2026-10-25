import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../levels.mjs';
import { getBoardLayout, unlockedThrough, starCount } from '../layout.mjs';
for (const [width, height] of [
  [320, 568],
  [360, 640],
  [390, 844],
  [480, 900],
  [568, 320],
  [844, 390],
  [1000, 600],
])
  test(`all 50 Cocos stations fit touch targets at ${width}×${height}`, () => {
    for (const level of LEVELS) {
      const b = getBoardLayout(level, width, height);
      assert.equal(b.valves.length, level.gates.length);
      for (const v of b.valves) {
        assert.ok(v.size >= 44);
        assert.ok(v.x - 25 >= 0 && v.x + 25 <= width, level.id);
        assert.ok(v.y + 25 <= height, `${level.id} bottom ${v.y}`);
        assert.ok(v.y - 25 >= b.tankBottom, level.id);
      }
      for (let i = 0; i < b.valves.length; i++)
        for (const v of b.valves.slice(i + 1)) {
          const u = b.valves[i];
          assert.ok(Math.abs(u.x - v.x) >= 52 || Math.abs(u.y - v.y) >= 52, level.id);
        }
      for (const t of b.tanks)
        assert.ok(t.width >= 35 && t.height >= 60 && Number.isFinite(t.x), level.id);
    }
  });
test('sequential unlocks retain legacy selected/best and do not shrink on revisit', () => {
  assert.equal(unlockedThrough({ selected: 0, best: {} }, LEVELS), 0);
  assert.equal(unlockedThrough({ selected: 0, best: { [LEVELS[2].id]: 3 } }, LEVELS), 3);
  assert.equal(unlockedThrough({ selected: 44, best: {} }, LEVELS), 44);
  assert.equal(unlockedThrough({ selected: 0, unlocked: 44, best: {} }, LEVELS), 44);
  assert.equal(starCount(LEVELS[0], 1), 3);
});
