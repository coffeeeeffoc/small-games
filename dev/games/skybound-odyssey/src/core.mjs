import {
  BIOMES,
  VEHICLES,
  ROUTES,
  ENDLESS_TEMPLATES,
  RULES_VERSION,
  SEGMENT_LENGTH,
} from './content.mjs';
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const mix = (a, b, t) => a + (b - a) * t;
export function random(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function segmentScene(seed, index, routeId = 'endless') {
  if (routeId !== 'endless') return ROUTES.find((r) => r.id === routeId)?.scenes[index] ?? 'ocean';
  let remaining = index;
  // Cycles use seven slots, with repetitions only on supported surface transitions.
  const r = random((seed ^ Math.imul(Math.floor(index / 7) + 1, 2654435761)) >>> 0);
  const base = ENDLESS_TEMPLATES[Math.floor(r() * ENDLESS_TEMPLATES.length)];
  const padded = [...base];
  while (padded.length < 7) padded.splice(1, 0, 'snow');
  remaining %= 7;
  return padded[remaining];
}
export function makeSegment(seed, index, routeId, difficulty = 0) {
  const rng = random((seed ^ Math.imul(index + 17, 2246822519) ^ RULES_VERSION) >>> 0);
  const start = index * SEGMENT_LENGTH;
  const scene = segmentScene(seed, index, routeId);
  let safe = 0;
  const events = [];
  for (let i = 0; i < 5; i++) {
    const z = start + 65 + i * 30;
    safe = clamp(safe + (rng() - 0.5) * 0.64, -0.45, 0.45);
    if (index === 0 && i === 0) safe = rng() > 0.5 ? 0.5 : -0.5;
    const gate = i === 3;
    const side = safe >= 0 ? -1 : 1;
    const x = index === 0 && i === 0 ? 0 : clamp(safe + side * (0.68 + rng() * 0.1), -0.82, 0.82);
    const moving = !gate && i === 2 && difficulty >= 0.5;
    events.push({
      id: `${index}:${i}`,
      z,
      type: gate ? 'gate' : 'rock',
      x: gate ? safe : x,
      safe,
      radius: gate ? 0.38 : 0.18 + difficulty * 0.015,
      phase: rng() * Math.PI * 2,
      moving,
      limit: 18,
      scene,
      passed: false,
    });
    events.push({
      id: `${index}:star:${i}`,
      z: z + 11,
      type: 'star',
      x: clamp(safe + (rng() > 0.5 ? 0.27 : -0.27), -0.76, 0.76),
      safe,
      radius: 0.12,
      scene,
      passed: false,
    });
  }
  return { index, start, scene, curve: (rng() - 0.5) * 1.4, wind: rng() > 0.5 ? 1 : -1, events };
}
export const eventX = (event, distance) =>
  event.x + (event.moving ? Math.sin(distance * 0.045 + event.phase) * 0.11 : 0);
export function createRun({ seed = 1, routeId = 'snowline', practice = false } = {}) {
  const route = ROUTES.find((r) => r.id === routeId);
  if (!route && routeId !== 'endless') throw new Error('Unknown route');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid seed');
  const state = {
    rulesVersion: RULES_VERSION,
    seed,
    routeId,
    practice,
    status: 'playing',
    distance: 0,
    elapsed: 0,
    x: 0,
    vx: 0,
    speed: 20,
    stars: 0,
    cleared: 0,
    edgeTime: 0,
    segmentIndex: 0,
    scene: 'snow',
    vehicle: 'board',
    reason: '',
    feedback: '',
    feedbackTime: 0,
    difficulty: route?.difficulty ?? 0.4,
    total: route ? route.scenes.length * SEGMENT_LENGTH : Infinity,
    segments: [],
  };
  state.segments = [0, 1].map((i) => makeSegment(seed, i, routeId, state.difficulty));
  return state;
}
export function fail(state, reason) {
  if (state.status === 'playing') {
    state.status = 'failed';
    state.reason = reason;
  }
}
export function step(state, input = {}, dt = 1 / 120) {
  if (state.status !== 'playing') return state;
  if (!Number.isFinite(dt) || dt <= 0 || dt > 1 / 30 + 1e-9)
    throw new Error('Use a fixed simulation step <= 1/30');
  const oldZ = state.distance,
    oldX = state.x;
  const vehicle = VEHICLES[state.vehicle];
  const segment = state.segments.find((s) => s.index === state.segmentIndex);
  const local = oldZ % SEGMENT_LENGTH;
  const windRamp = clamp((local - 45) / 30, 0, 1) * clamp((SEGMENT_LENGTH - local) / 40, 0, 1);
  const wind = segment.wind * vehicle.wind * windRamp;
  const steer = clamp(Number(input.steer) || 0, -1, 1);
  state.vx += (steer * vehicle.steering + wind - state.vx) * Math.min(1, vehicle.response * dt);
  state.x += state.vx * dt;
  const targetSpeed = input.brake ? 12 : Math.min(29, 23 + state.difficulty * 3);
  state.speed += clamp(targetSpeed - state.speed, -27 * dt, 10 * dt);
  state.distance += state.speed * dt;
  state.elapsed += dt;
  state.feedbackTime = Math.max(0, state.feedbackTime - dt);
  state.edgeTime =
    Math.abs(state.x) > 0.94 ? state.edgeTime + dt : Math.max(0, state.edgeTime - dt * 2);
  if (state.edgeTime > 0.23 || Math.abs(state.x) > 1.16) fail(state, '冲出了航道');
  for (const s of state.segments)
    for (const event of s.events) {
      if (event.passed || event.z < oldZ || event.z > state.distance) continue;
      event.passed = true;
      const t = clamp((event.z - oldZ) / (state.distance - oldZ || 1), 0, 1);
      const x = mix(oldX, state.x, t);
      const offset = Math.abs(x - eventX(event, event.z));
      if (event.type === 'rock' && offset < event.radius + 0.075)
        fail(state, '撞上' + BIOMES[event.scene].obstacle);
      if (event.type === 'gate') {
        if (offset > event.radius - 0.075) fail(state, '错过了穿越门');
        else if (state.speed > event.limit + 0.15) fail(state, '过门太快 · 提前减速');
        else if (state.status === 'playing') {
          state.cleared++;
          state.feedback = '稳稳穿过 +100';
          state.feedbackTime = 1.2;
        }
      }
      if (event.type === 'star' && offset < 0.18 && state.status === 'playing') {
        state.stars++;
        state.feedback = '星屑 +25';
        state.feedbackTime = 0.6;
      }
    }
  // Failure wins over completion, including a collision on the final simulation step.
  if (state.status !== 'playing') return state;
  if (state.distance >= state.total) {
    state.distance = state.total;
    state.status = 'complete';
    return state;
  }
  const nextIndex = Math.floor(state.distance / SEGMENT_LENGTH);
  if (nextIndex !== state.segmentIndex) {
    state.segmentIndex = nextIndex;
    if (state.routeId === 'endless') state.difficulty = Math.min(1.8, 0.4 + nextIndex * 0.045);
    state.segments = state.segments.filter((s) => s.index >= nextIndex);
    while (state.segments.length < 2) {
      const i = nextIndex + state.segments.length;
      state.segments.push(makeSegment(state.seed, i, state.routeId, state.difficulty));
    }
    state.scene = state.segments[0].scene;
    state.vehicle = BIOMES[state.scene].vehicle;
    state.feedback = BIOMES[state.scene].name + ' · ' + VEHICLES[state.vehicle].name;
    state.feedbackTime = 2;
  }
  return state;
}
export function retryRun(state) {
  return createRun({ seed: state.seed, routeId: state.routeId, practice: state.practice });
}
export function score(state) {
  return Math.floor(state.distance) + state.stars * 25 + state.cleared * 100;
}
export function snapshot(state) {
  return {
    ...state,
    segments: structuredClone(state.segments),
    total: Number.isFinite(state.total) ? state.total : null,
    score: score(state),
  };
}
// A verification controller using the same public steering and braking inputs as players.
export function referenceInput(state) {
  const upcoming = state.segments
    .flatMap((s) => s.events)
    .filter((e) => e.type !== 'star' && !e.passed && e.z >= state.distance)
    .sort((a, b) => a.z - b.z);
  const next = upcoming[0];
  const target = next?.safe ?? 0;
  return {
    steer: clamp((target - state.x) * 4 - state.vx * 0.8, -1, 1),
    brake: Boolean(next?.type === 'gate' && next.z - state.distance < 30),
  };
}
