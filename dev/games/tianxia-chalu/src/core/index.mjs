import { FACTIONS, LEVELS, RULES, getLevel, validateLevels } from '../content/levels.mjs';
export {
  FACTIONS,
  LEVELS,
  RULES,
  getLevel,
  validateLevels,
  CONTENT_VERSION,
  getUnlockedLevels,
  applyResult,
  migrateProgress,
} from '../content/levels.mjs';

export const DIFFICULTIES = Object.freeze({
  easy: { reaction: 6, errorRate: 0.3 },
  normal: { reaction: 4, errorRate: 0.12 },
  hard: { reaction: 2.2, errorRate: 0.02 },
});

function hashSeed(value) {
  const text = String(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0 || 1;
}

function random(state) {
  state.rngState = (Math.imul(state.rngState, 1664525) + 1013904223) >>> 0;
  return state.rngState / 4294967296;
}

const point = (entry) => ({ x: entry.x, y: entry.y });
const travelTime = (from, to) =>
  Math.max(0.5, Math.hypot(to.x - from.x, to.y - from.y) / RULES.speed);

/** Serializable and deterministic. No wall clock, DOM, storage or platform imports. */
export function createMatch({
  levelId = 'crossroads',
  seed = 1,
  difficulty = 'normal',
  aiEnabled = true,
} = {}) {
  const level = getLevel(levelId);
  if (!DIFFICULTIES[difficulty]) throw new RangeError(`Unknown difficulty: ${difficulty}`);
  if (
    !['number', 'string'].includes(typeof seed) ||
    (typeof seed === 'number' && !Number.isFinite(seed))
  )
    throw new TypeError('Seed must be a finite number or a string');
  const validation = validateLevels();
  if (!validation.valid) throw new Error(validation.errors.join('; '));
  const state = {
    version: 1,
    levelId,
    seed,
    rngState: hashSeed(seed),
    difficulty,
    aiEnabled: Boolean(aiEnabled),
    time: 0,
    stepCount: 0,
    accumulator: 0,
    duration: RULES.duration,
    status: 'playing',
    result: null,
    playerFactionId: 0,
    factions: [...level.factions],
    cities: level.cities.map((entry) => ({
      id: entry.id,
      name: entry.name,
      x: entry.x,
      y: entry.y,
      owner: entry.owner,
      troops: entry.troops,
      capacity: RULES.capacity,
      production: RULES.production,
      reserve: RULES.reserve,
      productionProgress: 0,
      dispatchProgress: 0,
      junctionId: entry.junction.id,
    })),
    junctions: level.cities.map((entry) => ({
      ...entry.junction,
      exits: [...entry.junction.exits],
      cityId: entry.id,
      owner: entry.owner,
      lastSwitchTime: -1,
    })),
    packets: [],
    nextPacketId: 1,
    ai: level.factions
      .filter((id) => id !== 0)
      .map((id) => ({
        factionId: id,
        style: level.ai?.[id] ?? FACTIONS[id].style,
        nextDecision: DIFFICULTIES[difficulty].reaction,
      })),
    stats: { switches: 0, captured: 0, lost: 0 },
    // Only recent events are kept; consumers may compare the monotonic sequence.
    events: [],
    nextEventId: 1,
  };
  for (const ai of state.ai) ai.nextDecision += random(state) * 1.5;
  return state;
}

function emit(state, type, data) {
  state.events.push({ id: state.nextEventId++, type, time: state.time, ...data });
  if (state.events.length > 16) state.events.shift();
}

/** Change only a controlled switch. Troops already on the outgoing road are unaffected. */
export function switchRoute(state, factionId, junctionId, routeIndex) {
  if (state.status !== 'playing') return { ok: false, reason: 'match-finished' };
  const junction = state.junctions.find((entry) => entry.id === junctionId);
  if (!junction) return { ok: false, reason: 'unknown-junction' };
  if (junction.owner !== factionId || !state.factions.includes(factionId))
    return { ok: false, reason: 'not-owner' };
  const next =
    routeIndex === undefined ? (junction.routeIndex + 1) % junction.exits.length : routeIndex;
  if (!Number.isInteger(next) || next < 0 || next >= junction.exits.length)
    return { ok: false, reason: 'invalid-route' };
  if (state.time - junction.lastSwitchTime + 1e-9 < RULES.switchCooldown)
    return { ok: false, reason: 'cooldown' };
  junction.routeIndex = next;
  junction.lastSwitchTime = state.time;
  if (factionId === state.playerFactionId) state.stats.switches++;
  emit(state, 'switch', { factionId, junctionId, routeIndex: next });
  return { ok: true, junctionId, routeIndex: next };
}

/** Rankings compare territory first, then all surviving soldiers including roads. */
export function getScore(state) {
  return state.factions
    .map((factionId) => {
      const cities = state.cities.filter((entry) => entry.owner === factionId);
      const troops =
        cities.reduce((sum, entry) => sum + entry.troops, 0) +
        state.packets
          .filter((entry) => entry.owner === factionId)
          .reduce((sum, entry) => sum + entry.troops, 0);
      return { factionId, cities: cities.length, troops, score: cities.length * 1000 + troops };
    })
    .sort((a, b) => b.cities - a.cities || b.troops - a.troops || a.factionId - b.factionId);
}

function finishIfNeeded(state) {
  const rankings = getScore(state);
  const alive = rankings.filter((entry) => entry.cities > 0 || entry.troops > 0);
  const playerAlive = alive.some((entry) => entry.factionId === state.playerFactionId);
  if (playerAlive && alive.length > 1 && state.time + 1e-9 < state.duration) return;
  const reason = state.time + 1e-9 >= state.duration ? 'timeout' : 'elimination';
  const first = rankings[0];
  const second = rankings[1];
  const player = rankings.find((entry) => entry.factionId === state.playerFactionId);
  const tied = first.cities === second?.cities && first.troops === second?.troops;
  const winnerId = alive.length === 1 ? alive[0].factionId : tied ? null : first.factionId;
  const playerSharesLead = player?.cities === first.cities && player?.troops === first.troops;
  const drawn = alive.length === 0 || (winnerId === null && playerAlive && playerSharesLead);
  const outcome = drawn
    ? 'draw'
    : playerAlive && winnerId === state.playerFactionId
      ? 'victory'
      : 'defeat';
  state.status = 'finished';
  state.result = {
    levelId: state.levelId,
    outcome,
    winnerId,
    reason,
    elapsed: state.time,
    score: player?.score ?? 0,
    stars:
      outcome === 'victory'
        ? reason === 'elimination' && state.time <= 120
          ? 3
          : reason === 'elimination'
            ? 2
            : 1
        : 0,
    rankings,
  };
  emit(state, 'finished', { outcome, winnerId });
}

function incoming(state, cityId, factionId, hostile) {
  return state.packets.reduce(
    (total, packet) =>
      total +
      (packet.targetCityId === cityId &&
      (hostile ? packet.owner !== factionId : packet.owner === factionId)
        ? packet.troops
        : 0),
    0,
  );
}

function targetValue(state, factionId, source, target, style) {
  const hostile = target.owner !== factionId;
  const neutral = target.owner === null;
  const travelCost = Math.hypot(target.x - source.x, target.y - source.y) * 0.025;
  const enemyInbound = incoming(state, target.id, factionId, true);
  const ownInbound = incoming(state, target.id, factionId, false);
  if (!hostile) {
    const routes = state.junctions.find((entry) => entry.cityId === target.id).exits;
    const isFront = routes.some(
      (id) => state.cities.find((entry) => entry.id === id).owner !== factionId,
    );
    const threatened = enemyInbound - target.troops;
    // Rear cities feed a friendly frontline; avoid empty circular supply routes.
    return (
      (isFront ? 14 : -24) +
      Math.max(-12, threatened) * (style === 'defensive' ? 2.5 : 1.1) -
      ownInbound * 0.4 -
      travelCost
    );
  }
  const weakness = 25 - target.troops - ownInbound * 0.65;
  if (style === 'expansionist') return weakness + (neutral ? 30 : 9) - travelCost;
  if (style === 'aggressive') return weakness + (neutral ? 15 : 28) - travelCost;
  if (style === 'defensive') return weakness + (neutral ? 24 : 7) - travelCost;
  // Opportunists exploit cities already depleted by another faction's attack.
  return weakness + (neutral ? 20 : 16) + Math.min(target.troops, enemyInbound) * 0.6 - travelCost;
}

function updateAi(state) {
  if (!state.aiEnabled) return;
  const difficulty = DIFFICULTIES[state.difficulty];
  for (const ai of state.ai) {
    if (state.time + 1e-9 < ai.nextDecision) continue;
    ai.nextDecision = state.time + difficulty.reaction + random(state) * 1.3;
    for (const junction of state.junctions) {
      if (junction.owner !== ai.factionId) continue;
      const source = state.cities.find((entry) => entry.id === junction.cityId);
      const choices = junction.exits.map((id, index) => ({
        index,
        value:
          targetValue(
            state,
            ai.factionId,
            source,
            state.cities.find((entry) => entry.id === id),
            ai.style,
          ) +
          random(state) * 3,
      }));
      choices.sort((a, b) => b.value - a.value);
      const choice =
        random(state) < difficulty.errorRate
          ? choices[Math.floor(random(state) * choices.length)]
          : choices[0];
      if (junction.routeIndex !== choice.index)
        switchRoute(state, ai.factionId, junction.id, choice.index);
    }
  }
}

function produceAndDispatch(state) {
  for (const city of state.cities) {
    if (city.owner === null) continue;
    city.productionProgress += city.production * RULES.step;
    const produced = Math.floor(city.productionProgress + 1e-9);
    if (produced > 0) {
      city.troops = Math.min(city.capacity, city.troops + produced);
      city.productionProgress -= produced;
    }
    city.dispatchProgress += RULES.step;
    if (city.dispatchProgress + 1e-9 < RULES.dispatchInterval) continue;
    city.dispatchProgress -= RULES.dispatchInterval;
    const count = Math.min(RULES.packetSize, city.troops - city.reserve);
    if (count <= 0) continue;
    city.troops -= count;
    const junction = state.junctions.find((entry) => entry.id === city.junctionId);
    state.packets.push({
      id: state.nextPacketId++,
      owner: city.owner,
      troops: count,
      fromCityId: city.id,
      junctionId: junction.id,
      phase: 'approach',
      from: point(city),
      to: point(junction),
      elapsed: 0,
      duration: travelTime(city, junction),
      targetCityId: null,
    });
  }
}

function arrive(state, packet) {
  const city = state.cities.find((entry) => entry.id === packet.targetCityId);
  if (city.owner === packet.owner) {
    city.troops = Math.min(city.capacity, city.troops + packet.troops);
    return;
  }
  if (packet.troops <= city.troops) {
    city.troops -= packet.troops;
    return;
  }
  const previousOwner = city.owner;
  city.owner = packet.owner;
  city.troops = packet.troops - city.troops;
  city.productionProgress = 0;
  city.dispatchProgress = 0;
  const junction = state.junctions.find((entry) => entry.id === city.junctionId);
  junction.owner = packet.owner;
  junction.lastSwitchTime = -1;
  if (packet.owner === state.playerFactionId) state.stats.captured++;
  if (previousOwner === state.playerFactionId) state.stats.lost++;
  emit(state, 'capture', { cityId: city.id, factionId: city.owner, previousOwner });
}

function movePackets(state) {
  const remaining = [];
  // Stable packet insertion order gives reproducible simultaneous arrivals.
  for (const packet of state.packets) {
    packet.elapsed += RULES.step;
    if (packet.elapsed + 1e-9 >= packet.duration && packet.phase === 'approach') {
      const junction = state.junctions.find((entry) => entry.id === packet.junctionId);
      const target = state.cities.find((entry) => entry.id === junction.exits[junction.routeIndex]);
      packet.elapsed = Math.max(0, packet.elapsed - packet.duration);
      packet.phase = 'road';
      packet.from = point(junction);
      packet.to = point(target);
      packet.targetCityId = target.id;
      packet.duration = travelTime(junction, target);
    }
    if (packet.phase === 'road' && packet.elapsed + 1e-9 >= packet.duration) arrive(state, packet);
    else remaining.push(packet);
  }
  state.packets = remaining;
}

/** Advance any nonnegative elapsed duration using identical fixed simulation steps. */
export function tick(state, seconds) {
  if (!Number.isFinite(seconds) || seconds < 0)
    throw new RangeError('Tick duration must be finite and nonnegative');
  if (state.status !== 'playing') return state;
  state.accumulator += Math.min(seconds, Math.max(0, state.duration - state.time));
  while (state.accumulator + 1e-9 >= RULES.step && state.status === 'playing') {
    state.accumulator = Math.max(0, state.accumulator - RULES.step);
    state.stepCount++;
    state.time = Math.round(state.stepCount * RULES.step * 1e6) / 1e6;
    updateAi(state);
    produceAndDispatch(state);
    movePackets(state);
    finishIfNeeded(state);
  }
  // Rounding removes tiny chunk-size dependent remainders from serialized snapshots.
  state.accumulator = state.status === 'finished' ? 0 : Math.round(state.accumulator * 1e9) / 1e9;
  return state;
}
