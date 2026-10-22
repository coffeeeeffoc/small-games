import { createEndlessLevel, createEndlessLayer, environmentAt, PICKUPS } from './levels.mjs';
// Bump for ranked simulation/content/scoring changes; presentation changes keep this version.
export const RANKED_RULE_VERSION = 'tower-ranked-v2';
/** DOM-free, deterministic Tower Brake simulation. Distances are world units. */
export const TAU = Math.PI * 2;
export const BALL_ANGLE = Math.PI / 2;
export const BALL_RADIUS = 12;
export const ORBIT_RADIUS = 88;
export const GRAVITY = 900;
export const BOUNCE_SPEED = -280;
export const MAX_FALL_SPEED = 420;
export const BRAKE_DURATION = 0.8;
export const MAX_STEP = 1 / 120;

const EPSILON = 1e-9;
export const normalizeAngle = (angle) => ((angle % TAU) + TAU) % TAU;
const signedAngle = (angle) => normalizeAngle(angle + Math.PI) - Math.PI;
const inArc = (angle, arc) =>
  !!arc && normalizeAngle(angle - arc.start) < normalizeAngle(arc.end - arc.start);

/** Oscillating machinery uses simulation time, including a ball-only brake. */
export function layerRotationAt(layer, elapsed = 0) {
  return layer.spinSpeed ? 0.36 * Math.sin((elapsed * layer.spinSpeed) / 0.36) : 0;
}

/** Gap takes precedence only at a shared boundary; content validation forbids overlap. */
export function sectorAt(layer, localAngle, radius = 0) {
  if (layer.finish) return 'finish';
  const angle = normalizeAngle(localAngle);
  const margin = Math.asin(Math.min(0.95, Math.max(0, radius) / ORBIT_RADIUS));
  if (
    inArc(angle, layer.gap) &&
    normalizeAngle(angle - layer.gap.start) >= margin &&
    normalizeAngle(layer.gap.end - angle) > margin
  )
    return 'gap';
  if (
    layer.danger.some(
      (arc) =>
        inArc(angle, arc) ||
        Math.abs(signedAngle(angle - arc.start)) < margin ||
        Math.abs(signedAngle(angle - arc.end)) < margin,
    )
  )
    return 'danger';
  return 'normal';
}

function emit(state, type, data = {}) {
  state.events.push({ type, at: state.elapsed, ...data });
  // Consumers drain the queue with splice(0); bound it for background previews.
  if (state.events.length > 120) state.events.splice(0, state.events.length - 120);
}

export function createGame(level) {
  if (!level?.layers?.length) throw new TypeError('A level with layers is required.');
  const first = level.layers[0];
  const environment = environmentAt(level, first.y);
  return {
    level,
    mode: 'campaign',
    layerOffset: 0,
    totalFloors: 0,
    status: 'playing',
    y: first.y - environment.radius,
    ballRadius: environment.radius,
    speedScale: environment.speed,
    environment,
    wind: 0,
    shield: false,
    slowLeft: 0,
    rewardedThrough: -1,
    paused: false,
    v: BOUNCE_SPEED,
    rotation: 0,
    nextLayer: 0,
    streak: 0,
    maxStreak: 0,
    charge: 1,
    brakeLeft: 0,
    elapsed: 0,
    brakesUsed: 0,
    events: [],
    lastCheckpoint: { layer: 0, y: first.y - environment.radius, rotation: 0 },
    continued: false,
    passes: 0,
    score: 0,
    bounces: 0,
    failureLayer: null,
  };
}

export function createEndlessGame(seed = 0) {
  return Object.assign(createGame(createEndlessLevel(seed)), { mode: 'endless', seed: seed >>> 0 });
}

function extendEndless(state) {
  if (state.mode !== 'endless') return;
  if (state.nextLayer >= 24) {
    const count = state.nextLayer - 1;
    state.level.layers.splice(0, count);
    state.layerOffset += count;
    state.nextLayer -= count;
    state.lastCheckpoint = null; // Endless runs never rewind already-scored floors.
  }
  while (state.level.layers.length < state.nextLayer + 12) {
    const index = state.layerOffset + state.level.layers.length;
    state.level.layers.push(createEndlessLayer(index, state.seed));
  }
}

