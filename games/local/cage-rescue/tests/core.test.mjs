import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  createEndlessGame,
  getPersonLandingX,
  stepGame,
  launchBall,
  setPaused,
  reviveGame,
  canRevive,
  remainingRescuable,
  RULES,
  FIXED_STEP,
} from '../src/core.mjs';
import { LEVELS, validateLevels, createEndlessLevel } from '../src/levels.mjs';

function advance(state, seconds, input = {}) {
  for (let remaining = seconds; remaining > 1e-8; remaining -= FIXED_STEP)
    stepGame(state, Math.min(FIXED_STEP, remaining), input);
}

function falling(state, cageIndex, x, y) {
  const cage = state.cages[cageIndex];
  cage.hp = 0;
  const person = {
    id: cage.person,
    cageId: cage.id,
    x,
    y,
    r: RULES.personRadius,
    status: 'falling',
    releaseAt: state.time,
  };
  state.people.push(person);
  return person;
}

function strike(state, cage) {
  state.phase = state.status = 'playing';
  Object.assign(state.ball, {
    active: true,
    x: cage.x + cage.w / 2,
    y: cage.y + cage.h + state.ball.r + 1,
    vx: 0,
    vy: -state.level.ballSpeed,
  });
  stepGame(state, 1 / 60);
}

function dropBall(state) {
  state.phase = state.status = 'playing';
  Object.assign(state.ball, { active: true, x: 25, y: 709, vx: 0, vy: 250 });
  stepGame(state, FIXED_STEP);
}

test('thirty stable, independently valid level configurations and expected progression', () => {
  assert.deepEqual(validateLevels(), []);
  assert.equal(new Set(LEVELS.map((l) => l.id)).size, 30);
  assert.ok(LEVELS[0].cages.every((c) => c.hp === 1));
  assert.ok(LEVELS.slice(2).every((l) => l.cages.some((c) => c.hp === 2)));
  for (let i = 0; i < LEVELS.length; i++) {
    const state = createGame(i);
    assert.equal(state.cages.length, 6);
    assert.equal(state.target, state.cages.length);
    assert.equal(state.lives, 3);
    assert.equal(remainingRescuable(state), 6);
    assert.equal(state.levelId, LEVELS[i].id);
    assert.ok(state.level.releaseGap > (RULES.right - RULES.left) / RULES.paddleSpeed);
    assert.ok(
      (RULES.paddleY - Math.max(...state.cages.map((c) => c.y + c.h))) / state.level.personSpeed >
        5,
    );
  }
  assert.throws(() => createGame(-1), RangeError);
  assert.throws(() => createGame(LEVELS.length), RangeError);
});

test('content validator catches overlapping geometry and invalid unlocks', () => {
  const levels = structuredClone(LEVELS);
  levels[0].cages[1].x = levels[0].cages[0].x;
  levels[1].unlockAfter = 'missing-level';
  const errors = validateLevels(levels);
  assert.ok(errors.some((e) => e.includes('overlapping')));
  assert.ok(errors.some((e) => e.includes('unlock')));
});

test('content validator rejects any target that leaves a teammate behind', () => {
  const levels = structuredClone(LEVELS);
  levels[0].target = 4;
  assert.ok(validateLevels(levels).some((error) => error.includes('all teammates')));
});

test('game begins ready, paddle clamps and an inactive ball follows it', () => {
  const state = createGame();
  advance(state, 1, { targetX: -1000 });
  assert.equal(state.paddle.x, RULES.left + state.paddle.w / 2);
  assert.equal(state.ball.x, state.paddle.x);
  assert.equal(state.phase, 'ready');
  assert.equal(launchBall(state), true);
  assert.equal(launchBall(state), false);
  assert.equal(state.phase, 'playing');
  assert.ok(state.ball.vy < 0);
  assert.ok(Math.abs(Math.hypot(state.ball.vx, state.ball.vy) - state.level.ballSpeed) < 1e-6);
});

test('single-hit cages release exactly one teammate without counting a rescue', () => {
  const state = createGame();
  const cage = state.cages[3];
  strike(state, cage);
  assert.equal(cage.hp, 0);
  assert.equal(state.people.length, 1);
  assert.equal(state.people[0].status, 'waiting');
  assert.equal(state.people[0].x, cage.x + cage.w / 2);
  assert.equal(state.rescued, 0);
  assert.ok(state.events.some((e) => e.type === 'release'));
  state.ball.active = false;
  state.phase = 'ready';
  advance(state, 0.3);
  assert.equal(state.people[0].status, 'falling');
  assert.equal(state.people.length, 1);
});

