import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSTANTS,
  createState,
  isObserved,
  moveFrame,
  restore,
  snapshot,
  step,
} from '../engine.mjs';
import { LEVELS } from '../levels.mjs';
import { solveRoom } from './solutions.mjs';

const tick = (level, state, frames = 1, input = {}) => {
  for (let i = 0; i < frames; i++) step(level, state, input);
};
const fixture = (overrides) => ({
  id: 'test-room',
  spawn: { x: 100, y: 422 },
  frame: { x: 100, y: 250 },
  solids: [{ x: 0, y: 460, w: 960, h: 80 }],
  objects: [],
  switches: [],
  gates: [],
  exit: { x: 900, y: 398, w: 48, h: 62 },
  ...overrides,
});
const intersects = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

test('frame clamps to the world and observes the core, including its boundary', () => {
  const state = createState(LEVELS[0]);
  moveFrame(state, -200, 900);
  assert.deepEqual(state.frame, { x: 0, y: 270, w: 340, h: 270 });
  const robot = state.objects[0];
  moveFrame(state, robot.x + robot.w / 2, 270);
  assert.equal(isObserved(state, robot), true);
  moveFrame(state, robot.x + robot.w / 2 + 1, 270);
  assert.equal(isObserved(state, robot), false);
  assert.ok(robot.x + robot.w > state.frame.x, 'visible body edges do not activate a frozen core');
  moveFrame(state, 1000, -5);
  assert.equal(state.frame.x, 620);
  assert.equal(state.frame.y, 0);
});

test('unobserved machines preserve position and route phase while the player stays controllable', () => {
  const level = LEVELS[0],
    state = createState(level);
  tick(level, state, 20);
  moveFrame(state, 0, 0);
  const before = snapshot(state.objects[0]);
  const playerX = state.player.x;
  tick(level, state, 25, { right: true });
  assert.equal(state.objects[0].x, before.x);
  assert.equal(state.objects[0].y, before.y);
  assert.equal(state.objects[0].pathIndex, before.pathIndex);
  assert.equal(state.objects[0].direction, before.direction);
  assert.ok(state.player.x > playerX + 80);
  moveFrame(state, 145, 230);
  tick(level, state);
  assert.ok(state.objects[0].x > before.x);
});

test('robot weight keeps a switch and gate active after freezing', () => {
  const level = LEVELS[0],
    state = createState(level);
  tick(level, state, 126);
  assert.equal(state.switches[0].pressed, true);
  moveFrame(state, 0, 0);
  tick(level, state, 120);
  assert.equal(state.objects[0].active, false);
  assert.equal(state.switches[0].pressed, true);
  assert.equal(state.gates[0].open, true);
});

test('two-switch door uses AND and a closed gate blocks travel', () => {
  const level = LEVELS[4],
    state = createState(level);
  tick(level, state, 125);
  moveFrame(state, 0, 0);
  assert.equal(state.switches[0].pressed, true);
  assert.equal(state.switches[1].pressed, false);
  assert.equal(state.gates[0].open, false);
  const blockedLevel = fixture({
    gates: [{ id: 'gate', x: 300, y: 344, w: 24, h: 116, requires: ['missing-switch'] }],
  });
  const blocked = createState(blockedLevel);
  tick(blockedLevel, blocked, 200, { right: true });
  assert.equal(blocked.player.x, 274);
  assert.equal(blocked.status, 'playing');
});

test('moving robot pushes a stationary player instead of passing through', () => {
  const level = { ...LEVELS[0], spawn: { x: 270, y: 422 } },
    state = createState(level);
  tick(level, state, 60);
  assert.ok(state.player.x > 300);
  assert.equal(intersects(state.player, state.objects[0]), false);
});

