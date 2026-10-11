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
    state.rules?.minRadius ?? physics.minRadius,
    (state.rules?.radius ?? physics.radius) -
      Math.max(0, state.turn + 1 - (state.rules?.safeRounds ?? physics.safeRounds)) *
        (state.rules?.shrinkPerRound ?? physics.shrinkPerRound),
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
export function createMatch(layout = layouts[0], seed = Date.now(), options = {}) {
  if (
    !Array.isArray(layout.points) ||
    layout.points.length < 2 ||
    layout.points.length > 4 ||
    layout.points.some(
      (point) => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite),
    )
  )
    throw new Error('擂台需要 2–4 个有效出生点');
  let order = [...(options.order ?? layout.order ?? layout.points.map((_, id) => id))];
  if (
    order.length !== layout.points.length ||
    new Set(order).size !== order.length ||
    order.some((id) => !Number.isInteger(id) || id < 0 || id >= layout.points.length)
  )
    throw new Error('行动顺序必须包含全部玩家且不重复');
  const startActor = options.startActor ?? order[0];
  if (!order.includes(startActor)) throw new Error('先手玩家无效');
  const start = order.indexOf(startActor);
  order = [...order.slice(start), ...order.slice(0, start)];
  const rules = { ...physics, ...layout.rules };
  if (
    !Number.isFinite(rules.radius) ||
    rules.radius <= physics.puck ||
    !Number.isInteger(rules.safeRounds) ||
    rules.safeRounds < 0 ||
    !Number.isFinite(rules.shrinkPerRound) ||
    rules.shrinkPerRound <= 0 ||
    !Number.isFinite(rules.minRadius) ||
    rules.minRadius <= 0 ||
    rules.minRadius > rules.radius ||
    !Number.isFinite(rules.shrinkDuration) ||
    rules.shrinkDuration <= 0
  )
    throw new Error('缩圈规则无效');
  const stats = () => layout.points.map(() => 0);
  return {
    layout: layout.id,
    seed,
    discs: layout.points.map(([x, y], id) => ({ id, x, y, vx: 0, vy: 0, alive: true, fall: 0 })),
    order,
    rules,
    obstacles: (layout.obstacles ?? []).map((v) => ({ ...v })),
    ice: (layout.ice ?? []).map((v) => ({ ...v })),
    gaps: (layout.gaps ?? []).map((v) => ({ ...v })),
    bots: (layout.bots ?? []).map((v) => (v ? { ...v } : null)),
    active: startActor,
    turn: 1,
    shots: 0,
    playerShots: 0,
    radius: rules.radius,
    shrink: null,
    phase: 'aim',
    winner: null,
    events: [],
    eliminationBatches: [],
    stats: { shots: stats(), hits: stats(), pillar: stats(), combo: stats() },
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
  if (state.stats) state.stats.shots[d.id]++;
  state.events.push({ type: 'shot', id: d.id });
  return true;
}
// A clipped edge uses the same partial-overhang rule as the circular boundary.
export function outsideArena(state, x, y, margin = physics.puck) {
  const radius = arenaRadius(state);
  return (
    Math.hypot(x, y) > radius + margin ||
    (state.gaps ?? []).some(
      (gap) =>
        x * Math.cos(gap.angle) + y * Math.sin(gap.angle) >
        Math.max(0, radius - gap.depth) + margin,
    )
  );
}
function eliminateOutside(state, reason) {
  const ids = [];
  for (const d of state.discs) {
    if (d.alive && outsideArena(state, d.x, d.y)) {
      d.alive = false;
      d.vx = 0;
      d.vy = 0;
      state.knocked++;
      ids.push(d.id);
      state.events.push({ type: 'out', id: d.id, x: d.x, y: d.y, reason });
    }
  }
  if (!ids.length) return;
  const key = reason === 'ring' ? `ring:${state.turn}` : `shot:${state.shots}`;
  state.eliminationBatches ??= [];
  let batch = state.eliminationBatches.find((entry) => entry.key === key);
  if (!batch) {
    batch = { key, ids: [], reason, shot: state.shots, turn: state.turn };
    state.eliminationBatches.push(batch);
  }
  batch.ids.push(...ids);
  const actor = state.lastShot?.actor;
  if (reason === 'shot' && actor !== undefined && state.stats)
    state.stats.combo[actor] = Math.max(
      state.stats.combo[actor],
      batch.ids.filter((id) => id !== actor).length,
    );
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
  const order = state.order ?? state.discs.map((d) => d.id);
  let index = order.indexOf(state.active),
    next,
    wrapped = false;
  do {
    index = (index + 1) % order.length;
    if (index === 0) wrapped = true;
    next = order[index];
  } while (!state.discs[next].alive);
  if (wrapped) {
    const targetRadius = nextArenaRadius(state);
    state.turn++;
    if (targetRadius < arenaRadius(state)) {
      state.shrink = {
        fromRadius: arenaRadius(state),
        targetRadius,
        progress: 0,
        duration: state.rules?.shrinkDuration ?? physics.shrinkDuration,
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
export function skipTurn(state) {
  if (state.phase !== 'aim' || !state.discs[state.active]?.alive) return false;
  const actor = state.active;
  state.shots++;
  state.lastShot = { actor, timeout: true };
  state.knocked = 0;
  state.events.push({ type: 'timeout', id: actor });
  advanceTurn(state);
  return true;
}
export function frictionAt(state, x, y) {
  const multiplier = (state.ice ?? []).reduce(
    (value, zone) =>
      Math.hypot(x - zone.x, y - zone.y) <= zone.radius
        ? Math.min(value, zone.friction ?? 0.38)
        : value,
    1,
  );
  return physics.friction * multiplier;
}
function hitPillars(state, disc) {
  for (const pillar of state.obstacles ?? []) {
    const dx = disc.x - pillar.x,
      dy = disc.y - pillar.y;
    const length = Math.hypot(dx, dy),
      contact = physics.puck + pillar.radius;
    if (length >= contact) continue;
    const nx = length > 0 ? dx / length : 1,
      ny = length > 0 ? dy / length : 0;
    disc.x = pillar.x + nx * (contact + 0.0001);
    disc.y = pillar.y + ny * (contact + 0.0001);
    const speed = disc.vx * nx + disc.vy * ny;
    if (speed >= 0) continue;
    disc.vx -= (1 + physics.restitution) * speed * nx;
    disc.vy -= (1 + physics.restitution) * speed * ny;
    if (speed < -12) {
      state.events.push({ type: 'hit', kind: 'pillar', x: disc.x, y: disc.y, force: -speed });
      const actor = state.lastShot?.actor;
      if (actor !== undefined && state.stats) state.stats.pillar[actor]++;
    }
  }
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
      const order = state.order ?? state.discs.map((d) => d.id);
      while (!state.discs[next].alive) next = order[(order.indexOf(next) + 1) % order.length];
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
      next = Math.max(0, speed - frictionAt(state, d.x, d.y) * dt);
    if (speed) {
      d.vx *= next / speed;
      d.vy *= next / speed;
    }
    hitPillars(state, d);
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
        if (relative < -12) {
          const actor = state.lastShot?.actor;
          if (actor !== undefined && state.stats) state.stats.hits[actor]++;
          state.events.push({
            type: 'hit',
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
            force: -relative,
          });
        }
      }
    }
  for (const disc of state.discs) if (disc.alive) hitPillars(state, disc);
  eliminateOutside(state, 'shot');
  if (state.discs.every((d) => !d.alive || Math.hypot(d.vx, d.vy) < 0.01)) advanceTurn(state);
}
export function previewShot(state, angle, power) {
  const trial = {
    ...state,
    discs: state.discs.map((d) => ({ ...d })),
    events: [],
    eliminationBatches: (state.eliminationBatches ?? []).map((batch) => ({
      ...batch,
      ids: [...batch.ids],
    })),
    stats: state.stats
      ? Object.fromEntries(Object.entries(state.stats).map(([key, values]) => [key, [...values]]))
      : null,
    shrink: null,
  };
  shoot(trial, Math.cos(angle), Math.sin(angle), power);
  for (let i = 0; i < 1000 && (trial.phase === 'moving' || trial.phase === 'shrinking'); i++)
    step(trial);
  return trial;
}
// Terrain-aware travel guide deliberately ignores rival collisions; it is a reach guide.
export function previewAim(state, x, y, power) {
  const actor = state.discs[state.active];
  const points = actor ? [{ x: actor.x, y: actor.y }] : [];
  if (!actor || !Number.isFinite(x + y + power) || Math.hypot(x, y) < 0.001 || power <= 0)
    return { points, end: points[0] ?? null, out: false };
  const length = Math.hypot(x, y),
    speed = physics.maxSpeed * Math.min(1, Math.max(0.08, power));
  const disc = { ...actor, vx: (x / length) * speed, vy: (y / length) * speed };
  const trial = { ...state, events: [], stats: null };
  let out = false;
  for (let i = 0; i < 1000 && Math.hypot(disc.vx, disc.vy) > 0; i++) {
    disc.x += disc.vx * physics.step;
    disc.y += disc.vy * physics.step;
    const current = Math.hypot(disc.vx, disc.vy),
      next = Math.max(0, current - frictionAt(state, disc.x, disc.y) * physics.step);
    if (current) {
      disc.vx *= next / current;
      disc.vy *= next / current;
    }
    hitPillars(trial, disc);
    if (i % 5 === 0) points.push({ x: disc.x, y: disc.y });
    if (outsideArena(state, disc.x, disc.y)) {
      out = true;
      break;
    }
  }
  const end = { x: disc.x, y: disc.y };
  points.push(end);
  return { points, end, out };
}
export function chooseBot(
  state,
  random = seeded((state.seed ^ Math.imul(state.shots + 1, 0x9e3779b1)) >>> 0),
) {
  const actor = state.discs[state.active];
  if (!actor?.alive || state.phase !== 'aim') return null;
  const profile = state.bots?.[actor.id];
  const skill = profile?.skill ?? 1,
    style = profile?.style ?? 'balanced';
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
  const aimError = (random() - 0.5) * (0.13 + (1 - skill) * 0.7);
  // Bank angles around fixed pillars give tricksters a distinct legal way to attack.
  for (const pillar of state.obstacles ?? []) {
    const direct = Math.atan2(pillar.y - actor.y, pillar.x - actor.x);
    for (const offset of [-0.35, 0.35]) angles.push(direct + offset);
  }
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
        if (style === 'guard') score -= radial(after) * 0.075 + safety * 0.15;
        if (style === 'striker') score += (nearestBefore - nearestAfter) * 0.04 + power * 0.5;
        if (style === 'trickster')
          score += (trial.stats?.pillar[actor.id] - state.stats?.pillar[actor.id] || 0) * 0.8;
        if (trial.winner === actor.id) score += 80;
        // Small tie variation avoids a repeating scripted opening without overriding a good move.
        score -= power * power * 1.8;
        score += (random() - 0.5) * (0.9 + (1 - skill) * 9);
      }
      if (!best || score > best.score) best = { angle, power, score };
    }
  return {
    x: Math.cos(best.angle + aimError),
    y: Math.sin(best.angle + aimError),
    power: best.power,
  };
}
