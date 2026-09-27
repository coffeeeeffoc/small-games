import { LEVELS, WORLD } from './levels.mjs';
export const DT = 1 / 60;
const overlap = (a, b) => a.x < b.x + b.w - .01 && a.x + a.w > b.x + .01 && a.y < b.y + b.h - .01 && a.y + a.h > b.y + .01;
const emit = (s, type, data = {}) => s.events.push({ tick: s.tick, type, ...data });
export function createGame(index = 0) {
  if (!LEVELS[index]) throw new Error('Unknown level');
  const level = structuredClone(LEVELS[index]);
  if (level.nodes.filter(n => n.target).length > 8) throw new Error('Plate budget exceeded');
  const nodes = level.nodes.map(n => ({ ...n, originY: n.y, attached: true, vx: 0, vy: 0, load: 0, stress: 0, restOn: null }));
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  if (Object.keys(byId).length !== nodes.length) throw new Error('Duplicate node');
  const order = [], visited = new Set(), visiting = new Set(), edges = new Set();
  function visit(n) {
    if (visiting.has(n.id)) throw new Error('Cyclic support');
    if (visited.has(n.id)) return;
    if (![n.x, n.y, n.w, n.h, n.mass].every(Number.isFinite) || n.w <= 0 || n.h <= 0 || n.mass < 0) throw new Error('Invalid body');
    visiting.add(n.id);
    for (const e of n.edges) {
      if (!byId[e.to] || edges.has(e.id) || !(e.capacity > 0)) throw new Error('Invalid joint');
      edges.add(e.id); visit(byId[e.to]);
    }
    visiting.delete(n.id); visited.add(n.id); order.push(n);
  }
  nodes.forEach(visit);
  const s = { index, level, nodes, byId, order, obstacles: level.obstacles, phase: 'ready', tick: 0, held: null, cooldown: 0, events: [], input: [], stable: 0, failure: null, failureTick: 0, pause: false, impacts: 0 };
  structure(s);
  if (nodes.some(n => !n.attached || (n.capacity && n.load > n.capacity))) throw new Error('Unstable initial structure');
  return s;
}
export function begin(s) { if (s.phase === 'ready') s.phase = 'playing'; }
export function setPaused(s, value) { pointer(s, 'cancel'); s.pause = value; }
export function jointAt(s, x, y) {
  let best = null, distance = Infinity;
  for (const n of s.nodes) if (n.target && n.attached) for (const e of n.edges) if (e.hp > 0 && s.byId[e.to].attached) {
    const dx = x - e.x, dy = y - e.y;
    if (Math.abs(dx) <= 31 && Math.abs(dy) <= 28 && dx * dx + dy * dy < distance) { best = { node: n, edge: e }; distance = dx * dx + dy * dy; }
  }
  return best;
}
export function pointer(s, type, x = 0, y = 0) {
  if (!['down', 'move', 'up', 'cancel'].includes(type)) return;
  s.input.push({ tick: s.tick, type, x, y });
  if (type === 'up' || type === 'cancel') { s.held = null; return; }
  if (s.phase !== 'playing' || s.pause || s.failure || s.tick >= 3600) return;
  if (type === 'down') { if (s.held) return; s.held = { x, y }; s.cooldown = 0; strike(s); }
  else if (s.held) s.held = { x, y };
}
function strike(s) {
  s.cooldown = .23;
  const hit = s.held && jointAt(s, s.held.x, s.held.y);
  if (!hit) return;
  const { node, edge } = hit;
  edge.hp--;
  emit(s, 'strike', { id: edge.id, node: node.id, x: edge.x, y: edge.y, hp: edge.hp });
  if (!edge.hp) { emit(s, 'cut', { id: edge.id }); structure(s, node.id, edge.push); }
}
function release(s, n, vx = 0) {
  n.attached = false; n.vx = vx; n.vy = 0; n.restOn = null;
  emit(s, 'fall', { id: n.id, x: n.x, y: n.y, vx });
}
function structure(s, struckId, push = 0) {
  // ponytail: acyclic, at most eight pre-cut plates; no bending or arbitrary rigid joints.
  for (const n of s.order) if (n.attached && !n.anchored && !n.edges.some(e => e.hp > 0 && s.byId[e.to].attached)) release(s, n, n.id === struckId ? push : 0);
  for (const n of s.nodes) n.load = n.attached ? n.mass : 0;
  // Resting rubble still weighs on its actual contact; detachment never erases mass.
  for (const body of s.nodes.filter(n => !n.attached)) {
    let contact = s.byId[body.restOn]; const seen = new Set([body.id]);
    while (contact && !seen.has(contact.id)) {
      seen.add(contact.id);
      if (contact.attached) { contact.load += body.mass; break; }
      contact = s.byId[contact.restOn];
    }
  }
  for (const n of [...s.order].reverse()) if (n.attached) {
    const edges = n.edges.filter(e => e.hp > 0 && s.byId[e.to].attached);
    for (const e of edges) { e.load = n.load / edges.length; s.byId[e.to].load += e.load; }
  }
}
function fail(s, reason, cause, data = {}) {
  if (s.failure) return;
  s.failure = reason; s.failureTick = s.tick; s.held = null;
  emit(s, 'failure', { reason, cause, ...data });
}
function collision(s, body, other, speed, axis) {
  if (speed < 24) return;
  const impulse = speed * body.mass;
  s.impacts++;
  emit(s, 'impact', { body: body.id, other: other.id, impulse: Math.round(impulse), x: body.x + body.w / 2, y: body.y + body.h, axis });
  if (other.protected && !other.broken && impulse > other.impactLimit) {
    other.broken = true;
    fail(s, `${body.name}撞坏了${other.name}`, 'impact', { body: body.id, other: other.id, impulse });
  }
}
function physics(s, dt) {
  // ponytail: capped AABB arcade contacts, no angular physics; drawn solids use these exact bounds.
  const loose = s.nodes.filter(n => !n.attached).sort((a, b) => (b.y + b.h) - (a.y + a.h) || a.id.localeCompare(b.id));
  const solids = [...s.nodes, ...s.obstacles.filter(o => !o.broken)];
  for (const b of loose) {
    b.vy += 680 * dt; b.restOn = null;
    b.x += b.vx * dt;
    if (b.x < 12 || b.x + b.w > WORLD.w - 12) { b.x = Math.max(12, Math.min(WORLD.w - 12 - b.w, b.x)); b.vx *= -.08; }
    for (const o of solids) if (o !== b && overlap(b, o)) {
      if (!b.vx) continue;
      const speed = Math.abs(b.vx);
      b.x = b.vx > 0 ? o.x - b.w : o.x + o.w;
      collision(s, b, o, speed, 'x'); b.vx *= -.08;
    }
    b.y += b.vy * dt;
    for (const o of solids) if (o !== b && overlap(b, o)) {
      const speed = Math.abs(b.vy - (o.vy || 0));
      if (b.vy >= 0) { b.y = o.y - b.h; b.restOn = o.id; }
      else b.y = o.y + o.h;
      collision(s, b, o, speed, 'y');
      b.vy = 0;
      b.vx *= o.id === 'ground' || !o.attached ? .89 : .998;
    }
    if (Math.abs(b.vx) < 3) b.vx = 0;
  }
}
export function step(s) {
  if (s.phase !== 'playing' || s.pause) return;
  s.tick++;
  if (s.held && s.tick < 3600 && !s.failure) { s.cooldown -= DT; if (s.cooldown <= 0) strike(s); }
  if (s.tick >= 3600) s.held = null;
  physics(s, DT / 2); physics(s, DT / 2); structure(s);
  for (const n of s.nodes) if (n.attached) {
    if (n.capacity && n.load > n.capacity + .001) {
      if (!n.stress) emit(s, 'overload', { id: n.id, load: n.load, capacity: n.capacity });
      n.stress += DT;
      if (n.stress >= .45) { n.broken = true; release(s, n); fail(s, `${n.name}承重 ${n.load.toFixed(0)}，超过上限 ${n.capacity}`, 'overload', { node: n.id, load: n.load, capacity: n.capacity }); }
    } else n.stress = 0;
  }
  const targets = s.nodes.filter(n => n.target);
  const settled = targets.every(n => !n.attached && n.restOn && n.vx === 0 && n.vy === 0 && n.y > n.originY + 2);
  s.stable = settled ? s.stable + DT : 0;
  if (s.failure && s.tick - s.failureTick >= 48) { s.phase = 'lost'; emit(s, 'lost'); }
  else if (!s.failure && s.stable >= .75) { s.phase = 'won'; s.held = null; emit(s, 'won'); }
  else if (s.tick >= 3780 && !s.failure) fail(s, '时间到了，现场还没有安全落稳', 'timeout');
}
export function snapshot(s) {
  return { tick: s.tick, level: s.index + 1, phase: s.phase, seconds: +(s.tick / 60).toFixed(2), failure: s.failure, stable: +s.stable.toFixed(2), detached: s.nodes.filter(n => n.target && !n.attached).length, targets: s.nodes.filter(n => n.target).length, impacts: s.impacts, nodes: s.nodes.map(n => ({ id: n.id, x: +n.x.toFixed(2), y: +n.y.toFixed(2), attached: n.attached, load: n.load, vx: n.vx, vy: n.vy })), events: s.events, input: s.input };
}