test('a closing gate ejects an overlapping player to the nearest side', () => {
  const level = fixture({
    spawn: { x: 691, y: 422 },
    objects: [
      {
        id: 'weight',
        kind: 'robot',
        x: 250,
        y: 414,
        w: 42,
        h: 46,
        speed: 120,
        path: [
          { x: 250, y: 414 },
          { x: 400, y: 414 },
        ],
      },
    ],
    switches: [{ id: 'plate', x: 270.5, y: 453, w: 1, h: 7 }],
    gates: [{ id: 'gate', x: 700, y: 344, w: 24, h: 116, requires: ['plate'] }],
  });
  const state = createState(level);
  assert.equal(state.gates[0].open, true);
  tick(level, state);
  assert.equal(state.gates[0].open, false);
  assert.equal(state.player.x, 674);
  assert.equal(intersects(state.player, state.gates[0]), false);
  tick(level, state, 1, { left: true });
  assert.ok(state.player.x < 674, 'left input cannot teleport the player to the right side');
});

test('platform carries a grounded player, then allows a clean jump from an ascending lift', () => {
  const movingLevel = fixture({
    spawn: { x: 220, y: 362 },
    objects: [
      {
        id: 'platform',
        kind: 'platform',
        x: 200,
        y: 400,
        w: 140,
        h: 18,
        speed: 60,
        path: [
          { x: 200, y: 400 },
          { x: 700, y: 400 },
        ],
      },
    ],
  });
  const moving = createState(movingLevel);
  tick(movingLevel, moving, 2);
  assert.equal(moving.player.supportId, 'platform');
  const previousX = moving.player.x;
  tick(movingLevel, moving, 60);
  assert.ok(Math.abs(moving.player.x - previousX - 60) < 0.001);
  const liftLevel = { ...LEVELS[1], spawn: { x: 370, y: 412 } },
    lift = createState(liftLevel);
  tick(liftLevel, lift, 2);
  assert.equal(lift.player.supportId, 'lift');
  const takeoffX = lift.player.x;
  tick(liftLevel, lift, 1, { right: true, jump: true });
  assert.ok(lift.player.x > takeoffX && lift.player.x < takeoffX + 4);
  assert.ok(lift.player.vy < 0);
  assert.equal(lift.player.grounded, false);
});

test('frozen robot bodies are stable jumpable supports', () => {
  const level = { ...LEVELS[0], spawn: { x: 223, y: 376 }, frame: { x: 0, y: 0 } },
    state = createState(level);
  tick(level, state, 15);
  assert.equal(state.player.supportId, 'keeper');
  assert.equal(state.player.y + state.player.h, state.objects[0].y);
  tick(level, state, 1, { jump: true });
  assert.ok(state.player.vy < 0);
});

test('falling can be restored for free and replay is deterministic', () => {
  const level = fixture({ solids: [{ x: 0, y: 460, w: 160, h: 80 }] });
  const state = createState(level);
  tick(level, state, 2);
  const saved = snapshot(state);
  tick(level, state, 100, { right: true });
  assert.equal(state.status, 'lost');
  const lost = snapshot(state);
  tick(level, state, 10, { left: true, jump: true });
  assert.deepEqual(state, lost, 'lost states remain still until restart/undo');
  const sameReference = restore(state, saved);
  assert.equal(sameReference, state);
  assert.equal(state.status, 'playing');
  assert.deepEqual(state, saved);
  tick(level, state, 100, { right: true });
  assert.deepEqual(state, lost);
});

for (let index = 0; index < LEVELS.length; index++) {
  test(`room ${index + 1}: ${LEVELS[index].title} is solvable using only movement, jump and frame dragging`, () => {
    const first = solveRoom(index);
    assert.equal(first.status, 'won');
    assert.ok(first.switches.every((plate) => plate.pressed));
    const second = solveRoom(index);
    assert.deepEqual(first, second, 'the same controls at fixed 60 Hz produce the same result');
    for (const reactionFrames of [3, 6]) {
      assert.equal(
        solveRoom(index, undefined, { reactionFrames }).status,
        'won',
        `drag transitions tolerate ${reactionFrames} frames of extra reaction time`,
      );
    }
    const done = snapshot(first);
    step(LEVELS[index], first, { left: true, jump: true }, CONSTANTS.tick);
    assert.deepEqual(first, done, 'winning freezes the simulation');
  });
}
