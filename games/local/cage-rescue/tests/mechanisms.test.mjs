import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  createEndlessGame,
  launchBall,
  stepGame,
  setPaused,
  FIXED_STEP,
  RULES,
} from '../src/core.mjs';
import { LEVELS, createEndlessLevel, validateLevels } from '../src/levels.mjs';

function strike(state, entity) {
  state.phase = state.status = 'playing';
  Object.assign(state.ball, {
    active: true,
    x: entity.x + entity.w / 2,
    y: entity.y + entity.h + RULES.ballRadius + 0.2,
    vx: 0,
    vy: -state.level.ballSpeed,
  });
  stepGame(state, FIXED_STEP);
}
function split() {
  const state = createGame(7);
  strike(state, state.devices[0]);
  return state;
}

test('armor keeps each impact and breaks only on the last of six hits', () => {
  const state = createGame(6),
    armor = state.bricks.find((item) => item.hp === 6);
  for (let hit = 1; hit <= 6; hit++) {
    strike(state, armor);
    assert.equal(armor.hp, 6 - hit);
    assert.equal(
      state.events.some((event) => event.type === 'break'),
      hit === 6,
    );
  }
  assert.equal(state.people.length, 0);
  assert.equal(state.level.bricks.find((item) => item.id === armor.id).hp, 6);
});

test('a chamber spawns two independent balls, consumes once, and preserves normal speed', () => {
  const state = split();
  assert.equal(state.extraBalls.length, 2);
  assert.equal(state.devices[0].charges, 0);
  for (const ball of [state.ball, ...state.extraBalls]) {
    assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - state.level.ballSpeed) < 1e-8);
  }
  assert.equal(new Set([state.ball, ...state.extraBalls].map((ball) => ball.id)).size, 3);
  strike(state, state.devices[0]);
  assert.equal(state.extraBalls.length, 2);
  assert.equal(
    state.events.some((event) => event.type === 'mechanism'),
    false,
  );
});

test('full ball capacity preserves an unused splitter charge', () => {
  const state = split();
  state.devices[0].charges = 1;
  strike(state, state.devices[0]);
  assert.equal(state.extraBalls.length, 2);
  assert.equal(state.devices[0].charges, 1);
});

test('losing one ball promotes a survivor; losing the last two together costs exactly one life', () => {
  const state = split();
  const survivor = state.extraBalls[0].id;
  state.ball.y = 720;
  stepGame(state, FIXED_STEP);
  assert.equal(state.ball.id, survivor);
  assert.equal(state.extraBalls.length, 1);
  assert.equal(state.lives, 3);
  assert.equal(state.phase, 'playing');
  for (const ball of [state.ball, ...state.extraBalls]) ball.y = 720;
  stepGame(state, FIXED_STEP);
  assert.equal(state.lives, 2);
  assert.equal(state.phase, 'ready');
  assert.equal(state.extraBalls.length, 0);
  assert.equal(state.events.filter((event) => event.type === 'ball-lost').length, 1);
  assert.equal(launchBall(state), true);
});

test('multi-ball pauses, victory and failure stop every ball, and waves clear devices', () => {
  const state = split();
  setPaused(state);
  const before = JSON.stringify([state.ball, state.extraBalls, state.devices, state.time]);
  stepGame(state, 1);
  assert.equal(JSON.stringify([state.ball, state.extraBalls, state.devices, state.time]), before);
  setPaused(state, false);
  state.rescued = state.target;
  stepGame(state, FIXED_STEP);
  assert.equal(state.phase, 'won');
  assert.ok([state.ball, ...state.extraBalls].every((ball) => !ball.active));
  const failed = split();
  failed.lives = 0;
  stepGame(failed, FIXED_STEP);
  assert.equal(failed.phase, 'lost');
  assert.ok([failed.ball, ...failed.extraBalls].every((ball) => !ball.active));
  const endless = createEndlessGame(73);
  Object.assign(endless, split(), { mode: 'endless', endlessWave: 8, seed: 73 });
  endless.rescued = 6;
  stepGame(endless, FIXED_STEP);
  assert.equal(endless.endlessWave, 9);
  assert.equal(endless.extraBalls.length, 0);
  assert.ok(endless.devices.every((item) => item.charges === 1));
});

test('switches permanently open only their linked gates, which no longer collide', () => {
  const state = createGame(10),
    key = state.devices.find((item) => item.kind === 'switch');
  strike(state, key);
  const gates = state.barriers.filter((wall) => wall.group === key.group);
  assert.ok(gates.length > 0 && gates.every((wall) => wall.open));
  assert.ok(state.barriers.filter((wall) => !wall.group).every((wall) => !wall.open));
  for (const gate of gates) {
    strike(state, gate);
    assert.ok(state.ball.vy < 0);
    assert.equal(
      state.events.some((event) => event.type === 'metal'),
      false,
    );
  }
});

