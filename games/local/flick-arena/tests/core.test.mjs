import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, shoot, step, chooseBot, seeded, physics } from '../src/core.mjs';
import { layouts, validateLayouts } from '../src/layouts.mjs';
import { readSave, settle } from '../src/progress.mjs';
function finish(s) {
  for (let i = 0; i < 1000 && s.phase === 'moving'; i++) step(s);
  assert.notEqual(s.phase, 'moving');
}
test('five valid non-overlapping configurations and stable ids', () => {
  assert.equal(validateLayouts(layouts).length, 5);
  assert.throws(() => validateLayouts([layouts[0], layouts[0]]));
  assert.throws(() =>
    validateLayouts([
      {
        ...layouts[0],
        points: [
          [0, 0],
          [0, 0],
          [NaN, 0],
        ],
      },
    ]),
  );
});
test('partial overhang survives; entire disc crossing is eliminated', () => {
  const s = createMatch();
  s.discs[1].x = physics.radius + physics.puck - 0.01;
  s.discs[1].y = 0;
  shoot(s, 0, -1, 0.1);
  step(s);
  assert.equal(s.discs[1].alive, true);
  s.discs[1].x += 0.02;
  step(s);
  assert.equal(s.discs[1].alive, false);
});
test('equal-mass head-on impact transfers momentum with bounded energy', () => {
  const s = createMatch();
  Object.assign(s.discs[0], { x: 0, y: 50 });
  Object.assign(s.discs[1], { x: 0, y: 11 });
  Object.assign(s.discs[2], { x: -110, y: 0 });
  shoot(s, 0, -1, 0.5);
  const energy = s.discs[0].vy ** 2;
  step(s);
  assert(s.discs[1].vy < -100);
  assert(Math.abs(s.discs[0].vy) < 20);
  assert(s.discs.reduce((n, d) => n + d.vx ** 2 + d.vy ** 2, 0) <= energy);
});
test('soft shot nudges a rival and high force risks self elimination', () => {
  const s = createMatch();
  Object.assign(s.discs[0], { x: 0, y: 35 });
  Object.assign(s.discs[1], { x: 0, y: -15 });
  shoot(s, 0, -1, 0.35);
  finish(s);
  assert(s.discs[1].y < -15);
  assert(s.discs[1].alive);
  const hard = createMatch();
  shoot(hard, 0, 1, 1);
  finish(hard);
  assert.equal(hard.discs[0].alive, false);
});
test('chain collision can remove two discs with one shot', () => {
  const s = createMatch();
  [
    [0, 55],
    [-21, -122],
    [21, -122],
  ].forEach(([x, y], i) => Object.assign(s.discs[i], { x, y }));
  shoot(s, 0, -1, 1);
  finish(s);
  assert.equal(s.discs.filter((d) => !d.alive).length, 2);
  assert.equal(s.winner, 0);
  assert(s.events.filter((e) => e.type === 'hit').length >= 2);
});
test('turns skip eliminated actors and wait until all motion stops', () => {
  const s = createMatch();
  s.discs[1].alive = false;
  shoot(s, 1, 0, 0.1);
  assert.equal(s.active, 0);
  finish(s);
  assert.equal(s.active, 2);
  shoot(s, 1, 0, 0.1);
  finish(s);
  assert.equal(s.active, 0);
  assert.equal(s.turn, 2);
});
test('simultaneous last falls draw, no winner chosen while moving', () => {
  const s = createMatch();
  s.discs[2].alive = false;
  Object.assign(s.discs[0], { x: 176, y: 0, vx: 300 });
  Object.assign(s.discs[1], { x: -176, y: 0, vx: -300 });
  s.phase = 'moving';
  step(s);
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, -1);
});
test('deterministic bot matches finish on all layouts across seeds', () => {
  let wins = 0,
    max = 0;
  for (const layout of layouts)
    for (let seed = 1; seed <= 60; seed++) {
      const s = createMatch(layout, seed),
        random = seeded(seed);
      for (let turn = 0; turn < 120 && s.phase !== 'over'; turn++) {
        const b = chooseBot(s, random);
        shoot(s, b.x, b.y, b.power);
        finish(s);
      }
      assert.equal(s.phase, 'over', layout.id + ':' + seed);
      max = Math.max(max, s.shots);
      if (s.winner === 0) wins++;
    }
  assert(wins > 25 && wins < 180);
  console.log({ matches: 300, blueWins: wins, maxShots: max });
});
test('same seed and fixed steps reproduce outcomes', () => {
  const run = () => {
    const s = createMatch(layouts[2], 123),
      r = seeded(123);
    for (let i = 0; i < 8 && s.phase !== 'over'; i++) {
      const b = chooseBot(s, r);
      shoot(s, b.x, b.y, b.power);
      finish(s);
    }
    return s;
  };
  assert.deepEqual(run(), run());
});
test('invalid commands do not mutate phase; progress is versioned and sanitized', () => {
  const s = createMatch();
  assert.equal(shoot(s, NaN, 1, 0.8), false);
  assert.equal(shoot(s, 0, 0, 1), false);
  assert.equal(s.phase, 'aim');
  assert.deepEqual(readSave({ version: 9 }), { version: 1, played: 0, wins: 0, sound: true });
  assert.equal(settle(readSave(null), 0).wins, 1);
});
