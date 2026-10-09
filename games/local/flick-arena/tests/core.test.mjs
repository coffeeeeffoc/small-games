import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatch,
  shoot,
  step,
  chooseBot,
  physics,
  arenaRadius,
  nextArenaRadius,
  shotDistance,
} from '../src/core.mjs';
import { layouts, validateLayouts } from '../src/layouts.mjs';
import { readSave, settle } from '../src/progress.mjs';
function finish(s) {
  for (let i = 0; i < 1000 && ['moving', 'shrinking'].includes(s.phase); i++) step(s);
  assert(!['moving', 'shrinking'].includes(s.phase));
}
test('five safe approach configurations preserve saved layout ids', () => {
  assert.equal(validateLayouts(layouts).length, 5);
  assert.deepEqual(
    layouts.map((l) => l.id),
    ['first-push', 'triangle', 'chain', 'edge', 'cross'],
  );
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
  for (const layout of layouts)
    for (const [x, y] of layout.points) assert(Math.hypot(x, y) < physics.radius * 0.67);
});
test('all opening full-force direct shots need an approach and cannot knock out a rival', () => {
  for (const layout of layouts)
    for (const id of [1, 2]) {
      const s = createMatch(layout),
        a = s.discs[0],
        target = s.discs[id];
      shoot(s, target.x - a.x, target.y - a.y, 1);
      finish(s);
      assert(
        s.discs.every((d) => d.alive),
        `${layout.id}:${id}`,
      );
      assert.equal(
        s.events.some((e) => e.type === 'hit'),
        false,
      );
    }
});
test('distance preview matches actual fixed-step travel and shorter power has shorter reach', () => {
  let previous = 0;
  for (const power of [0.08, 0.25, 0.5, 0.75, 1]) {
    const s = createMatch();
    Object.assign(s.discs[0], { x: -60, y: 0 });
    Object.assign(s.discs[1], { x: 0, y: 100 });
    Object.assign(s.discs[2], { x: 0, y: -100 });
    shoot(s, 1, 0, power);
    finish(s);
    const distance = s.discs[0].x + 60;
    assert(Math.abs(distance - shotDistance(power)) < 1e-9);
    assert(distance > previous);
    previous = distance;
  }
  assert(shotDistance(1) > 110 && shotDistance(1) < 125);
  assert.equal(shotDistance(0), 0);
  assert.equal(shotDistance(NaN), 0);
});
test('partial overhang survives; entire disc crossing uses the current ring radius', () => {
  const s = createMatch();
  s.radius = 115;
  s.discs[1].x = arenaRadius(s) + physics.puck - 0.01;
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
  Object.assign(s.discs[1], { x: 0, y: 21.5 });
  Object.assign(s.discs[2], { x: -110, y: 0 });
  shoot(s, 0, -1, 0.5);
  const energy = s.discs[0].vy ** 2;
  step(s);
  assert(s.discs[1].vy < -80);
  assert(Math.abs(s.discs[0].vy) < 20);
  assert(s.discs.reduce((n, d) => n + d.vx ** 2 + d.vy ** 2, 0) <= energy);
});
test('central hits build position; outward full force still risks self elimination', () => {
  for (const power of [0.35, 1]) {
    const s = createMatch();
    Object.assign(s.discs[0], { x: 0, y: 35 });
    Object.assign(s.discs[1], { x: 0, y: -2 });
    shoot(s, 0, -1, power);
    finish(s);
    assert(s.discs[1].y < -2);
    assert(s.discs.every((d) => d.alive));
  }
  const hard = createMatch();
  shoot(hard, 0, 1, 1);
  finish(hard);
  assert.equal(hard.discs[0].alive, false);
});
test('accurate edge-side chain shot can finish two rivals before shrink starts', () => {
  const s = createMatch();
  [
    [0, -95],
    [-13, -159],
    [13, -159],
  ].forEach(([x, y], i) => Object.assign(s.discs[i], { x, y }));
  shoot(s, 0, -1, 1);
  finish(s);
  assert.equal(s.discs.filter((d) => !d.alive).length, 2);
  assert.equal(s.winner, 0);
  assert.equal(s.turn, 1);
  assert(s.events.filter((e) => e.type === 'hit').length >= 2);
});
test('turns skip eliminated actors, count player actions, and wait until motion stops', () => {
  const s = createMatch();
  s.discs[1].alive = false;
  shoot(s, 1, 0, 0.1);
  assert.equal(s.active, 0);
  assert.equal(s.playerShots, 1);
  finish(s);
  assert.equal(s.active, 2);
  shoot(s, 1, 0, 0.1);
  finish(s);
  assert.equal(s.active, 0);
  assert.equal(s.turn, 2);
  assert.equal(s.playerShots, 1);
});
test('simultaneous last falls draw, no winner is chosen while moving', () => {
  const s = createMatch();
  s.discs[2].alive = false;
  const out = arenaRadius(s) + physics.puck + 1;
  Object.assign(s.discs[0], { x: out, y: 0, vx: 300 });
  Object.assign(s.discs[1], { x: -out, y: 0, vx: -300 });
  s.phase = 'moving';
  step(s);
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, -1);
});
test('five whole rounds remain safe, then previewed contraction animates before the next shot', () => {
  const s = createMatch();
  for (let i = 0; i < 14; i++) {
    shoot(s, 0, -1, 0.08);
    finish(s);
    assert.equal(arenaRadius(s), physics.radius);
  }
  assert.equal(s.turn, 5);
  assert(nextArenaRadius(s) < arenaRadius(s));
  shoot(s, 0, -1, 0.08);
  while (s.phase === 'moving') step(s);
  assert.equal(s.phase, 'shrinking');
  assert.equal(s.turn, 6);
  const target = nextArenaRadius(s),
    radius = arenaRadius(s);
  assert.equal(shoot(s, 1, 0, 0.5), false);
  step(s);
  assert(arenaRadius(s) < radius && arenaRadius(s) > target);
  assert.equal(nextArenaRadius(s), target);
  finish(s);
  assert.equal(arenaRadius(s), target);
  assert.equal(s.active, 0);
  assert.equal(s.phase, 'aim');
  s.turn = 1000;
  assert(nextArenaRadius(s) > 0);
});
test('contraction can eliminate an idle overhanging rival and records the reason', () => {
  const s = createMatch();
  s.turn = 5;
  s.active = 2;
  Object.assign(s.discs[1], { x: physics.radius + physics.puck - 2, y: 0 });
  shoot(s, 1, 0, 0.08);
  finish(s);
  assert.equal(s.discs[1].alive, false);
  assert(s.events.some((e) => e.type === 'out' && e.id === 1 && e.reason === 'ring'));
});
test('shrinking resolves the whole warning circle before declaring a surviving winner', () => {
  const s = createMatch();
  s.discs[2].alive = false;
  Object.assign(s.discs[0], { x: 161, y: 0 });
  Object.assign(s.discs[1], { x: -162, y: 0 });
  s.phase = 'shrinking';
  s.shrink = {
    fromRadius: physics.radius,
    targetRadius: physics.radius - physics.shrinkPerRound,
    progress: 0,
    duration: physics.shrinkDuration,
    nextActive: 0,
  };
  while (s.discs[1].alive) step(s);
  assert.equal(s.discs[0].alive, true);
  assert.equal(s.phase, 'shrinking');
  finish(s);
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, -1);
});
test('deterministic bot matches finish with several player attempts across all layouts', () => {
  const attempts = [];
  let wins = 0,
    maxShots = 0;
  for (const layout of layouts)
    for (let seed = 1; seed <= 60; seed++) {
      const s = createMatch(layout, seed);
      for (let turn = 0; turn < 70 && s.phase !== 'over'; turn++) {
        const b = chooseBot(s);
        shoot(s, b.x, b.y, b.power);
        finish(s);
        s.events.length = 0;
      }
      assert.equal(s.phase, 'over', `${layout.id}:${seed}`);
      assert(s.playerShots >= 3, `${layout.id}:${seed} ended before several attempts`);
      maxShots = Math.max(maxShots, s.shots);
      attempts.push(s.playerShots);
      if (s.winner === 0) wins++;
    }
  attempts.sort((a, b) => a - b);
  assert(attempts[150] >= 4 && attempts[150] <= 8);
  assert(maxShots <= 45);
  assert(wins > 25 && wins < 180);
  console.log({ matches: 300, blueWins: wins, medianPlayerShots: attempts[150], maxShots });
});
test('same seed and fixed steps reproduce bot commands, ring state and outcomes', () => {
  const run = () => {
    const s = createMatch(layouts[2], 123);
    for (let i = 0; i < 25 && s.phase !== 'over'; i++) {
      const b = chooseBot(s);
      assert.deepEqual(b, chooseBot(s));
      shoot(s, b.x, b.y, b.power);
      finish(s);
    }
    return s;
  };
  assert.deepEqual(run(), run());
});
test('invalid commands preserve phase and attempts; progress is versioned and sanitized', () => {
  const s = createMatch();
  assert.equal(shoot(s, NaN, 1, 0.8), false);
  assert.equal(shoot(s, 0, 0, 1), false);
  assert.equal(s.phase, 'aim');
  assert.equal(s.playerShots, 0);
  assert.equal(chooseBot({ ...s, phase: 'moving' }), null);
  assert.deepEqual(readSave({ version: 9 }), { version: 1, played: 0, wins: 0, sound: true });
  assert.equal(settle(readSave(null), 0).wins, 1);
});