test('every explosive has actual targets, removes two layers and never directly opens cages', () => {
  for (let index = 0; index < LEVELS.length; index++) {
    const state = createGame(index),
      pulse = state.devices.find((item) => item.kind === 'pulse');
    if (!pulse) continue;
    const before = state.bricks.map((item) => item.hp),
      cages = state.cages.map((item) => item.hp);
    strike(state, pulse);
    assert.ok(
      state.bricks.some((item, i) => item.hp === Math.max(0, before[i] - 2)),
      state.level.name,
    );
    assert.deepEqual(
      state.cages.map((item) => item.hp),
      cages,
    );
    assert.equal(state.people.length, 0);
    assert.equal(pulse.charges, 0);
  }
});

test('multi-ball survives JSON checkpoint restoration with identical 30/60/144 FPS trajectories', () => {
  const initial = split();
  const states = [30, 60, 144].map((fps) => {
    const state = JSON.parse(JSON.stringify(initial));
    for (let i = 0; i < fps * 3; i++) stepGame(state, 1 / fps, { targetX: 190 });
    return state;
  });
  for (const state of states.slice(1)) {
    assert.deepEqual(state.ball, states[0].ball);
    assert.deepEqual(state.extraBalls, states[0].extraBalls);
    assert.deepEqual(state.cages, states[0].cages);
    assert.deepEqual(state.devices, states[0].devices);
  }
  const restored = JSON.parse(JSON.stringify(initial)),
    continuous = structuredClone(initial);
  for (let tick = 0; tick < 240; tick++) {
    stepGame(continuous, FIXED_STEP, { targetX: 140 });
    stepGame(restored, FIXED_STEP, { targetX: 140 });
  }
  assert.deepEqual(restored, continuous);
});

test('endless mirrors the entire assembly and retains armor, devices and links', () => {
  for (const seed of [0, 19, 73, 4294967295])
    for (let wave = 1; wave <= 120; wave++) {
      const level = createEndlessLevel(wave, seed),
        base = LEVELS[(wave - 1) % 30];
      assert.deepEqual(validateLevels([level]), [], `wave ${wave}`);
      assert.deepEqual(
        level.bricks.map((item) => item.hp),
        base.bricks.map((item) => (wave > 30 ? Math.max(2, item.hp) : item.hp)),
      );
      assert.deepEqual(
        level.devices.map((item) => [item.id, item.kind, item.charges, item.group]),
        (base.devices || []).map((item) => [item.id, item.kind, item.charges, item.group]),
      );
    }
});

test('configuration rejects unsupported devices, unlinked gates, and ineffective explosives', () => {
  const levels = structuredClone(LEVELS);
  levels[7].devices[0].kind = 'unknown';
  levels[10].devices[0].group = 'missing';
  levels[11].devices[0].radius = 40;
  const errors = validateLevels(levels);
  assert.ok(errors.some((error) => error.includes('invalid device')));
  assert.ok(errors.some((error) => error.includes('gate')));
  assert.ok(errors.some((error) => error.includes('no reachable armor')));
});

test('shallow-angle split rewards cannot create horizontal or vertical chamber orbits', () => {
  for (const angle of [0.6, Math.PI / 2 - 0.6]) {
    const state = createGame(7),
      core = state.devices[0],
      speed = state.level.ballSpeed;
    launchBall(state);
    Object.assign(state.ball, {
      x: core.x + core.w / 2,
      y: core.y + core.h + RULES.ballRadius + 0.01,
      vx: Math.cos(angle) * speed,
      vy: -Math.sin(angle) * speed,
    });
    stepGame(state, FIXED_STEP);
    assert.equal(state.extraBalls.length, 2);
    for (const ball of state.extraBalls) {
      assert.ok(Math.abs(ball.vx) >= 18 - 1e-8);
      assert.ok(Math.abs(ball.vy) >= speed * 0.22 - 1e-8);
      assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - speed) < 1e-8);
    }
  }
});

test('endless keeps its difficulty floor after cycling the campaign layouts', () => {
  const level = createEndlessLevel(31, 19);
  assert.ok(level.ballSpeed >= 281);
  assert.ok(level.wind);
  assert.ok(level.cages.every((item) => item.hp === 2));
  assert.ok(level.bricks.every((item) => item.hp >= 2));
  assert.equal(level.cages[0].role, 'engineer');
  assert.equal(level.cages[4].role, 'medic');
});