export function rotate(state, delta) {
  if (state.status !== 'playing' || state.paused || !Number.isFinite(delta)) return false;
  state.rotation = normalizeAngle(state.rotation + delta);
  return true;
}

export function brake(state) {
  if (state.status !== 'playing' || state.paused || state.charge !== 1 || state.brakeLeft > EPSILON)
    return false;
  state.charge = 0;
  state.brakeLeft = BRAKE_DURATION;
  state.streak = 0;
  state.brakesUsed += 1;
  emit(state, 'brake', { layer: state.nextLayer });
  return true;
}

/** The visible forecast and collision use exactly the same sector classification. */
export function getLanding(state, offset = 0) {
  const index = state.nextLayer + offset;
  const layer = state.level.layers[index];
  if (!layer) return null;
  const effectiveRotation = state.rotation + layerRotationAt(layer, state.elapsed);
  const angle = normalizeAngle(BALL_ANGLE - effectiveRotation);
  const center = layer.gap
    ? normalizeAngle(layer.gap.start + normalizeAngle(layer.gap.end - layer.gap.start) / 2)
    : angle;
  return {
    index,
    number: (layer.index ?? index) + 1,
    y: layer.y,
    type: sectorAt(layer, angle, state.ballRadius),
    radius: state.ballRadius,
    angle,
    effectiveRotation,
    rotationToGap: signedAngle(BALL_ANGLE - center - effectiveRotation),
    layer,
  };
}

function motionAfter(y, v, time, scale = 1) {
  const gravity = GRAVITY * scale,
    maxSpeed = MAX_FALL_SPEED * scale;
  const accelerating = Math.min(time, Math.max(0, (maxSpeed - v) / gravity));
  const acceleratedY = y + v * accelerating + (gravity * accelerating * accelerating) / 2;
  const speed = Math.min(maxSpeed, v + gravity * accelerating);
  return { y: acceleratedY + speed * (time - accelerating), v: speed };
}

/** Exact descending intersection prevents tunneling at low frame rates. */
function timeToSurface(y, v, surface, scale = 1) {
  const gravity = GRAVITY * scale,
    maxSpeed = MAX_FALL_SPEED * scale;
  const distance = surface - y;
  if (distance < -EPSILON) return 0;
  const capTime = Math.max(0, (maxSpeed - v) / gravity);
  const capY = y + v * capTime + (gravity * capTime * capTime) / 2;
  if (surface > capY) return capTime + (surface - capY) / maxSpeed;
  return Math.max(0, (-v + Math.sqrt(Math.max(0, v * v + 2 * gravity * distance))) / gravity);
}

function advancePhysics(state, duration) {
  let remaining = duration;
  while (remaining > EPSILON && state.status === 'playing') {
    const layer = state.level.layers[state.nextLayer];
    if (!layer) break;
    state.environment = environmentAt(state.level, state.y);
    state.ballRadius = state.environment.radius;
    state.speedScale = state.environment.speed * (state.slowLeft > 0 ? 0.64 : 1);
    const surface = layer.y - state.ballRadius;
    // Growing in denser air must not turn an upward rebound into a second zero-time hit.
    if (state.y > surface && state.v < 0) state.y = surface;
    const scale = (layer.gravityScale || 1) * state.speedScale;
    const hitTime = timeToSurface(state.y, state.v, surface, scale);
    const travelTime = Math.min(remaining, hitTime);
    const motion = motionAfter(state.y, state.v, travelTime, scale);
    state.y = motion.y;
    state.v = motion.v;
    state.elapsed += travelTime;
    advanceAtmosphere(state, travelTime);
    remaining -= travelTime;
    if (hitTime > travelTime + EPSILON) break;

    state.y = surface;
    const type = sectorAt(
      layer,
      BALL_ANGLE - state.rotation - layerRotationAt(layer, state.elapsed),
      state.ballRadius,
    );
    const layerIndex = state.nextLayer;
    if (type === 'gap') {
      state.nextLayer += 1;
      const fresh = layer.index > state.rewardedThrough;
      if (fresh) {
        state.rewardedThrough = layer.index;
        state.passes += 1;
        state.totalFloors += 1;
        state.streak += 1;
        state.maxStreak = Math.max(state.maxStreak, state.streak);
        const points = 100 * Math.min(5, state.streak);
        state.score += points;
        emit(state, 'pass', { layer: layerIndex, streak: state.streak, points });
        if (state.streak % 3 === 0 && state.charge === 0) {
          state.charge = 1;
          emit(state, 'charge', { layer: layerIndex, streak: state.streak });
        }
        if (layer.pickup) {
          if (layer.pickup === 'shield') state.shield = true;
          if (layer.pickup === 'brake') state.charge = 1;
          if (layer.pickup === 'slow')
            state.slowLeft = PICKUPS.find((item) => item.kind === 'slow').duration;
          emit(state, 'pickup', { kind: layer.pickup, layer: layerIndex });
        }
      } else state.streak = 0;
      extendEndless(state);
    } else if (type === 'normal') {
      state.v = BOUNCE_SPEED;
      state.streak = 0;
      state.bounces += 1;
      state.lastCheckpoint = {
        layer: layerIndex,
        y: surface,
        rotation: state.rotation,
        effectiveRotation: state.rotation + layerRotationAt(layer, state.elapsed),
      };
      emit(state, 'bounce', { layer: layerIndex });
    } else if (type === 'danger') {
      if (state.shield) {
        state.shield = false;
        state.v = BOUNCE_SPEED;
        state.streak = 0;
        state.bounces += 1;
        emit(state, 'shield-hit', { layer: layerIndex });
        continue;
      }
      state.status = 'lost';
      state.v = 0;
      state.failureLayer = layerIndex;
      emit(state, 'lost', { layer: layerIndex });
    } else {
      state.status = 'won';
      state.v = 0;
      state.nextLayer = state.level.layers.length;
      state.streak = 0;
      emit(state, 'won', { layer: layerIndex });
    }
  }
}

