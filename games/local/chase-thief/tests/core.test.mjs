import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, validateLevels } from '../levels.mjs';
import { RULES, createRun, updateRun, act, thiefLaneAt } from '../engine.mjs';

const close = (actual, expected, epsilon = 1e-7) => {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} is not close to ${expected}`);
};

function moveTo(state, lane) {
  while (state.lane < lane) act(state, 'right');
  while (state.lane > lane) act(state, 'left');
}

function speed(state) {
  return (
    state.level.speed *
    (state.slowRemaining > 0
      ? RULES.slowSpeedMultiplier
      : state.boostRemaining > 0
        ? RULES.boostSpeedMultiplier
        : 1)
  );
}

function reachNextWave(state, prepare, frame = 1 / 60) {
  const wave = state.level.waves.find((item) => !state.clearedWaveIds.includes(item.id));
  assert.ok(wave, 'a next wave exists');
  while (state.phase === 'running' && wave.at - state.world > speed(state) * 0.45 + 1e-7) {
    const untilPreparation = (wave.at - state.world) / speed(state) - 0.45;
    updateRun(state, Math.min(frame, untilPreparation));
  }
  if (state.phase !== 'running') return;
  prepare?.(state, wave);
  while (state.phase === 'running' && !state.clearedWaveIds.includes(wave.id)) {
    updateRun(state, frame);
  }
}

function dodge(state, wave) {
  const safeLane = [0, 1, 2].find(
    (lane) => !wave.obstacles.some((obstacle) => obstacle.lane === lane),
  );
  moveTo(state, safeLane);
}

function playFixedRoute(level, missedWaves = []) {
  const state = createRun(level);
  while (state.phase === 'running' && state.clearedWaveIds.length < level.waves.length) {
    const waveIndex = state.clearedWaveIds.length;
    reachNextWave(
      state,
      missedWaves.includes(waveIndex) ? (run, wave) => moveTo(run, wave.obstacles[0].lane) : dodge,
    );
  }
  if (state.phase === 'running') updateRun(state, state.remaining);
  return state;
}

test('three 60-second levels use validated, spaced, passable authored waves', () => {
  assert.deepEqual(validateLevels(), []);
  assert.equal(LEVELS.length, 3);
  for (const level of LEVELS) {
    assert.equal(level.duration, 60);
    assert.equal(level.speed, 8);
    assert.equal(level.waves.length, 17);
    assert.equal(level.waves[0].at, 40);
    for (let index = 1; index < level.waves.length; index++) {
      assert.equal(level.waves[index].at - level.waves[index - 1].at, index < 3 ? 32 : 24);
    }
    assert.equal(level.waves.at(-1).at, 440);
  }
  assert.deepEqual(
    LEVELS[0].waves.slice(0, 3).map((wave) => wave.obstacles[0]),
    [
      { lane: 1, type: 'barrier' },
      { lane: 1, type: 'beam' },
      { lane: 1, type: 'crate' },
    ],
  );
});

test('content validation rejects unreachable or insufficient pursuit progress', () => {
  const tooLate = structuredClone(LEVELS[0]);
  tooLate.waves.forEach((wave) => {
    wave.at += 600;
  });
  assert.ok(validateLevels([tooLate]).some((error) => error.includes('catchable clear route')));
  const tooShort = structuredClone(LEVELS[0]);
  tooShort.waves = tooShort.waves.slice(0, 9);
  assert.ok(validateLevels([tooShort]).some((error) => error.includes('catchable clear route')));
});

test('content validation rejects duplicate IDs, blocked lanes and unreadable spacing', () => {
  const level = structuredClone(LEVELS[0]);
  level.waves[1].at = 41;
  level.waves[1].id = level.waves[0].id;
  level.waves[2].obstacles.push({ lane: 0, type: 'crate' }, { lane: 2, type: 'crate' });
  const errors = validateLevels([level, level]);
  assert.ok(errors.some((message) => message.includes('1.8 s')));
  assert.ok(errors.some((message) => message.includes('unique')));
  assert.ok(errors.some((message) => message.includes('clear lane')));
  assert.ok(errors.some((message) => message.includes('duplicated')));
  assert.throws(() => createRun(level), TypeError);
});

test('each fixed safe route catches the thief before timeout without collision', () => {
  for (const level of LEVELS) {
    const state = createRun(level);
    while (state.phase === 'running') reachNextWave(state, dodge);
    assert.equal(state.phase, 'won', level.id);
    assert.equal(state.collisions, 0, level.id);
    assert.equal(state.successes, 10, level.id);
    assert.ok(state.elapsed < 35, level.id);
    assert.ok(state.distance <= RULES.captureDistance, level.id);
    assert.equal(state.events.filter((event) => event.type === 'win').length, 1);
  }
});

test('two early collisions leave fifteen clean waves to recover and capture in each street', () => {
  for (const level of LEVELS) {
    const state = playFixedRoute(level, [0, 1]);
    assert.equal(state.phase, 'won', level.id);
    assert.equal(state.collisions, 2, level.id);
    assert.equal(state.successes, 15, level.id);
    assert.equal(state.boosts, 5, level.id);
    assert.equal(state.clearedWaveIds.length, 17, level.id);
    assert.ok(state.elapsed < 57, level.id);
  }
});

test('an early mistake can be recovered, while scattered mistakes can naturally time out', () => {
  const recovered = playFixedRoute(LEVELS[0], [0]);
  assert.equal(recovered.phase, 'won');
  assert.equal(recovered.collisions, 1);
  const timeout = playFixedRoute(LEVELS[0], [0, 8]);
  assert.equal(timeout.phase, 'lost');
  assert.equal(timeout.collisions, 2);
  assert.equal(timeout.successes, 15);
  assert.equal(timeout.boosts, 4);
  assert.equal(timeout.clearedWaveIds.length, 17);
  close(timeout.elapsed, 60);
  close(timeout.distance, 2.75);
  assert.equal(timeout.events.at(-1).reason, 'timeout');
});

test('jump, slide and a lane switch produce three successes and a continuous 3 m boost', () => {
  const state = createRun(LEVELS[0]);
  reachNextWave(state, (run) => act(run, 'jump'));
  assert.equal(state.combo, 1);
  reachNextWave(state, (run) => act(run, 'slide'));
  assert.equal(state.combo, 2);
  reachNextWave(state, (run) => act(run, 'left'), 1 / 120);
  assert.equal(state.successes, 3);
  assert.equal(state.collisions, 0);
  assert.equal(state.combo, 0);
  assert.equal(state.bestCombo, 3);
  assert.equal(state.events.filter((event) => event.type === 'boost').length, 1);
  const remaining = state.boostRemaining;
  const distance = state.distance;
  const gainAlreadyApplied =
    ((RULES.boostDuration - remaining) * RULES.boostGain) / RULES.boostDuration;
  close(distance + gainAlreadyApplied, 12 - 3 * RULES.successGain);
  updateRun(state, remaining / 2);
  close(state.distance, distance - (remaining / 2) * 1.5);
  updateRun(state, remaining / 2);
  close(state.distance, 12 - 3 * RULES.successGain - 3);
  close(state.boostRemaining, 0);
});

test('wrong actions collide once per wave, reset combo and impose a single 2.5 m penalty', () => {
  const state = createRun(LEVELS[0]);
  reachNextWave(state, (run) => act(run, 'jump'));
  const distance = state.distance;
  reachNextWave(state, (run) => act(run, 'jump'));
  assert.equal(state.collisions, 1);
  assert.equal(state.combo, 0);
  close(state.distance, distance + 2.5);
  assert.ok(state.slowRemaining > 0);
  updateRun(state, 1.2);
  assert.equal(state.collisions, 1);
  close(state.distance, distance + 2.5);
  close(state.slowRemaining, 0);
});

test('crates cannot be jumped, and three collisions end the run exactly once', () => {
  const state = createRun(LEVELS[0]);
  reachNextWave(state);
  reachNextWave(state);
  reachNextWave(state, (run) => act(run, 'jump'));
  assert.equal(state.phase, 'lost');
  assert.equal(state.collisions, 3);
  assert.equal(state.successes, 0);
  close(state.distance, 19.5);
  assert.equal(state.events.find((event) => event.type === 'lose').reason, 'collisions');
  const finished = structuredClone(state);
  updateRun(state, 5);
  assert.equal(act(state, 'left'), false);
  assert.deepEqual(state, finished);
});

test('pausing freezes action/effect clocks and inputs; timeout emits one loss', () => {
  const state = createRun(LEVELS[0]);
  act(state, 'jump');
  state.boostRemaining = 1;
  state.phase = 'paused';
  const paused = structuredClone(state);
  updateRun(state, 30);
  assert.equal(act(state, 'right'), false);
  assert.deepEqual(state, paused);
  state.phase = 'running';
  state.elapsed = 59.8;
  state.remaining = 0.2;
  state.boostRemaining = 0;
  updateRun(state, 20);
  assert.equal(state.phase, 'lost');
  close(state.elapsed, 60);
  close(state.remaining, 0);
  assert.equal(state.events.filter((event) => event.type === 'lose').length, 1);
  assert.equal(state.events.at(-1).reason, 'timeout');
});

test('small and large frame steps resolve the same wave, boost, capture and timeout boundaries', () => {
  for (const duration of [5, 6.25, 17.5, 60]) {
    const large = createRun(LEVELS[0]);
    const small = createRun(LEVELS[0]);
    moveTo(large, 2);
    moveTo(small, 2);
    updateRun(large, duration);
    for (let remaining = duration; remaining > 1e-9; remaining -= Math.min(remaining, 1 / 144)) {
      updateRun(small, Math.min(remaining, 1 / 144));
    }
    for (const field of [
      'elapsed',
      'remaining',
      'world',
      'distance',
      'boostRemaining',
      'slowRemaining',
      'laneVisual',
    ]) {
      close(large[field], small[field], 1e-6);
    }
    for (const field of [
      'phase',
      'successes',
      'combo',
      'collisions',
      'thiefLane',
      'clearedWaveIds',
    ]) {
      assert.deepEqual(large[field], small[field]);
    }
    assert.deepEqual(
      large.events.map((event) => event.type),
      small.events.map((event) => event.type),
    );
  }
});

test('the thief follows world distance even when the player gap is altered', () => {
  const near = createRun(LEVELS[0]);
  const far = createRun(LEVELS[0]);
  near.distance = 7;
  far.distance = 25;
  moveTo(near, 2);
  moveTo(far, 2);
  updateRun(near, 7);
  updateRun(far, 7);
  close(near.world, far.world);
  assert.equal(near.thiefLane, far.thiefLane);
  assert.equal(near.boostRemaining, far.boostRemaining);
});

test('the fixed thief route uses a clear lane around every authored obstacle crossing', () => {
  for (const level of LEVELS) {
    for (const wave of level.waves) {
      // This covers the full gap range of a live run and leaves the renderer
      // enough time to smooth a route change before the thief reaches a wave.
      for (const gap of [20, 12, RULES.captureDistance]) {
        const lane = thiefLaneAt(level, wave.at - gap);
        assert.ok(!wave.obstacles.some((item) => item.lane === lane), `${wave.id} at gap ${gap}`);
      }
    }
  }
});

test('action windows allow early reactions while repeated inputs cannot extend an action', () => {
  const state = createRun(LEVELS[0]);
  updateRun(state, 4.35);
  assert.equal(act(state, 'jump'), true);
  updateRun(state, 0.25);
  const remaining = state.actionRemaining;
  assert.equal(act(state, 'jump'), false);
  close(state.actionRemaining, remaining);
  assert.equal(act(state, 'slide'), false);
  updateRun(state, 0.4);
  assert.equal(state.successes, 1);
  assert.equal(state.collisions, 0);
  assert.ok(state.events.some((event) => event.type === 'action'));
});