test('reinforced cages require two separate impacts and independent bricks release nobody', () => {
  const state = createGame(2);
  const cage = state.cages[0];
  strike(state, cage);
  assert.equal(cage.hp, 1);
  assert.equal(state.people.length, 0);
  strike(state, cage);
  assert.equal(cage.hp, 0);
  assert.equal(state.people.length, 1);
  const brick = state.bricks[0];
  strike(state, brick);
  assert.equal(brick.hp, 0);
  assert.equal(state.people.length, 1);
});

test('predicted teammate arrivals are staggered even across cage heights', () => {
  const state = createGame();
  strike(state, state.cages[3]);
  strike(state, state.cages[4]);
  strike(state, state.cages[0]);
  const arrivals = state.people
    .map(
      (p) =>
        Math.max(state.time, p.releaseAt) + (state.paddle.y - p.r - p.y) / state.level.personSpeed,
    )
    .sort((a, b) => a - b);
  for (let i = 1; i < arrivals.length; i++)
    assert.ok(arrivals[i] - arrivals[i - 1] >= state.level.releaseGap - 0.02);
});

test('each teammate counts once; four and five rescues continue, only all six win', () => {
  const state = createGame();
  for (let i = 0; i < state.target; i++) {
    const person = falling(state, i, state.paddle.x, state.paddle.y - RULES.personRadius - 0.1);
    stepGame(state, FIXED_STEP);
    assert.equal(person.status, 'rescued');
    assert.equal(state.rescued, i + 1);
    assert.equal(state.phase, i + 1 === state.target ? 'won' : 'ready');
    assert.equal(
      state.events.filter((e) => e.type === 'win').length,
      i + 1 === state.target ? 1 : 0,
    );
  }
  assert.equal(state.phase, 'won');
  assert.equal(state.ball.active, false);
  assert.equal(reviveGame(state), false);
  const snapshot = structuredClone(state);
  stepGame(state, 0.25, { targetX: 80 });
  assert.equal(state.time, snapshot.time);
  assert.equal(state.rescued, 6);
});

test('the first missed teammate enters the net, preserves ball lives, and ends the run', () => {
  const state = createGame();
  const person = falling(state, 0, 45, RULES.netY - RULES.personRadius - 0.1);
  stepGame(state, FIXED_STEP);
  assert.equal(person.status, 'missed');
  assert.equal(state.missed, 1);
  assert.equal(state.lives, 3);
  assert.equal(state.phase, 'lost');
  assert.equal(state.lossReason, 'not-enough-people');
  assert.equal(canRevive(state), false);
  assert.equal(reviveGame(state), false);
});

test('a missed paddle cannot catch the same person by moving underneath below its surface', () => {
  const state = createGame();
  const person = falling(state, 0, 50, state.paddle.y - RULES.personRadius - 0.1);
  stepGame(state, FIXED_STEP);
  assert.equal(person.status, 'falling');
  advance(state, 2, { targetX: 50 });
  assert.equal(person.status, 'missed');
  assert.equal(state.rescued, 0);
});

test('each lost ball costs one chance; the third loss permits one rewarded revive', () => {
  const state = createGame();
  for (let expected = 2; expected >= 0; expected--) {
    dropBall(state);
    assert.equal(state.lives, expected);
    assert.equal(state.ball.active, false);
    assert.equal(state.phase, expected ? 'ready' : 'lost');
  }
  assert.equal(state.lossReason, 'no-lives');
  assert.equal(canRevive(state), true);
  assert.equal(reviveGame(state), true);
  assert.equal(state.lives, 1);
  assert.equal(state.phase, 'ready');
  assert.equal(state.usedRevive, true);
  assert.equal(state.lossReason, null);
  assert.equal(reviveGame(state), false);
  launchBall(state);
  dropBall(state);
  assert.equal(state.phase, 'lost');
  assert.equal(canRevive(state), false);
  assert.equal(reviveGame(state), false);
});

