import { LEVELS, VIEWPORT, createEndlessLevel } from './levels.mjs';

export { LEVELS, VIEWPORT } from './levels.mjs';
// Bump for ranked simulation/content/scoring changes; presentation changes keep this version.
export const RANKED_RULE_VERSION = 'rescue-ranked-v2';
export const FIXED_STEP = 1 / 120;
export const RULES = Object.freeze({
  left: 16,
  right: 374,
  top: 70,
  netY: 669,
  paddleY: 623,
  paddleHeight: 15,
  paddleSpeed: 1100,
  personRadius: 11,
  ballRadius: 7,
  maxBalls: 3,
  maxBounceAngle: Math.PI * 0.365,
  slowFactor: 0.43,
  slowDuration: 1.8,
  slowCooldown: 3,
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const event = (state, type, details = {}) =>
  state.events.push({ type, time: state.time, ...details });
const isRunning = (state) => state.phase === 'playing' || state.phase === 'ready';

/** Mutable simulation state; all coordinates use the logical portrait viewport. */
export function createGame(levelIndex = 0) {
  if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex >= LEVELS.length)
    throw new RangeError('Unknown rescue level.');
  const level = LEVELS[levelIndex];
  return createState(level, levelIndex);
}

function createState(level, levelIndex = -1) {
  const state = {
    mode: 'campaign',
    endlessWave: 0,
    totalRescued: 0,
    levelIndex,
    levelId: level.id,
    level,
    phase: 'ready',
    status: 'ready',
    lossReason: null,
    lives: level.lives,
    target: level.cages.length,
    rescued: 0,
    rescueCombo: 0,
    bestRescueCombo: 0,
    wideUntil: 0,
    missed: 0,
    usedRevive: false,
    time: 0,
    realTime: 0,
    slowMotion: false,
    timeScale: 1,
    cages: level.cages.map((c) => ({ ...c, hp: c.hp, maxHp: c.hp, person: `person-${c.id}` })),
    bricks: level.bricks.map((b) => ({ ...b, hp: b.hp, maxHp: b.hp })),
    barriers: (level.barriers || []).map((item) => ({ ...item })),
    devices: (level.devices || []).map((item) => ({ ...item })),
    extraBalls: [],
    _nextBallId: 1,
    people: [],
    ball: {
      id: 0,
      x: 195,
      y: RULES.paddleY - RULES.ballRadius - 1,
      vx: 0,
      vy: 0,
      r: RULES.ballRadius,
      active: false,
    },
    paddle: { x: 195, y: RULES.paddleY, w: level.paddleWidth, h: RULES.paddleHeight },
    events: [],
    _accumulator: 0,
    _pausedPhase: null,
    _slowUntil: 0,
    _slowAvailableAt: 0,
  };
  return state;
}

export function createEndlessGame(seed = 0) {
  return Object.assign(createState(createEndlessLevel(1, seed)), {
    mode: 'endless',
    seed: seed >>> 0,
    endlessWave: 1,
  });
}

function nextEndlessWave(state) {
  const next = createState(createEndlessLevel(state.endlessWave + 1, state.seed));
  const saved = Object.fromEntries(
    [
      'mode',
      'seed',
      'lives',
      'usedRevive',
      'time',
      'realTime',
      'totalRescued',
      'rescueCombo',
      'bestRescueCombo',
      'wideUntil',
      'events',
      '_accumulator',
    ].map((key) => [key, state[key]]),
  );
  const wave = state.endlessWave + 1;
  Object.assign(state, next, saved, { endlessWave: wave });
  event(state, 'wave', { wave });
}

function setPhase(state, phase) {
  state.phase = phase;
  state.status = phase;
}

export function launchBall(state) {
  if (state.phase !== 'ready' || state.lives <= 0 || state.ball.active) return false;
  const angle = state.level.initialAngle || -0.38;
  state.ball.active = true;
  state.ball.x = state.paddle.x;
  state.ball.y = state.paddle.y - state.ball.r - 1;
  state.ball.vx = Math.sin(angle) * state.level.ballSpeed;
  state.ball.vy = -Math.cos(angle) * state.level.ballSpeed;
  setPhase(state, 'playing');
  event(state, 'launch', { x: state.ball.x, y: state.ball.y });
  return true;
}

export function setPaused(state, paused = true) {
  if (paused && isRunning(state)) {
    state._pausedPhase = state.phase;
    state._accumulator = 0;
    setPhase(state, 'paused');
    return true;
  }
  if (!paused && state.phase === 'paused') {
    setPhase(state, state._pausedPhase || 'ready');
    state._pausedPhase = null;
    return true;
  }
  return false;
}

export function canRevive(state) {
  return (
    state.mode !== 'endless' &&
    state.phase === 'lost' &&
    state.lossReason === 'no-lives' &&
    !state.usedRevive &&
    state.rescued + remainingRescuable(state) >= state.target
  );
}

/** Call only after the host has granted an optional revive reward. */
export function reviveGame(state) {
  if (!canRevive(state)) return false;
  state.usedRevive = true;
  state.lives = 1;
  state.lossReason = null;
  state._accumulator = 0;
  resetBall(state);
  setPhase(state, 'ready');
  event(state, 'revive');
  return true;
}

export function remainingRescuable(state) {
  return (
    state.cages.filter((c) => c.hp > 0).length +
    state.people.filter((p) => p.status === 'waiting' || p.status === 'falling').length
  );
}

function checkResult(state) {
  if (!isRunning(state)) return;
  if (state.rescued >= state.target) {
    if (state.mode === 'endless') {
      nextEndlessWave(state);
      return;
    }
    setPhase(state, 'won');
    stopBalls(state);
    state.slowMotion = false;
    state.timeScale = 1;
    event(state, 'win', { rescued: state.rescued });
  } else if (state.rescued + remainingRescuable(state) < state.target) {
    lose(state, 'not-enough-people');
  } else if (state.lives <= 0) {
    lose(state, 'no-lives');
  }
}

function lose(state, reason) {
  state.lossReason = reason;
  setPhase(state, 'lost');
  stopBalls(state);
  state.slowMotion = false;
  state.timeScale = 1;
  event(state, 'lose', { reason });
}

function stopBalls(state) {
  state.ball.active = false;
  for (const ball of state.extraBalls) ball.active = false;
}

function resetBall(state) {
  state.extraBalls = [];
  Object.assign(state.ball, {
    active: false,
    vx: 0,
    vy: 0,
    x: state.paddle.x,
    y: state.paddle.y - state.ball.r - 1,
  });
}

function releasePerson(state, cage) {
  const y = cage.y + cage.h / 2;
  let releaseAt = state.time + 0.22;
  const travel = (state.paddle.y - RULES.personRadius - y) / state.level.personSpeed;
  // Separate predicted arrivals, including cages at different heights.
  const arrivals = state.people
    .filter((p) => p.status === 'waiting' || p.status === 'falling')
    .map(
      (p) =>
        Math.max(state.time, p.releaseAt) +
        Math.max(0, state.paddle.y - p.r - p.y) / state.level.personSpeed,
    )
    .sort((a, b) => a - b);
  for (const arrival of arrivals) {
    if (Math.abs(releaseAt + travel - arrival) < state.level.releaseGap)
      releaseAt = arrival + state.level.releaseGap - travel;
  }
  const person = {
    id: cage.person,
    cageId: cage.id,
    x: cage.x + cage.w / 2,
    y,
    r: RULES.personRadius,
    role: cage.role || 'teammate',
    originX: cage.x + cage.w / 2,
    status: 'waiting',
    releaseAt,
  };
  state.people.push(person);
  event(state, 'release', { id: person.id, x: person.x, y: person.y, releaseAt });
}

function hitEntity(state, entity, kind, ball) {
  const x = entity.x + entity.w / 2,
    y = entity.y + entity.h / 2;
  if (kind === 'device') {
    if (entity.charges <= 0) return;
    if (entity.kind === 'splitter') {
      const available =
        RULES.maxBalls - [state.ball, ...state.extraBalls].filter((item) => item.active).length;
      if (available <= 0) return; // Do not consume a reward that cannot be granted.
      for (let i = 0; i < Math.min(2, available); i++) {
        const angle = Math.atan2(ball.vy, ball.vx) + (i ? 0.6 : -0.6);
        const speed = state.level.ballSpeed;
        let vx = Math.cos(angle) * speed,
          vy = Math.sin(angle) * speed;
        // A split must not create an axis-aligned orbit inside a closed chamber.
        if (Math.abs(vx) < 18) {
          vx = (vx < 0 ? -1 : 1) * 18;
          vy = (vy < 0 ? -1 : 1) * Math.sqrt(speed ** 2 - vx ** 2);
        }
        if (Math.abs(vy) < speed * 0.22) {
          vy = (vy < 0 ? -1 : 1) * speed * 0.22;
          vx = (vx < 0 ? -1 : 1) * Math.sqrt(speed ** 2 - vy ** 2);
        }
        state.extraBalls.push({
          id: state._nextBallId++,
          x: ball.x,
          y: ball.y,
          r: ball.r,
          active: true,
          vx,
          vy,
        });
      }
    } else if (entity.kind === 'switch') {
      for (const wall of state.barriers) if (wall.group === entity.group) wall.open = true;
    } else if (entity.kind === 'pulse') {
      for (const brick of state.bricks) {
        const nearX = clamp(x, brick.x, brick.x + brick.w),
          nearY = clamp(y, brick.y, brick.y + brick.h);
        if (Math.hypot(nearX - x, nearY - y) > entity.radius) continue;
        for (let hit = 0; hit < 2 && brick.hp > 0; hit++) hitEntity(state, brick, 'brick');
      }
    }
    entity.charges--;
    event(state, 'mechanism', {
      kind: entity.kind,
      id: entity.id,
      x,
      y,
      radius: entity.radius,
      balls: [state.ball, ...state.extraBalls].filter((item) => item.active).length,
    });
    return;
  }
  if (kind === 'barrier') {
    event(state, 'metal', { x, y, gate: Boolean(entity.group) });
    return;
  }
  entity.hp--;
  event(state, 'hit', { kind, id: entity.id, x, y, hp: entity.hp, maxHp: entity.maxHp });
  if (entity.hp === 0) {
    event(state, 'break', { kind, id: entity.id, x, y });
    if (kind === 'cage') releasePerson(state, entity);
  }
}

function bounceRect(ball, rect, previousX, previousY) {
  const nearX = clamp(ball.x, rect.x, rect.x + rect.w);
  const nearY = clamp(ball.y, rect.y, rect.y + rect.h);
  if ((ball.x - nearX) ** 2 + (ball.y - nearY) ** 2 > ball.r ** 2) return false;
  if (previousY + ball.r <= rect.y) {
    ball.y = rect.y - ball.r - 0.01;
    ball.vy = -Math.abs(ball.vy);
  } else if (previousY - ball.r >= rect.y + rect.h) {
    ball.y = rect.y + rect.h + ball.r + 0.01;
    ball.vy = Math.abs(ball.vy);
  } else if (previousX + ball.r <= rect.x) {
    ball.x = rect.x - ball.r - 0.01;
    ball.vx = -Math.abs(ball.vx);
  } else if (previousX - ball.r >= rect.x + rect.w) {
    ball.x = rect.x + rect.w + ball.r + 0.01;
    ball.vx = Math.abs(ball.vx);
  } else {
    // A corner contact falls back to the shallowest penetration axis.
    const xOverlap = Math.min(
      Math.abs(ball.x + ball.r - rect.x),
      Math.abs(rect.x + rect.w - ball.x + ball.r),
    );
    const yOverlap = Math.min(
      Math.abs(ball.y + ball.r - rect.y),
      Math.abs(rect.y + rect.h - ball.y + ball.r),
    );
    if (xOverlap < yOverlap) {
      const left = ball.x < rect.x + rect.w / 2;
      ball.x = left ? rect.x - ball.r - 0.01 : rect.x + rect.w + ball.r + 0.01;
      ball.vx = Math.abs(ball.vx) * (left ? -1 : 1);
    } else {
      const above = ball.y < rect.y + rect.h / 2;
      ball.y = above ? rect.y - ball.r - 0.01 : rect.y + rect.h + ball.r + 0.01;
      ball.vy = Math.abs(ball.vy) * (above ? -1 : 1);
    }
  }
  return true;
}

function moveBall(state, b, dt) {
  const p = state.paddle;
  if (!b.active) return;
  const previousX = b.x,
    previousY = b.y;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  if (b.x - b.r <= RULES.left && b.vx < 0) {
    b.x = RULES.left + b.r;
    b.vx *= -1;
    event(state, 'wall', { x: b.x, y: b.y });
  }
  if (b.x + b.r >= RULES.right && b.vx > 0) {
    b.x = RULES.right - b.r;
    b.vx *= -1;
    event(state, 'wall', { x: b.x, y: b.y });
  }
  if (b.y - b.r <= RULES.top && b.vy < 0) {
    b.y = RULES.top + b.r;
    b.vy *= -1;
    event(state, 'wall', { x: b.x, y: b.y });
  }
  if (
    b.vy > 0 &&
    previousY + b.r <= p.y &&
    b.y + b.r >= p.y &&
    Math.abs(b.x - p.x) <= p.w / 2 + b.r * 0.55
  ) {
    const offset = clamp((b.x - p.x) / (p.w / 2), -1, 1);
    const angle = offset * RULES.maxBounceAngle;
    // A tiny center deflection avoids permanent vertical loops.
    b.vx = Math.sin(angle) * state.level.ballSpeed;
    if (Math.abs(b.vx) < 18) b.vx = (b.vx < 0 || (b.vx === 0 && previousX < 195) ? -1 : 1) * 18;
    b.vy = -Math.sqrt(state.level.ballSpeed ** 2 - b.vx ** 2);
    b.y = p.y - b.r - 0.01;
    event(state, 'bounce', { x: b.x, y: b.y, offset });
  }
  for (const [kind, entities] of [
    ['cage', state.cages],
    ['brick', state.bricks],
    ['barrier', state.barriers],
    ['device', state.devices],
  ]) {
    let hit = false;
    for (const entity of entities) {
      const solid =
        kind === 'barrier' ? !entity.open : kind === 'device' ? entity.charges > 0 : entity.hp > 0;
      if (solid && bounceRect(b, entity, previousX, previousY)) {
        hitEntity(state, entity, kind, b);
        hit = true;
        break;
      }
    }
    if (hit) break;
  }
  if (b.y - b.r > VIEWPORT.height) b.active = false;
}

function moveBalls(state, dt) {
  if (state.phase === 'ready') {
    resetBall(state);
    return;
  }
  const moving = [state.ball, ...state.extraBalls].filter((ball) => ball.active);
  if (!moving.length) return;
  // A reward joins on the next substep, never midway through its spawn collision.
  for (const ball of moving) moveBall(state, ball, dt);
  state.extraBalls = state.extraBalls.filter((ball) => ball.active);
  if (!state.ball.active && state.extraBalls.length) state.ball = state.extraBalls.shift();
  if (!state.ball.active) {
    state.lives--;
    state.rescueCombo = 0;
    event(state, 'ball-lost', { x: state.ball.x, y: VIEWPORT.height, lives: state.lives });
    resetBall(state);
    setPhase(state, 'ready');
    checkResult(state);
  }
}

function personXAt(state, person, time) {
  const wind = state.level.wind;
  if (!wind || !Number.isFinite(person.originX)) return person.x;
  const frequency = (Math.PI * 2) / wind.period;
  return clamp(
    person.originX +
      wind.amplitude *
        (Math.sin(time * frequency + wind.phase) -
          Math.sin(person.releaseAt * frequency + wind.phase)),
    RULES.left + person.r,
    RULES.right - person.r,
  );
}

/** The forecast follows the same wind clock and falling speed as collision. */
export function getPersonLandingX(state, person) {
  const arrival =
    Math.max(state.time, person.releaseAt) +
    Math.max(0, state.paddle.y - person.r - person.y) / state.level.personSpeed;
  return personXAt(state, person, arrival);
}

function movePeople(state, dt) {
  for (const person of state.people) {
    if (person.status === 'waiting' && state.time >= person.releaseAt) {
      person.status = 'falling';
      event(state, 'fall', { id: person.id, x: person.x, y: person.y });
    }
    if (person.status !== 'falling') continue;
    const previousY = person.y;
    person.x = personXAt(state, person, state.time);
    person.y += state.level.personSpeed * dt;
    const p = state.paddle;
    if (
      previousY + person.r <= p.y &&
      person.y + person.r >= p.y &&
      Math.abs(person.x - p.x) <= p.w / 2 + person.r * 0.45
    ) {
      person.status = 'rescued';
      person.y = p.y - person.r;
      state.rescued++;
      state.totalRescued++;
      state.rescueCombo++;
      state.bestRescueCombo = Math.max(state.bestRescueCombo, state.rescueCombo);
      if (state.rescueCombo % 2 === 0) {
        state.wideUntil = Math.max(state.wideUntil, state.realTime + 5);
        event(state, 'rescue-chain', { combo: state.rescueCombo, duration: 5 });
      }
      event(state, 'rescue', { id: person.id, x: person.x, y: person.y, rescued: state.rescued });
      if (person.role === 'engineer') {
        state.wideUntil = Math.max(state.wideUntil, state.realTime + 8);
        event(state, 'engineer', { duration: 8, x: person.x, y: person.y });
      }
      if (person.role === 'medic') {
        const gained = state.lives < state.level.lives;
        state.lives = Math.min(state.level.lives, state.lives + 1);
        event(state, 'medic', { gained, lives: state.lives, x: person.x, y: person.y });
      }
    } else if (person.y + person.r >= RULES.netY) {
      person.status = 'missed';
      person.y = RULES.netY - person.r;
      state.missed++;
      state.rescueCombo = 0;
      event(state, 'miss', { id: person.id, x: person.x, y: person.y, missed: state.missed });
    }
  }
  checkResult(state);
}

function updateSlowMotion(state) {
  const urgent = [state.ball, ...state.extraBalls].some(
    (ball) =>
      ball.active &&
      ball.vy > 0 &&
      ball.y > state.paddle.y - 145 &&
      ball.y < state.paddle.y &&
      state.people.some(
        (person) =>
          person.status === 'falling' &&
          person.y > state.paddle.y - 115 &&
          person.y < state.paddle.y &&
          Math.abs(person.x - ball.x) > state.paddle.w * 0.8,
      ),
  );
  if (state.realTime >= state._slowAvailableAt && urgent) {
    state._slowUntil = state.realTime + RULES.slowDuration;
    state._slowAvailableAt = state._slowUntil + RULES.slowCooldown;
    event(state, 'slow-motion', { duration: RULES.slowDuration });
  }
  state.slowMotion = state.realTime < state._slowUntil;
  state.timeScale = state.slowMotion ? RULES.slowFactor : 1;
}

/** dt is seconds. Fixed substeps keep collision outcomes stable across frame rates. */
export function stepGame(state, dt, input = {}) {
  state.events = [];
  if (!isRunning(state) || !Number.isFinite(dt) || dt <= 0) return state;
  state._accumulator += Math.min(dt, 0.25);
  const targetX = Number.isFinite(input.targetX)
    ? clamp(input.targetX, RULES.left + state.paddle.w / 2, RULES.right - state.paddle.w / 2)
    : state.paddle.x;
  while (state._accumulator + 1e-9 >= FIXED_STEP && isRunning(state)) {
    state._accumulator -= FIXED_STEP;
    state.realTime += FIXED_STEP;
    state.paddle.w = state.level.paddleWidth * (state.realTime < state.wideUntil ? 1.3 : 1);
    const boundedTarget = clamp(
      targetX,
      RULES.left + state.paddle.w / 2,
      RULES.right - state.paddle.w / 2,
    );
    const distance = boundedTarget - state.paddle.x;
    state.paddle.x += clamp(
      distance,
      -RULES.paddleSpeed * FIXED_STEP,
      RULES.paddleSpeed * FIXED_STEP,
    );
    updateSlowMotion(state);
    const simulationDt = FIXED_STEP * state.timeScale;
    state.time += simulationDt;
    movePeople(state, simulationDt);
    if (isRunning(state)) moveBalls(state, simulationDt);
    checkResult(state);
  }
  return state;
}
