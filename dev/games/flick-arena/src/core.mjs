import { layouts } from './layouts.mjs';
export const physics = Object.freeze({
  radius: 158,
  puck: 19,
  step: 1 / 120,
  friction: 205,
  restitution: 0.92,
  maxSpeed: 455,
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
export function createMatch(layout = layouts[0], seed = Date.now()) {
  return {
    layout: layout.id,
    seed,
    discs: layout.points.map(([x, y], id) => ({ id, x, y, vx: 0, vy: 0, alive: true, fall: 0 })),
    active: 0,
    turn: 1,
    shots: 0,
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
  const speed = physics.maxSpeed * Math.min(1, Math.max(0.08, power));
  d.vx = (x / length) * speed;
  d.vy = (y / length) * speed;
  state.lastShot = { actor: d.id, x: x / length, y: y / length, power: Math.min(1, power) };
  state.phase = 'moving';
  state.elapsed = 0;
  state.shots++;
  state.knocked = 0;
  state.events.push({ type: 'shot', id: d.id });
  return true;
}
// Fixed 120 Hz steps keep contacts independent of display refresh rate.
export function step(state) {
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
  for (let i = 0; i < 3; i++)
    for (let j = i + 1; j < 3; j++) {
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
  for (const d of state.discs) {
    // Partial overhang stays in play. No invisible rail or edge bounce.
    if (d.alive && Math.hypot(d.x, d.y) > physics.radius + physics.puck) {
      d.alive = false;
      d.vx = 0;
      d.vy = 0;
      state.knocked++;
      state.events.push({ type: 'out', id: d.id, x: d.x, y: d.y });
    }
  }
  if (state.discs.every((d) => !d.alive || Math.hypot(d.vx, d.vy) < 0.01)) {
    const alive = state.discs.filter((d) => d.alive);
    if (alive.length <= 1) {
      state.phase = 'over';
      state.winner = alive[0]?.id ?? -1;
      state.events.push({ type: 'end', winner: state.winner });
    } else {
      let next = state.active;
      do {
        next = (next + 1) % 3;
        if (next === 0) state.turn++;
      } while (!state.discs[next].alive);
      state.active = next;
      state.phase = 'aim';
    }
  }
}
export function chooseBot(state, random = Math.random) {
  const actor = state.discs[state.active],
    opponents = state.discs.filter((d) => d.alive && d !== actor);
  const target = opponents.sort(
    (a, b) =>
      Math.hypot(actor.x - a.x, actor.y - a.y) -
      Math.hypot(a.x, a.y) * 0.3 -
      (Math.hypot(actor.x - b.x, actor.y - b.y) - Math.hypot(b.x, b.y) * 0.3),
  )[0];
  const dx = target.x - actor.x,
    dy = target.y - actor.y;
  const angle = Math.atan2(dy, dx) + (random() - 0.5) * 0.19;
  const distance = Math.hypot(dx, dy);
  const projection = target.x * Math.cos(angle) + target.y * Math.sin(angle);
  const edgeDistance =
    -projection +
    Math.sqrt(
      Math.max(
        0,
        (physics.radius + physics.puck) ** 2 - target.x ** 2 - target.y ** 2 + projection ** 2,
      ),
    );
  const intent = random() < 0.24 ? 45 : edgeDistance * 0.9 + 60;
  const power = Math.min(
    0.98,
    Math.max(
      0.36,
      Math.sqrt(2 * physics.friction * (distance + intent + random() * 45)) / physics.maxSpeed,
    ),
  );
  return { x: Math.cos(angle), y: Math.sin(angle), power };
}