test('revive cannot override an impossible rescue target, including inconsistent external state', () => {
  const state = createGame();
  dropBall(state);
  dropBall(state);
  dropBall(state);
  state.cages.slice(0, 3).forEach((c) => {
    c.hp = 0;
  });
  assert.equal(canRevive(state), false);
  assert.equal(reviveGame(state), false);
});

test('people continue falling while waiting for the replacement ball to launch', () => {
  const state = createGame();
  const person = falling(state, 0, 80, 400);
  dropBall(state);
  const y = person.y;
  advance(state, 1);
  assert.equal(state.phase, 'ready');
  assert.ok(Math.abs(person.y - y - state.level.personSpeed) < 1e-6);
});

test('pause freezes both goals, clocks and paddle; resume preserves the previous phase', () => {
  const state = createGame();
  falling(state, 0, 80, 400);
  launchBall(state);
  advance(state, 0.3);
  assert.equal(setPaused(state, true), true);
  const snapshot = structuredClone(state);
  advance(state, 1, { targetX: 80 });
  assert.equal(state.time, snapshot.time);
  assert.deepEqual(state.ball, snapshot.ball);
  assert.deepEqual(state.people, snapshot.people);
  assert.deepEqual(state.paddle, snapshot.paddle);
  assert.equal(setPaused(state, false), true);
  assert.equal(state.phase, 'playing');
  advance(state, 0.1);
  assert.ok(state.time > snapshot.time);
  const ready = createGame();
  setPaused(ready, true);
  setPaused(ready, false);
  assert.equal(ready.phase, 'ready');
});

test('paddle impact position determines rebound angle without increasing ball speed', () => {
  const velocities = [-0.8, 0, 0.8].map((offset) => {
    const state = createGame();
    launchBall(state);
    Object.assign(state.ball, {
      x: state.paddle.x + (offset * state.paddle.w) / 2,
      y: state.paddle.y - state.ball.r - 1,
      vx: 0,
      vy: 250,
    });
    stepGame(state, FIXED_STEP);
    assert.ok(state.ball.vy < 0);
    assert.ok(Math.abs(Math.hypot(state.ball.vx, state.ball.vy) - state.level.ballSpeed) < 1e-6);
    return state.ball.vx;
  });
  assert.ok(velocities[0] < -150);
  assert.ok(Math.abs(velocities[1]) <= 18);
  assert.ok(velocities[2] > 150);
});

test('distant simultaneous bottom targets trigger brief slow motion with full-speed paddle movement', () => {
  const state = createGame();
  launchBall(state);
  falling(state, 0, 75, 555);
  Object.assign(state.ball, { x: 320, y: 535, vx: 0, vy: 250 });
  const previousY = state.ball.y;
  stepGame(state, 1 / 60, { targetX: 75 });
  assert.equal(state.slowMotion, true);
  assert.equal(state.timeScale, RULES.slowFactor);
  assert.ok(state.ball.y - previousY < (250 / 60) * 0.5);
  assert.ok(Math.abs(state.paddle.x - (195 - RULES.paddleSpeed / 60)) < 1e-6);
  state.ball.vy = -250;
  advance(state, 2);
  assert.equal(state.slowMotion, false);
});

test('fixed substeps produce matching trajectories at 30, 60 and 144 FPS', () => {
  const states = [30, 60, 144].map((fps) => {
    const state = createGame();
    launchBall(state);
    for (let i = 0; i < fps * 5; i++) stepGame(state, 1 / fps, { targetX: 190 });
    return state;
  });
  for (const state of states.slice(1)) {
    assert.equal(state.phase, states[0].phase);
    for (const field of ['x', 'y', 'vx', 'vy'])
      assert.ok(Math.abs(state.ball[field] - states[0].ball[field]) < 1e-7, field);
    assert.deepEqual(state.cages, states[0].cages);
    assert.deepEqual(state.people, states[0].people);
    assert.ok(Math.abs(state.time - states[0].time) < 1e-7);
  }
});

test('invalid time/input does not corrupt state and separate runs never share mutable geometry', () => {
  const state = createGame();
  stepGame(state, NaN, { targetX: NaN });
  stepGame(state, -1);
  assert.equal(state.time, 0);
  advance(state, 0.1, { targetX: Infinity });
  assert.equal(state.paddle.x, 195);
  state.cages[0].hp = 0;
  assert.equal(createGame().cages[0].hp, 1);
  assert.equal(LEVELS[0].cages[0].hp, 1);
});

