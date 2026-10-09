import { layouts } from './layouts.mjs';
export const physics = Object.freeze({
  radius: 158,
  puck: 14,
  step: 1 / 120,
  friction: 205,
  restitution: 0.72,
  maxSpeed: 220,
  safeRounds: 5,
  shrinkPerRound: 18,
  minRadius: 18,
  shrinkDuration: 0.75,
});
export function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function arenaRadius(state) {
  return state.radius ?? physics.radius;
}
export function nextArenaRadius(state) {
  if (state.shrink) return state.shrink.targetRadius;
  return Math.max(
    physics.minRadius,
    physics.radius - Math.max(0, state.turn + 1 - physics.safeRounds) * physics.shrinkPerRound,
  );
}
// Match the semi-implicit friction integration used by step, including the final partial step.
export function shotDistance(power) {
  if (!Number.isFinite(power) || power <= 0) return 0;
  const speed = physics.maxSpeed * Math.min(1, Math.max(0.08, power)),
    decrement = physics.friction * physics.step,
    count = Math.ceil(speed / decrement);
  return physics.step * (count * speed - (decrement * count * (count - 1)) / 2);
}
export const travelDistance = shotDistance;
export function createMatch(layout = layouts[0], seed = Date.now()) {
  return {
    layout: layout.id,
    seed,
    discs: layout.points.map(([x, y], id) => ({ id, x, y, vx: 0, vy: 0, alive: true, fall: 0 })),
    active: 0,
    turn: 1,
    shots: 0,
    playerShots: 0,
    radius: physics.radius,
    shrink: null,
    phase: 'aim',
    winner: null,
    events: [],
    lastShot: null,
    elapsed: 0,
    knocked: 0,
  };
}
export function shoot(state, x, y, power) {
  if (
    state.phase !== 'aim' ||
    !Number.isFinite(x + y + power) ||
    Math.hypot(x, y) < 0.001 ||
    power <= 0
  )
    return false;
  const d = state.discs[state.active],
    length = Math.hypot(x, y);
  if (!d?.alive) return false;
  const strength = Math.min(1, Math.max(0.08, power)),
    speed = physics.maxSpeed * strength;
  d.vx = (x / length) * speed;
  d.vy = (y / length) * speed;
  state.lastShot = { actor: d.id, x: x / length, y: y / length, power: strength };
  state.phase = 'moving';
  state.elapsed = 0;
  state.shots++;
  if (d.id === 0) state.playerShots++;
  state.knocked = 0;
  state.events.push({ type: 'shot', id: d.id });
  return true;
}
function eliminateOutside(state, reason) {
  for (const d of state.discs) {
    // Partial overhang stays in play. No invisible rail or edge bounce.
    if (d.alive && Math.hypot(d.x, d.y) > arenaRadius(state) + physics.puck) {
      d.alive = false;
      d.vx = 0;
      d.vy = 0;
      state.knocked++;
      state.events.push({ type: 'out', id: d.id, x: d.x, y: d.y, reason });
    }
  }
}
function settleWinner(state) {
  const alive = state.discs.filter((d) => d.alive);
  if (alive.length > 1) return false;
  state.phase = 'over';
  state.shrink = null;
  state.winner = alive[0]?.id ?? -1;
  state.events.push({ type: 'end', winner: state.winner });
  return true;
}
function advanceTurn(state) {
  if (settleWinner(state)) return;
  let next = state.active,
    wrapped = false;
  do {
    next = (next + 1) % state.discs.length;
    if (next === 0) wrapped = true;
  } while (!state.discs[next].alive);
  if (wrapped) {
    const targetRadius = nextArenaRadius(state);
    state.turn++;
    if (targetRadius < arenaRadius(state)) {
      state.shrink = {
        fromRadius: arenaRadius(state),
        targetRadius,
        progress: 0,
        duration: physics.shrinkDuration,
        nextActive: next,
      };
      state.phase = 'shrinking';
      state.events.push({
        type: 'shrink',
        fromRadius: arenaRadius(state),
        targetRadius,
        turn: state.turn,
      });
      return;
    }
  }
  state.active = next;
  state.phase = 'aim';
}
// Fixed 120 Hz steps keep contacts and the warning's contraction independent of display refresh rate.
export function step(state) {
  if (state.phase === 'shrinking') {
    const shrink = state.shrink;
    shrink.progress = Math.min(1, shrink.progress + physics.step / shrink.duration);
    state.radius = shrink.fromRadius + (shrink.targetRadius - shrink.fromRadius) * shrink.progress;
    eliminateOutside(state, 'ring');
    if (shrink.progress >= 1) {
      state.radius = shrink.targetRadius;
      if (settleWinner(state)) return;
      let next = shrink.nextActive;
      while (!state.discs[next].alive) next = (next + 1) % state.discs.length;
      state.active = next;
      state.shrink = null;
      state.phase = 'aim';
    }
    return;
  }
  if (state.phase !== 'moving') return;
  const dt = physics.step;
  state.elapsed += dt;
  for (const d of state.discs) {
    if (!d.alive) continue;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    const speed = Math.hypot(d.vx, d.vy),
      next = Math.max(0, speed - physics.friction * dt);
    if (speed) {
      d.vx *= next / speed;
      d.vy *= next / speed;
    }
  }
  for (let i = 0; i < state.discs.length; i++)
    for (let j = i + 1; j < state.discs.length; j++) {
      const a = state.discs[i],
        b = state.discs[j];
      if (!a.alive || !b.alive) continue;
      const dx = b.x - a.x,
        dy = b.y - a.y,
        length = Math.hypot(dx, dy);
      if (length >= physics.puck * 2) continue;
      const nx = length > 0 ? dx / length : 1,
        ny = length > 0 ? dy / length : 0;
      const overlap = (physics.puck * 2 - length) / 2 + 0.0001;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;
      const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (relative < 0) {
        const impulse = (-(1 + physics.restitution) * relative) / 2;
        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;
        if (relative < -12)
          state.events.push({
            type: 'hit',
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
            force: -relative,
          });
      }
    }
  eliminateOutside(state, 'shot');
  if (state.discs.every((d) => !d.alive || Math.hypot(d.vx, d.vy) < 0.01)) advanceTurn(state);
}
function previewShot(state, angle, power) {
  const trial = {
    ...state,
    discs: state.discs.map((d) => ({ ...d })),
    events: [],
    shrink: null,
  };
  shoot(trial, Math.cos(angle), Math.sin(angle), power);
  for (let i = 0; i < 300 && (trial.phase === 'moving' || trial.phase === 'shrinking'); i++)
    step(trial);
  return trial;
}
export function chooseBot(
  state,
  random = seeded((state.seed ^ Math.imul(state.shots + 1, 0x9e3779b1)) >>> 0),
) {
  const actor = state.discs[state.active];
  if (!actor?.alive || state.phase !== 'aim') return null;
  const opponents = state.discs.filter((d) => d.alive && d !== actor),
    radial = (d) => Math.hypot(d.x, d.y),
    distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    nearestBefore = Math.min(...opponents.map((d) => distance(actor, d))),
    angles = [Math.atan2(-actor.y, -actor.x)];
  for (const target of opponents) {
    const direct = Math.atan2(target.y - actor.y, target.x - actor.x);
    for (const offset of [0, -0.11, 0.11, -0.28, 0.28]) angles.push(direct + offset);
    // Approach the inner side of a rival so a later hit pushes outward.
    const r = radial(target) || 1,
      innerX = target.x - (target.x / r) * 55,
      innerY = target.y - (target.y / r) * 55;
    angles.push(Math.atan2(innerY - actor.y, innerX - actor.x));
  }
  // A small seeded aim error makes a hittable opponent a choice rather than a guaranteed hit.
  const aimError = (random() - 0.5) * 0.13;
  let best = null;
  for (const angle of angles)
    for (const power of [0.24, 0.4, 0.58, 0.74, 0.9, 1]) {
      const trial = previewShot(state, angle, power),
        after = trial.discs[actor.id];
      let score = -500;
      if (after.alive) {
        const radius = arenaRadius(trial),
          safety = Math.max(0, radial(after) - (radius - 27)),
          survivors = opponents.filter((d) => trial.discs[d.id].alive),
          nearestAfter = survivors.length
            ? Math.min(...survivors.map((d) => distance(after, trial.discs[d.id])))
            : 0;
        score =
          (nearestBefore - nearestAfter) * 0.045 - radial(after) * 0.018 - safety * safety * 0.013;
        for (const d of opponents) {
          const rival = trial.discs[d.id];
          score += rival.alive ? (radial(rival) - radial(d)) * 0.16 : 65;
        }
        if (trial.winner === actor.id) score += 80;
        // Small tie variation avoids a repeating scripted opening without overriding a good move.
        score -= power * power * 1.8;
        score += (random() - 0.5) * 0.9;
      }
      if (!best || score > best.score) best = { angle, power, score };
    }
  return {
    x: Math.cos(best.angle + aimError),
    y: Math.sin(best.angle + aimError),
    power: best.power,
  };
}
