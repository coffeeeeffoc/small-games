import { validateLevels } from './levels.mjs';

export const RULES = Object.freeze({
  startDistance: 12,
  captureDistance: 1.5,
  successGain: 0.15,
  comboTarget: 3,
  boostDuration: 2,
  boostGain: 3,
  boostSpeedMultiplier: 1.2,
  slowDuration: 1.2,
  collisionLoss: 2.5,
  slowSpeedMultiplier: 0.55,
  collisionLimit: 3,
  jumpDuration: 1.1,
  slideDuration: 1.05,
  jumpStart: 0.06,
  jumpEnd: 0.08,
  slideStart: 0.03,
  slideEnd: 0.05,
});

const EPSILON = 1e-9;

/** A preset clear-lane route, independent of the changing player/thief gap. */
export function thiefLaneAt(level, world) {
  const wave = level.waves.find((item) => item.at > world + EPSILON) ?? level.waves.at(-1);
  return [0, 1, 2].find((lane) => !wave.obstacles.some((item) => item.lane === lane));
}

export function createRun(level) {
  const errors = validateLevels([level]);
  if (errors.length) throw new TypeError(errors.join('\n'));
  return {
    phase: 'running',
    levelId: level.id,
    level,
    elapsed: 0,
    remaining: level.duration,
    world: 0,
    distance: RULES.startDistance,
    lane: 1,
    laneVisual: 1,
    action: 'run',
    actionRemaining: 0,
    combo: 0,
    successes: 0,
    bestCombo: 0,
    boosts: 0,
    collisions: 0,
    boostRemaining: 0,
    slowRemaining: 0,
    thiefLane: thiefLaneAt(level, 0),
    clearedWaveIds: [],
    events: [],
  };
}

function emit(state, type, detail = {}) {
  state.events.push({ type, elapsed: state.elapsed, ...detail });
}

/** Accepted actions return true; ignored/paused inputs never alter the run. */
export function act(state, action) {
  if (state.phase !== 'running') return false;
  if (action === 'left' || action === 'right') {
    const lane = Math.max(0, Math.min(2, state.lane + (action === 'left' ? -1 : 1)));
    if (lane === state.lane) return false;
    state.lane = lane;
  } else if (action === 'jump' || action === 'slide') {
    if (state.action !== 'run') return false;
    state.action = action;
    state.actionRemaining = action === 'jump' ? RULES.jumpDuration : RULES.slideDuration;
  } else {
    return false;
  }
  emit(state, 'action', { action, lane: state.lane });
  return true;
}

function currentSpeed(state) {
  const factor =
    state.slowRemaining > EPSILON
      ? RULES.slowSpeedMultiplier
      : state.boostRemaining > EPSILON
        ? RULES.boostSpeedMultiplier
        : 1;
  return state.level.speed * factor;
}

function avoids(state, obstacle) {
  if (!obstacle) return true;
  if (obstacle.type === 'barrier' && state.action === 'jump') {
    const age = RULES.jumpDuration - state.actionRemaining;
    return age + EPSILON >= RULES.jumpStart && state.actionRemaining + EPSILON >= RULES.jumpEnd;
  }
  if (obstacle.type === 'beam' && state.action === 'slide') {
    const age = RULES.slideDuration - state.actionRemaining;
    return age + EPSILON >= RULES.slideStart && state.actionRemaining + EPSILON >= RULES.slideEnd;
  }
  return false;
}

function finish(state, phase, reason) {
  if (state.phase !== 'running') return;
  state.phase = phase;
  emit(state, phase === 'won' ? 'win' : 'lose', {
    reason,
    distance: state.distance,
    collisions: state.collisions,
    successes: state.successes,
  });
}