test('all thirty routes are winnable using only paddle and launch input', async () => {
  const { createRoutePlayer } = await import('./route-player.mjs');
  for (let levelIndex = 0; levelIndex < LEVELS.length; levelIndex++) {
    const state = createGame(levelIndex),
      play = createRoutePlayer();
    let firstReleaseAt = null;
    for (let frame = 0; frame < 60 * 180 && !['won', 'lost'].includes(state.phase); frame++) {
      const input = play(state);
      if (input.launch) launchBall(state);
      stepGame(state, 1 / 60, input);
      if (firstReleaseAt === null && state.people.length) firstReleaseAt = state.time;
    }
    assert.equal(state.phase, 'won', `${state.level.name}: ${state.lossReason}`);
    assert.equal(state.rescued, state.cages.length);
    assert.equal(state.missed, 0);
    assert.ok(state.cages.every((cage) => cage.hp === 0));
    assert.equal(state.usedRevive, false);
    assert.ok(firstReleaseAt < 20, `${state.level.name}: first rescue opportunity takes too long`);
  }
});

test('two consecutive rescues grant a temporary wide paddle; pause freezes it and misses break the chain', () => {
  const state = createGame();
  for (let i = 0; i < 2; i++) {
    falling(state, i, state.paddle.x, RULES.paddleY - RULES.personRadius - 0.1);
    stepGame(state, FIXED_STEP * 2);
  }
  assert.equal(state.rescueCombo, 2);
  assert.equal(state.bestRescueCombo, 2);
  assert.equal(state.paddle.w, state.level.paddleWidth * 1.3);
  const clock = state.realTime;
  setPaused(state, true);
  stepGame(state, 6);
  setPaused(state, false);
  assert.equal(state.realTime, clock);
  advance(state, 5.1);
  assert.equal(state.paddle.w, state.level.paddleWidth);
  dropBall(state);
  assert.equal(state.rescueCombo, 0);
  assert.equal(state.bestRescueCombo, 2);
});

test('endless waves continue beyond the campaign without refilling lives or losing totals', () => {
  const state = createEndlessGame(73);
  state.lives = 2;
  for (let wave = 1; wave <= 80; wave++) {
    assert.equal(state.endlessWave, wave);
    assert.equal(state.mode, 'endless');
    for (let person = 0; person < 6; person++) {
      falling(state, person, state.paddle.x, state.paddle.y - RULES.personRadius - 0.1);
      stepGame(state, FIXED_STEP);
    }
    assert.equal(state.totalRescued, wave * 6);
    assert.equal(state.lives, 2);
    assert.equal(state.phase, 'ready');
    assert.equal(state.people.length, 0);
    assert.equal(state.cages.length, 6);
  }
  assert.equal(state.endlessWave, 81);
  assert.ok(state.realTime >= 4 - 1e-8);
  dropBall(state);
  dropBall(state);
  assert.equal(state.phase, 'lost');
  assert.equal(canRevive(state), false);
  assert.equal(state.totalRescued, 480);
});

test('endless content is deterministic, safe, varied beyond thirty waves and gently starts', () => {
  for (const seed of [0, 73, 4294967295]) {
    for (const wave of [1, 2, 6, 30, 31, 61, 1000, 100000]) {
      const level = createEndlessLevel(wave, seed);
      assert.deepEqual(validateLevels([level]), []);
      assert.deepEqual(level, createEndlessLevel(wave, seed));
    }
    const first = createEndlessLevel(1, seed);
    assert.ok(first.cages.every((item) => item.hp === 1));
    assert.ok(first.bricks.every((item) => item.hp === 1));
    assert.equal(first.ballSpeed, LEVELS[0].ballSpeed);
    assert.notDeepEqual(createEndlessLevel(31, seed).cages, createEndlessLevel(61, seed).cages);
  }
});

