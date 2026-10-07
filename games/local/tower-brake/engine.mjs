/** DOM-free, deterministic Tower Brake simulation. Distances are world units. */
export const TAU = Math.PI * 2;
export const BALL_ANGLE = Math.PI / 2;
export const BALL_RADIUS = 12;
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

/** Gap takes precedence only at a shared boundary; content validation forbids overlap. */
export function sectorAt(layer, localAngle) {
  if (layer.finish) return 'finish';
  const angle = normalizeAngle(localAngle);
  if (inArc(angle, layer.gap)) return 'gap';
  if (layer.danger.some((arc) => inArc(angle, arc))) return 'danger';
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
  return {
    level,
    status: 'playing',
    y: first.y - BALL_RADIUS,
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
    lastCheckpoint: { layer: 0, y: first.y - BALL_RADIUS, rotation: 0 },
    continued: false,
    passes: 0,
    bounces: 0,
    failureLayer: null,
  };
}

export function rotate(state, delta) {
  if (state.status !== 'playing' || !Number.isFinite(delta)) return false;
  state.rotation = normalizeAngle(state.rotation + delta);
  return true;
}

export function brake(state) {
  if (state.status !== 'playing' || state.charge !== 1 || state.brakeLeft > EPSILON) return false;
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
  const angle = normalizeAngle(BALL_ANGLE - state.rotation);
  const center = layer.gap
    ? normalizeAngle(layer.gap.start + normalizeAngle(layer.gap.end - layer.gap.start) / 2)
    : angle;
  return {
    index,
    number: index + 1,
    y: layer.y,
    type: sectorAt(layer, angle),
    angle,
    rotationToGap: signedAngle(BALL_ANGLE - center - state.rotation),
    layer,
  };
}

function motionAfter(y, v, time) {
  const accelerating = Math.min(time, Math.max(0, (MAX_FALL_SPEED - v) / GRAVITY));
  const acceleratedY = y + v * accelerating + (GRAVITY * accelerating * accelerating) / 2;
  const speed = Math.min(MAX_FALL_SPEED, v + GRAVITY * accelerating);
  return { y: acceleratedY + speed * (time - accelerating), v: speed };
}

/** Exact descending intersection prevents tunneling at low frame rates. */
function timeToSurface(y, v, surface) {
  const distance = surface - y;
  if (distance < -EPSILON) return 0;
  const capTime = Math.max(0, (MAX_FALL_SPEED - v) / GRAVITY);
  const capY = y + v * capTime + (GRAVITY * capTime * capTime) / 2;
  if (surface > capY) return capTime + (surface - capY) / MAX_FALL_SPEED;
  return Math.max(0, (-v + Math.sqrt(Math.max(0, v * v + 2 * GRAVITY * distance))) / GRAVITY);
}

function advancePhysics(state, duration) {
  let remaining = duration;
  while (remaining > EPSILON && state.status === 'playing') {
    const layer = state.level.layers[state.nextLayer];
    if (!layer) break;
    const surface = layer.y - BALL_RADIUS;
    const hitTime = timeToSurface(state.y, state.v, surface);
    const travelTime = Math.min(remaining, hitTime);
    const motion = motionAfter(state.y, state.v, travelTime);
    state.y = motion.y;
    state.v = motion.v;
    state.elapsed += travelTime;
    remaining -= travelTime;
    if (hitTime > travelTime + EPSILON) break;

    state.y = surface;
    const type = sectorAt(layer, BALL_ANGLE - state.rotation);
    const layerIndex = state.nextLayer;
    if (type === 'gap') {
      state.nextLayer += 1;
      state.passes += 1;
      state.streak += 1;
      state.maxStreak = Math.max(state.maxStreak, state.streak);
      emit(state, 'pass', { layer: layerIndex, streak: state.streak });
      if (state.streak % 3 === 0 && state.charge === 0) {
        state.charge = 1;
        emit(state, 'charge', { layer: layerIndex, streak: state.streak });
      }
    } else if (type === 'normal') {
      state.v = BOUNCE_SPEED;
      state.streak = 0;
      state.bounces += 1;
      state.lastCheckpoint = { layer: layerIndex, y: surface, rotation: state.rotation };
      emit(state, 'bounce', { layer: layerIndex });
    } else if (type === 'danger') {
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

/** dt is seconds. Pausing is a host concern: skip step while the pause screen is open. */
export function step(state, dt) {
  if (state.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return state;
  let remaining = dt;
  while (remaining > EPSILON && state.status === 'playing') {
    if (state.brakeLeft > EPSILON) {
      const frozen = Math.min(remaining, state.brakeLeft);
      state.brakeLeft = Math.max(0, state.brakeLeft - frozen);
      state.elapsed += frozen;
      remaining -= frozen;
      if (state.brakeLeft <= EPSILON) {
        state.brakeLeft = 0;
        emit(state, 'brake-end', { layer: state.nextLayer });
      }
      continue;
    }
    const time = Math.min(MAX_STEP, remaining);
    advancePhysics(state, time);
    remaining -= time;
  }
  return state;
}

/** One safe retry at the latest ordinary landing. The run stays marked as continued. */
export function resumeCheckpoint(state) {
  if (state.status !== 'lost' || state.continued || !state.lastCheckpoint) return false;
  const checkpoint = state.lastCheckpoint;
  state.status = 'playing';
  state.y = checkpoint.y;
  state.v = BOUNCE_SPEED;
  state.rotation = checkpoint.rotation;
  state.nextLayer = checkpoint.layer;
  state.streak = 0;
  state.charge = 1;
  state.brakeLeft = 0;
  state.failureLayer = null;
  state.continued = true;
  emit(state, 'resume', { layer: checkpoint.layer });
  return true;
}