function resolveWave(state, wave) {
  state.clearedWaveIds.push(wave.id);
  const obstacle = wave.obstacles.find((item) => item.lane === state.lane);
  if (!avoids(state, obstacle)) {
    state.collisions += 1;
    state.combo = 0;
    state.boostRemaining = 0;
    state.slowRemaining = RULES.slowDuration;
    state.distance += RULES.collisionLoss;
    state.action = 'run';
    state.actionRemaining = 0;
    emit(state, 'collision', {
      waveId: wave.id,
      obstacle: obstacle.type,
      lane: state.lane,
      collisions: state.collisions,
      distance: state.distance,
      penalty: RULES.collisionLoss,
    });
    if (state.collisions >= RULES.collisionLimit) finish(state, 'lost', 'collisions');
    return;
  }
  state.successes += 1;
  state.combo += 1;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  state.distance = Math.max(0, state.distance - RULES.successGain);
  emit(state, 'success', {
    waveId: wave.id,
    combo: state.combo,
    successes: state.successes,
    distance: state.distance,
  });
  if (state.combo === RULES.comboTarget) {
    state.combo = 0;
    state.boosts += 1;
    state.boostRemaining = RULES.boostDuration;
    state.slowRemaining = 0;
    emit(state, 'boost', {
      duration: RULES.boostDuration,
      gain: RULES.boostGain,
      boosts: state.boosts,
    });
  }
  if (state.distance <= RULES.captureDistance + EPSILON) {
    state.distance = Math.min(state.distance, RULES.captureDistance);
    finish(state, 'won', 'caught');
  }
}

/**
 * Time is split at every wave, effect expiration and finish boundary. A slow
 * frame therefore cannot skip a collision or consume an entire fresh boost.
 * Pausing freezes every gameplay clock; event ownership stays with the UI.
 */
export function updateRun(state, dt) {
  if (state.phase !== 'running' || !Number.isFinite(dt) || dt <= 0) return state;
  state.thiefLane = thiefLaneAt(state.level, state.world);
  let timeLeft = dt;
  while (timeLeft > EPSILON && state.phase === 'running') {
    const wave = state.level.waves.find((item) => !state.clearedWaveIds.includes(item.id));
    if (wave && wave.at <= state.world + EPSILON) {
      state.world = Math.max(state.world, wave.at);
      resolveWave(state, wave);
      continue;
    }
    if (state.distance <= RULES.captureDistance + EPSILON) {
      finish(state, 'won', 'caught');
      break;
    }
    if (state.remaining <= EPSILON) {
      state.remaining = 0;
      finish(state, 'lost', 'timeout');
      break;
    }

    const speed = currentSpeed(state);
    let step = Math.min(timeLeft, state.remaining);
    if (wave) step = Math.min(step, (wave.at - state.world) / speed);
    if (state.actionRemaining > EPSILON) step = Math.min(step, state.actionRemaining);
    if (state.slowRemaining > EPSILON) step = Math.min(step, state.slowRemaining);
    if (state.boostRemaining > EPSILON) {
      step = Math.min(step, state.boostRemaining);
      step = Math.min(
        step,
        (state.distance - RULES.captureDistance) / (RULES.boostGain / RULES.boostDuration),
      );
    }

    state.world += speed * step;
    state.elapsed = Math.min(state.level.duration, state.elapsed + step);
    state.remaining = Math.max(0, state.level.duration - state.elapsed);
    state.laneVisual = state.lane + (state.laneVisual - state.lane) * Math.exp(-18 * step);
    if (state.boostRemaining > EPSILON) {
      state.distance = Math.max(0, state.distance - (step * RULES.boostGain) / RULES.boostDuration);
    }
    state.boostRemaining = Math.max(0, state.boostRemaining - step);
    state.slowRemaining = Math.max(0, state.slowRemaining - step);
    state.actionRemaining = Math.max(0, state.actionRemaining - step);
    if (state.actionRemaining <= EPSILON) {
      state.actionRemaining = 0;
      state.action = 'run';
    }
    state.thiefLane = thiefLaneAt(state.level, state.world);
    timeLeft -= step;

    // Resolve exact final boundaries even when the caller's frame ends there.
    if (wave && wave.at <= state.world + EPSILON) resolveWave(state, wave);
    if (state.phase === 'running' && state.distance <= RULES.captureDistance + EPSILON) {
      state.distance = Math.min(state.distance, RULES.captureDistance);
      finish(state, 'won', 'caught');
    } else if (state.phase === 'running' && state.remaining <= EPSILON) {
      state.remaining = 0;
      finish(state, 'lost', 'timeout');
    }
  }
  return state;
}