test('chapters introduce armor, chambers and switches before wind and medical support', () => {
  assert.ok(
    LEVELS.slice(0, 6).every(
      (level) => !level.wind && !level.barriers && level.cages.every((cage) => !cage.role),
    ),
  );
  assert.equal(LEVELS[6].cages[0].role, 'engineer');
  assert.ok(LEVELS[6].bricks.some((brick) => brick.hp >= 4));
  assert.equal(LEVELS[7].devices[0].kind, 'splitter');
  assert.equal(LEVELS[10].devices[0].kind, 'switch');
  assert.ok(LEVELS[12].wind);
  assert.equal(LEVELS[18].barriers[0].material, 'steel');
  assert.equal(LEVELS[18].wind, null);
  assert.ok(LEVELS[24].wind && LEVELS[24].barriers.length);
  assert.ok(LEVELS[24].cages.some((cage) => cage.role === 'medic'));
  for (const wave of [7, 13, 19, 25]) {
    const level = createEndlessLevel(wave, 19);
    assert.deepEqual(validateLevels([level]), []);
    assert.equal(level.cages[0].role, LEVELS[wave - 1].cages[0].role);
    assert.equal(Boolean(level.wind), Boolean(LEVELS[wave - 1].wind));
  }
});

test('an engineer grants eight seconds of width, never shortened by the next combo or pause', () => {
  const state = createGame(6);
  while (state.cages[0].hp > 0) strike(state, state.cages[0]);
  const engineer = state.people[0];
  assert.equal(engineer.role, 'engineer');
  Object.assign(engineer, {
    status: 'falling',
    x: state.paddle.x,
    y: state.paddle.y - engineer.r - 0.1,
  });
  state.ball.active = false;
  state.phase = state.status = 'ready';
  stepGame(state, FIXED_STEP);
  const expires = state.wideUntil;
  assert.ok(expires >= state.realTime + 8 - 1e-8);
  falling(state, 1, state.paddle.x, state.paddle.y - RULES.personRadius - 0.1);
  stepGame(state, FIXED_STEP);
  assert.equal(state.wideUntil, expires);
  assert.equal(state.paddle.w, state.level.paddleWidth * 1.3);
  setPaused(state, true);
  stepGame(state, 4);
  setPaused(state, false);
  assert.equal(state.wideUntil, expires);
});

test('medics restore one ball up to the life cap without marking a rewarded revive', () => {
  const state = createGame(24);
  state.lives = 1;
  const medic = falling(state, 4, state.paddle.x, state.paddle.y - RULES.personRadius - 0.1);
  medic.role = 'medic';
  stepGame(state, FIXED_STEP);
  assert.equal(state.lives, 2);
  assert.equal(state.usedRevive, false);
  assert.ok(state.events.some((event) => event.type === 'medic' && event.gained));
  state.lives = 3;
  const another = falling(state, 5, state.paddle.x, state.paddle.y - RULES.personRadius - 0.1);
  another.role = 'medic';
  stepGame(state, FIXED_STEP);
  assert.equal(state.lives, 3);
});

test('steel redirects the ball repeatedly without breaking or releasing a teammate', () => {
  const state = createGame(18),
    barrier = state.barriers[0],
    original = structuredClone(barrier);
  for (let impact = 0; impact < 8; impact++) {
    strike(state, barrier);
    assert.ok(state.ball.vy > 0);
    assert.ok(state.events.some((event) => event.type === 'metal'));
    assert.deepEqual(barrier, original);
  }
  assert.equal(state.people.length, 0);
  assert.equal(remainingRescuable(state), 6);
});

test('wind pauses with the simulation and its landing marker predicts the actual catch', () => {
  const state = createGame(12);
  while (state.cages[4].hp > 0) strike(state, state.cages[4]);
  state.ball.active = false;
  state.phase = state.status = 'ready';
  const person = state.people[0];
  advance(state, 0.4);
  const forecast = getPersonLandingX(state, person),
    before = person.x;
  setPaused(state, true);
  stepGame(state, 3);
  assert.equal(person.x, before);
  setPaused(state, false);
  for (let tick = 0; tick < 120 * 20 && person.status !== 'rescued'; tick++)
    stepGame(state, FIXED_STEP, { targetX: forecast });
  assert.equal(person.status, 'rescued');
  assert.ok(Math.abs(person.x - forecast) < 0.5);
  assert.notEqual(person.x, person.originX);
});

test('content rejects unsafe weather and unknown support roles', () => {
  const levels = structuredClone(LEVELS);
  levels[12].wind.amplitude = 100;
  levels[6].cages[0].role = 'unknown';
  const errors = validateLevels(levels);
  assert.ok(errors.some((error) => error.includes('wind')));
  assert.ok(errors.some((error) => error.includes('role')));
});