function advanceAtmosphere(state, dt) {
  state.slowLeft = Math.max(0, state.slowLeft - dt);
  // The first platform is a safe place to learn; wind begins after the first pass.
  const strength = state.totalFloors > 0 ? state.environment.wind : 0;
  state.wind = strength * Math.sin(state.elapsed * 0.6);
  state.rotation = normalizeAngle(
    state.rotation +
      (strength / 0.6) * (Math.cos((state.elapsed - dt) * 0.6) - Math.cos(state.elapsed * 0.6)),
  );
}

/** dt is seconds. Pausing is a host concern: skip step while the pause screen is open. */
export function step(state, dt) {
  if (state.status !== 'playing' || state.paused || !Number.isFinite(dt) || dt <= 0) return state;
  let remaining = dt;
  while (remaining > EPSILON && state.status === 'playing') {
    if (state.brakeLeft > EPSILON) {
      const frozen = Math.min(remaining, state.brakeLeft);
      state.brakeLeft = Math.max(0, state.brakeLeft - frozen);
      state.elapsed += frozen;
      advanceAtmosphere(state, frozen);
      remaining -= frozen;
      if (state.brakeLeft <= EPSILON) {
        state.brakeLeft = 0;
        emit(state, 'brake-end', { layer: state.nextLayer });
      }
      continue;
    }
    const time = Math.min(
      MAX_STEP,
      remaining,
      state.slowLeft > EPSILON ? state.slowLeft : Infinity,
    );
    advancePhysics(state, time);
    remaining -= time;
  }
  return state;
}

/** One safe retry at the latest ordinary landing. The run stays marked as continued. */
export function resumeCheckpoint(state) {
  if (
    state.mode === 'endless' ||
    state.status !== 'lost' ||
    state.continued ||
    !state.lastCheckpoint
  )
    return false;
  const checkpoint = state.lastCheckpoint;
  state.status = 'playing';
  state.y = checkpoint.y;
  state.environment = environmentAt(state.level, state.y);
  state.ballRadius = state.environment.radius;
  state.y = state.level.layers[checkpoint.layer].y - state.ballRadius;
  state.v = BOUNCE_SPEED;
  state.rotation = normalizeAngle(
    (checkpoint.effectiveRotation ?? checkpoint.rotation) -
      layerRotationAt(state.level.layers[checkpoint.layer], state.elapsed),
  );
  state.nextLayer = checkpoint.layer;
  state.streak = 0;
  state.charge = 1;
  state.brakeLeft = 0;
  state.failureLayer = null;
  state.continued = true;
  emit(state, 'resume', { layer: checkpoint.layer });
  return true;
}
