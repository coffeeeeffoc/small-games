import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVELS,
  LAYER_COUNT,
  LEVEL_HEIGHT,
  FIRST_LAYER_Y,
  validateLevel,
  validateLevels,
} from '../levels.mjs';
import {
  createGame,
  createEndlessGame,
  layerRotationAt,
  step,
  rotate,
  brake,
  resumeCheckpoint,
  getLanding,
  sectorAt,
  normalizeAngle,
  BALL_ANGLE,
  BALL_RADIUS,
  BOUNCE_SPEED,
  BRAKE_DURATION,
} from '../engine.mjs';

function near(actual, expected, epsilon = 1e-7) {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} should equal ${expected}`);
}

function until(state, predicate, { fps = 240, timeout = 10 } = {}) {
  let ticks = 0;
  while (!predicate(state) && state.status === 'playing' && ticks < timeout * fps) {
    step(state, 1 / fps);
    ticks += 1;
  }
  assert.ok(
    predicate(state),
    `Condition not reached: layer ${state.nextLayer}, status ${state.status}`,
  );
}

const alignGap = (state) => rotate(state, getLanding(state).rotationToGap);
const setLocalAngle = (state, angle) => rotate(state, BALL_ANGLE - angle - state.rotation);

test('thirty independent, valid 12-layer routes end on a completely safe platform', () => {
  assert.equal(LEVELS.length, 30);
  assert.equal(validateLevels(), true);
  assert.equal(new Set(LEVELS.map((level) => JSON.stringify(level.layers))).size, 30);
  for (const level of LEVELS) {
    assert.equal(validateLevel(level), true);
    assert.equal(level.layers.length, LAYER_COUNT);
    for (const layer of level.layers)
      assert.equal(layer.y, FIRST_LAYER_Y + layer.index * LEVEL_HEIGHT);
    const finish = level.layers.at(-1);
    assert.equal(finish.finish, true);
    for (let angle = 0; angle < Math.PI * 2; angle += 0.1)
      assert.equal(sectorAt(finish, angle), 'finish');
  }
});

test('content validation rejects duplicate IDs, missing finish, overlaps, bad order, schema and unlock references', () => {
  const broken = () => structuredClone(LEVELS);
  let data = broken();
  data[1].id = data[0].id;
  assert.throws(() => validateLevels(data), /unique/);
  data = broken();
  data[0].layers.pop();
  assert.throws(() => validateLevels(data), /12 layers/);
  data = broken();
  data[0].layers[11].danger = [{ start: 0, end: 1 }];
  assert.throws(() => validateLevels(data), /safe/);
  data = broken();
  data[0].layers[2].danger = [data[0].layers[2].gap];
  assert.throws(() => validateLevels(data), /overlaps/);
  data = broken();
  data[0].layers[3].y = 1;
  assert.throws(() => validateLevels(data), /order/);
  data = broken();
  data[0].schemaVersion = 999;
  assert.throws(() => validateLevels(data), /schema/);
  data = broken();
  data[1].unlockAfter = 'missing';
  assert.throws(() => validateLevels(data), /unlock/);
});

test('the ball begins on an ordinary platform and keeps bouncing safely until the tower moves', () => {
  for (const level of LEVELS) {
    const state = createGame(level);
    assert.equal(getLanding(state).type, 'normal');
    step(state, 12);
    assert.equal(state.status, 'playing');
    assert.equal(state.nextLayer, 0);
    assert.ok(state.bounces >= 18);
    assert.equal(state.charge, 1);
    assert.equal(state.streak, 0);
    assert.ok(state.y <= FIRST_LAYER_Y - BALL_RADIUS);
  }
});

test('gravity and frame-independent exact collisions agree at 30, 60 and 120 FPS', () => {
  const samples = [30, 60, 120].map((fps) => {
    const state = createGame(LEVELS[0]);
    alignGap(state);
    for (let frame = 0; frame < fps * 3; frame += 1) step(state, 1 / fps);
    return state;
  });
  for (const state of samples) {
    assert.equal(state.status, 'lost');
    assert.equal(state.failureLayer, 3);
    assert.equal(state.nextLayer, 3);
    assert.equal(state.maxStreak, 3);
    near(state.elapsed, samples[0].elapsed);
    near(state.y, samples[0].y);
  }
  const exact = createGame(LEVELS[0]);
  step(exact, 0.1);
  near(exact.y, 84.5);
  near(exact.v, -190);
});

test('large steps cannot tunnel through a dangerous layer', () => {
  const state = createGame(LEVELS[0]);
  alignGap(state);
  step(state, 20);
  assert.equal(state.status, 'lost');
  assert.equal(state.failureLayer, 3);
  assert.equal(state.passes, 3);
  assert.equal(state.events.filter((event) => event.type === 'lost').length, 1);
});

test('brake freezes height and velocity for exactly 800 ms while tower rotation remains available', () => {
  const state = createGame(LEVELS[0]);
  alignGap(state);
  step(state, 0.8);
  const y = state.y;
  const v = state.v;
  const elapsed = state.elapsed;
  assert.ok(v > 0);
  assert.ok(state.streak > 0);
  assert.equal(brake(state), true);
  assert.equal(state.streak, 0);
  assert.equal(state.charge, 0);
  assert.equal(brake(state), false);
  const rotation = state.rotation;
  assert.equal(rotate(state, 0.4), true);
  near(state.rotation, normalizeAngle(rotation + 0.4));
  step(state, 0.799);
  near(state.y, y);
  near(state.v, v);
  step(state, 0.001);
  near(state.y, y);
  near(state.v, v);
  near(state.elapsed, elapsed + BRAKE_DURATION);
  assert.equal(state.brakeLeft, 0);
  step(state, 0.01);
  assert.ok(state.y > y);
  assert.ok(state.v >= v);
  assert.equal(state.brakesUsed, 1);
});

test('a frame spanning brake expiry simulates only its unfrozen remainder', () => {
  const state = createGame(LEVELS[0]);
  brake(state);
  step(state, 0.9);
  near(state.y, 84.5);
  near(state.v, -190);
  near(state.elapsed, 0.9);
});

test('three uninterrupted passes refill one brake; using it resets the counter and the next three refill again', () => {
  const state = createGame(LEVELS[0]);
  brake(state);
  step(state, BRAKE_DURATION);
  alignGap(state);
  until(state, (game) => game.nextLayer === 3);
  assert.equal(state.charge, 1);
  assert.equal(state.streak, 3);
  assert.equal(getLanding(state).type, 'danger');
  assert.equal(brake(state), true);
  assert.equal(state.streak, 0);
  alignGap(state);
  step(state, BRAKE_DURATION);
  until(state, (game) => game.nextLayer === 6);
  assert.equal(state.charge, 1);
  assert.equal(state.streak, 3);
  assert.equal(state.passes, 6);
  assert.equal(state.events.filter((event) => event.type === 'charge').length, 2);
  assert.equal(state.bounces, 0);
});

test('six unbroken passes are tracked without ever storing more than one brake', () => {
  const state = createGame(LEVELS[1]);
  alignGap(state);
  until(state, (game) => game.nextLayer === 6);
  assert.equal(state.streak, 6);
  assert.equal(state.maxStreak, 6);
  assert.equal(state.charge, 1);
  assert.equal(state.bounces, 0);
});

test('ordinary landing resets the streak and records a safe checkpoint', () => {
  const state = createGame(LEVELS[0]);
  alignGap(state);
  until(state, (game) => game.nextLayer === 3);
  setLocalAngle(state, (160 * Math.PI) / 180);
  assert.equal(getLanding(state).type, 'normal');
  until(state, (game) => game.bounces === 1);
  assert.equal(state.streak, 0);
  assert.equal(state.maxStreak, 3);
  assert.equal(state.charge, 1);
  assert.equal(state.nextLayer, 3);
  assert.equal(state.lastCheckpoint.layer, 3);
  assert.ok(state.v < 0);
});

test('a dangerous hit fails once; input and stepping cannot mutate a finished run', () => {
  const state = createGame(LEVELS[0]);
  alignGap(state);
  step(state, 4);
  const ended = structuredClone(state);
  assert.equal(brake(state), false);
  assert.equal(rotate(state, 1), false);
  step(state, 5);
  assert.deepEqual(state, ended);
});

test('continuation restores the latest safe landing once, preserves elapsed time and marks the score', () => {
  const state = createGame(LEVELS[0]);
  assert.equal(resumeCheckpoint(state), false);
  alignGap(state);
  until(state, (game) => game.nextLayer === 3);
  setLocalAngle(state, (160 * Math.PI) / 180);
  until(state, (game) => game.bounces === 1);
  const safeRotation = state.rotation;
  setLocalAngle(state, 0);
  until(state, (game) => game.status === 'lost');
  const elapsed = state.elapsed;
  assert.equal(resumeCheckpoint(state), true);
  assert.equal(state.continued, true);
  assert.equal(state.nextLayer, 3);
  near(state.rotation, safeRotation);
  assert.equal(getLanding(state).type, 'normal');
  assert.equal(state.v, BOUNCE_SPEED);
  assert.equal(state.elapsed, elapsed);
  assert.equal(state.charge, 1);
  setLocalAngle(state, 0);
  until(state, (game) => game.status === 'lost');
  assert.equal(resumeCheckpoint(state), false);
});

test('wrapped arcs and future landing forecasts share collision classification', () => {
  const state = createGame(LEVELS[0]);
  alignGap(state);
  assert.equal(getLanding(state).type, 'gap');
  assert.equal(getLanding(state, 1).index, 1);
  assert.equal(getLanding(state, 2).type, 'gap');
  assert.equal(getLanding(state, 3).type, 'danger');
  assert.equal(getLanding(state, 99), null);
  assert.equal(sectorAt(LEVELS[0].layers[0], -0.05), 'gap');
  assert.equal(sectorAt(LEVELS[0].layers[0], Math.PI * 2 + 0.05), 'gap');
  assert.equal(sectorAt(LEVELS[0].layers[0], LEVELS[0].layers[0].gap.start), 'gap');
  assert.equal(sectorAt(LEVELS[0].layers[0], LEVELS[0].layers[0].gap.end), 'normal');
});

test('all thirty routes are reachable with a modest rotation speed and player-controlled brakes', () => {
  // 2.8 rad/s is a ~30° correction in 190 ms. This is a reachable control trace,
  // not teleporting the ball or bypassing platform collision.
  const fps = 120;
  const maxRotationPerTick = 2.8 / fps;
  for (const level of LEVELS) {
    const state = createGame(level);
    let ticks = 0;
    while (state.status === 'playing' && ticks < fps * 25) {
      const landing = getLanding(state);
      const distanceToContact = landing.y - BALL_RADIUS - state.y;
      if (landing.type === 'danger' && distanceToContact < 90 && state.v > 0 && state.charge)
        brake(state);
      rotate(
        state,
        Math.max(-maxRotationPerTick, Math.min(maxRotationPerTick, landing.rotationToGap)),
      );
      step(state, 1 / fps);
      assert.ok(state.charge === 0 || state.charge === 1);
      ticks += 1;
    }
    assert.equal(state.status, 'won', `${level.id} must be reachable`);
    assert.equal(state.nextLayer, 12);
    assert.equal(state.passes, 11);
    assert.equal(state.continued, false);
    assert.equal(state.events.filter((event) => event.type === 'won').length, 1);
    const finalY = state.y;
    step(state, 1);
    assert.equal(state.y, finalY);
    assert.equal(getLanding(state), null);
  }
});

test('nonfinite and nonpositive time/input are harmless', () => {
  const state = createGame(LEVELS[0]);
  const snapshot = structuredClone(state);
  for (const dt of [0, -1, NaN, Infinity]) step(state, dt);
  assert.equal(rotate(state, NaN), false);
  assert.deepEqual(state, snapshot);
});

test('continuous drops earn capped multipliers and braking trades combo for safety', () => {
  const game = createGame(LEVELS[0]);
  for (let layer = 0; layer < 6; layer++) {
    alignGap(game);
    until(game, (state) => state.nextLayer > layer);
  }
  assert.equal(game.score, 100 + 200 + 300 + 400 + 500 + 500);
  assert.equal(brake(game), true);
  alignGap(game);
  until(game, (state) => state.nextLayer === 7);
  assert.equal(game.score, 2100);
});

test('endless generates over one thousand playable floors with a bounded ring buffer', () => {
  for (const seed of [0, 91, 4294967295]) {
    const state = createEndlessGame(seed);
    let ticks = 0;
    while (state.totalFloors < 1000 && state.status === 'playing' && ticks < 120 * 600) {
      const landing = getLanding(state);
      assert.equal(landing.number, state.totalFloors + 1);
      if (
        landing.type === 'danger' &&
        landing.y - BALL_RADIUS - state.y < 90 &&
        state.v > 0 &&
        state.charge
      )
        brake(state);
      rotate(state, Math.max(-2.8 / 120, Math.min(2.8 / 120, landing.rotationToGap)));
      step(state, 1 / 120);
      assert.ok(state.level.layers.length <= 36);
      assert.ok(state.level.layers.every((layer) => !layer.finish));
      ticks++;
    }
    assert.equal(state.status, 'playing', `seed ${seed}`);
    assert.equal(state.totalFloors, 1000);
    assert.equal(state.passes, 1000);
    assert.ok(state.layerOffset > 950);
    assert.equal(resumeCheckpoint(state), false);
  }
});

test('endless starts deterministically and cannot rewind scored floors after failure', () => {
  const first = createEndlessGame(42),
    second = createEndlessGame(42);
  assert.deepEqual(first, second);
  const danger = first.level.layers[0].danger[0];
  setLocalAngle(
    first,
    normalizeAngle(danger.start + normalizeAngle(danger.end - danger.start) / 2),
  );
  step(first, 2);
  assert.equal(first.status, 'lost');
  assert.equal(resumeCheckpoint(first), false);
});

test('new chapters introduce rotating, accelerating and foggy rings without changing the first eight', () => {
  assert.ok(
    LEVELS.slice(0, 8).every((level) =>
      level.layers.every(
        (layer) =>
          layer.spinSpeed === undefined &&
          layer.gravityScale === undefined &&
          layer.fog === undefined,
      ),
    ),
  );
  assert.ok(LEVELS[8].layers.some((layer) => layer.spinSpeed));
  assert.ok(LEVELS[12].layers.some((layer) => layer.gravityScale > 1));
  assert.ok(LEVELS[18].layers.some((layer) => layer.fog));
  assert.ok(
    LEVELS[24].layers.some((layer) => layer.spinSpeed && layer.gravityScale > 1 && layer.fog),
  );
  for (const [key, value] of [
    ['spinSpeed', 2],
    ['gravityScale', 10],
    ['fog', 'opaque'],
  ]) {
    const bad = structuredClone(LEVELS[24]);
    bad.layers[3][key] = value;
    assert.throws(() => validateLevel(bad), /Invalid/);
  }
});

test('the moving-ring forecast and collision share the simulation clock, including brakes', () => {
  const state = createGame(LEVELS[8]);
  state.nextLayer = 3;
  state.y = state.level.layers[3].y - BALL_RADIUS - 100;
  state.v = 200;
  const before = getLanding(state);
  brake(state);
  step(state, 0.4);
  const after = getLanding(state);
  assert.notEqual(after.effectiveRotation, before.effectiveRotation);
  assert.equal(after.type, sectorAt(after.layer, BALL_ANGLE - after.effectiveRotation));
  near(after.effectiveRotation, state.rotation + layerRotationAt(after.layer, state.elapsed));
  const frozen = state.y;
  step(state, 0.4);
  near(state.y, frozen);
  alignGap(state);
  until(state, (run) => run.nextLayer > 3);
  assert.equal(state.status, 'playing');
});

test('accelerating rings increase fall speed while exact collision remains frame-independent', () => {
  const base = structuredClone(LEVELS[0]),
    fast = structuredClone(LEVELS[0]);
  fast.layers[0].gravityScale = 1.2;
  const normal = createGame(base),
    accelerated = createGame(fast);
  for (const game of [normal, accelerated]) {
    game.y = -200;
    game.v = 100;
    step(game, 0.1);
  }
  assert.ok(accelerated.v > normal.v && accelerated.y > normal.y);
  const results = [30, 60, 120].map((fps) => {
    const game = createGame(LEVELS[24]);
    for (let frame = 0; frame < fps * 0.5; frame++) step(game, 1 / fps);
    return game;
  });
  for (const game of results) {
    near(game.y, results[0].y);
    near(game.v, results[0].v);
  }
});

test('continuation compensates moving machinery to restore the same safe landing angle', () => {
  const state = createGame(LEVELS[8]);
  state.nextLayer = 3;
  const layer = state.level.layers[3];
  state.y = layer.y - BALL_RADIUS - 0.01;
  state.v = 100;
  setLocalAngle(state, (160 * Math.PI) / 180);
  step(state, 1 / 120);
  assert.equal(state.lastCheckpoint.layer, 3);
  const safe = getLanding(state).angle;
  state.elapsed += 4;
  state.status = 'lost';
  const elapsed = state.elapsed;
  assert.equal(resumeCheckpoint(state), true);
  assert.equal(getLanding(state).type, 'normal');
  near(getLanding(state).angle, safe, 0.001);
  assert.equal(state.elapsed, elapsed);
});
