import {
  FACTIONS,
  RULES,
  CITY_TYPES,
  ROAD_TYPES,
  GENERAL_TYPES,
  WEAPONS,
  getLevel,
  validateLevels,
  validateSeed,
  validateLoadout,
} from '../content/levels.mjs';
import { distance, point, effectSources, modifiersAt, positionOfPacket } from './effects.mjs';
export * from '../content/levels.mjs';
export * from './progression.mjs';
export { effectSources, modifiersAt, positionOfPacket, positionOfGeneral } from './effects.mjs';

export const DIFFICULTIES = Object.freeze({
  easy: { reaction: 6, errorRate: 0.3 },
  normal: { reaction: 4, errorRate: 0.12 },
  hard: { reaction: 2.2, errorRate: 0.02 },
});
const EPS = 1e-9;
function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0 || 1;
}
function random(state) {
  state.rngState = (Math.imul(state.rngState, 1664525) + 1013904223) >>> 0;
  return state.rngState / 4294967296;
}
function emit(state, type, data, position) {
  state.events.push({
    id: state.nextEventId++,
    type,
    time: state.time,
    position: point(position),
    ...data,
  });
  if (state.events.length > 64) state.events.shift();
}
const cityOf = (s, id) => s.cities.find((c) => c.id === id);
const junctionOf = (s, c) => s.junctions.find((j) => j.id === c.junctionId);
const generalsOf = (s, entry) =>
  s.generals.filter(
    (g) =>
      g.health > 0 &&
      (entry.junctionId && entry.capacity !== undefined
        ? g.cityId === entry.id && g.packetId === null
        : g.packetId === entry.id),
  );
const alivePacket = (s, p) => p.troops > 0 || generalsOf(s, p).length > 0;

/** JSON-serializable fixed-step rules shared by the browser and Node service. */
export function createMatch({
  levelId = 'crossroads',
  seed = 1,
  difficulty = 'normal',
  aiEnabled = true,
  loadout = [],
} = {}) {
  const level = getLevel(levelId);
  if (!Object.hasOwn(DIFFICULTIES, difficulty))
    throw new RangeError(`Unknown difficulty: ${difficulty}`);
  validateSeed(seed);
  const cards = validateLoadout(loadout);
  const validation = validateLevels();
  if (!validation.valid) throw new Error(validation.errors.join('; '));
  const spawnKey = typeof seed === 'number' ? seed : hashSeed(seed);
  const setIndex = Math.floor(spawnKey / level.factions.length) % level.spawnSets.length;
  const spawns = level.spawnSets[setIndex];
  const rotation = spawnKey % level.factions.length;
  const assignment = Object.fromEntries(
    level.factions.map((f, i) => [f, spawns[(i + rotation) % spawns.length]]),
  );
  const state = {
    version: 2,
    levelId,
    seed,
    rngState: hashSeed(seed),
    difficulty,
    aiEnabled: Boolean(aiEnabled),
    loadout: cards,
    time: 0,
    stepCount: 0,
    accumulator: 0,
    duration: level.duration,
    status: 'playing',
    result: null,
    playerFactionId: 0,
    factions: [...level.factions],
    spawnSetIndex: setIndex,
    spawns: assignment,
    eliminatedAt: Object.fromEntries(level.factions.map((f) => [f, null])),
    cities: level.cities.map((c) => {
      const owner = level.factions.find((f) => assignment[f] === c.id) ?? null;
      const type = CITY_TYPES[c.type];
      return {
        id: c.id,
        name: c.name,
        x: c.x,
        y: c.y,
        type: c.type,
        terrain: c.terrain,
        owner,
        troops: 0,
        reserve: 0,
        capacity: type.capacity,
        baseCapacity: type.capacity,
        production: type.production,
        productionProgress: 0,
        dispatchProgress: 0,
        dispatchWaves: 0,
        dispatchCursor: 0,
        junctionId: c.junction.id,
        damage: 0,
        nextAttack: 0,
        fortification: type.fortification,
        maxFortification: type.fortification,
        baseFortification: type.fortification,
        weapon: c.weapon ? { kind: c.weapon, nextFire: 0, readyAt: 0, sourceOwner: null } : null,
        generalKind: c.general,
        recruitProgress: 0,
        recruitReadyAt: 0,
        capturedAt: 0,
      };
    }),
    junctions: level.cities.map((c) => ({
      ...c.junction,
      exits: [...c.junction.exits],
      routeIndices: [],
      cityId: c.id,
      owner: level.factions.find((f) => assignment[f] === c.id) ?? null,
      lastSwitchTime: -1,
    })),
    roads: level.roads.map((r) => ({
      ...r,
      speed: ROAD_TYPES[r.type],
      length: distance(
        level.cities.find((c) => c.id === r.a),
        level.cities.find((c) => c.id === r.b),
      ),
    })),
    terrain: structuredClone(level.terrain),
    packets: [],
    nextPacketId: 1,
    generals: [],
    nextGeneralId: 1,
    sources: [],
    ai: level.factions
      .filter((id) => id !== 0)
      .map((id) => ({
        factionId: id,
        style: level.ai[id] ?? FACTIONS[id].style,
        nextDecision: DIFFICULTIES[difficulty].reaction,
      })),
    stats: { switches: 0, captured: 0, lost: 0 },
    events: [],
    nextEventId: 1,
  };
  for (const f of state.factions)
    state.sources.push({
      id: `baseline-${f}`,
      sourceType: 'baseline',
      factionId: f,
      cityId: assignment[f],
      ...level.baseline,
      scope: 'allied-local',
    });
  for (const [i, card] of cards.entries()) {
    const city = cityOf(state, assignment[0]);
    const value = card.kind === 'troops' ? 4 + card.tier * 4 : 0.12 + card.tier * 0.08;
    state.sources.push({
      id: `card-${i}`,
      sourceType: 'card',
      factionId: 0,
      cityId: city.id,
      ...card,
      value,
      radius: 95,
      scope: card.kind === 'troops' ? 'initial-reinforcement' : 'allied-local',
    });
    if (
      cards.some(
        (other, j) =>
          other.kind === card.kind &&
          (other.tier > card.tier || (other.tier === card.tier && j < i)),
      )
    )
      continue;
    if (card.kind === 'troops') city.troops += value;
    if (card.kind === 'general')
      city.generalKind = ['commander', 'guardian', 'warrior', 'medic'][card.tier];
    if (card.kind === 'weapon')
      city.weapon = { kind: 'crossbow', nextFire: 0, readyAt: 0, sourceOwner: 0 };
  }
  for (const ai of state.ai) ai.nextDecision += random(state) * 1.5;
  refreshCities(state);
  return state;
}

function validateOrder(state, factionId, junctionId) {
  if (state.status !== 'playing') return { ok: false, reason: 'match-finished' };
  const junction = state.junctions.find((j) => j.id === junctionId);
  if (!junction) return { ok: false, reason: 'unknown-junction' };
  if (junction.owner !== factionId || !state.factions.includes(factionId))
    return { ok: false, reason: 'not-owner' };
  return { ok: true, junction };
}

// Old snapshots and single-route callers remain readable; new commands own the full list.
export function activeRoutes(junction) {
  return Array.isArray(junction.routeIndices)
    ? [...junction.routeIndices]
    : junction.routeIndex >= 0
      ? [junction.routeIndex]
      : [];
}

function applyRoutes(state, factionId, junction, routes, changedIndex, enabled) {
  if (state.time - junction.lastSwitchTime + EPS < RULES.switchCooldown)
    return { ok: false, reason: 'cooldown' };
  junction.routeIndices = routes;
  junction.routeIndex = routes[0] ?? -1;
  junction.lastSwitchTime = state.time;
  if (routes.length === 0) {
    const city = cityOf(state, junction.cityId);
    city.dispatchProgress = 0;
    city.dispatchWaves = 0;
    city.dispatchCursor = 0;
  }
  if (factionId === state.playerFactionId) state.stats.switches++;
  const result = {
    ok: true,
    junctionId: junction.id,
    routeIndex: junction.routeIndex,
    routeIndices: [...routes],
    enabled,
  };
  emit(
    state,
    routes.length === 0 ? 'hold' : 'switch',
    { factionId, ...result, changedIndex, cityId: junction.cityId },
    cityOf(state, junction.cityId),
  );
  return result;
}

/** Add/remove one persistent route without replacing the city's other targets. */
export function setRoute(state, factionId, junctionId, routeIndex, enabled = true) {
  const checked = validateOrder(state, factionId, junctionId);
  if (!checked.ok) return checked;
  const { junction } = checked;
  if (!Number.isInteger(routeIndex) || routeIndex < 0 || routeIndex >= junction.exits.length)
    return { ok: false, reason: 'invalid-route' };
  if (typeof enabled !== 'boolean') return { ok: false, reason: 'invalid-enabled' };
  const current = activeRoutes(junction);
  if (current.includes(routeIndex) === enabled)
    return {
      ok: true,
      junctionId,
      routeIndex: current[0] ?? -1,
      routeIndices: current,
      enabled,
    };
  const next = enabled ? [...current, routeIndex] : current.filter((index) => index !== routeIndex);
  return applyRoutes(state, factionId, junction, next, routeIndex, enabled);
}

/** Legacy command: replace every target with one route, or clear all with -1. */
export function switchRoute(state, factionId, junctionId, routeIndex) {
  const checked = validateOrder(state, factionId, junctionId);
  if (!checked.ok) return checked;
  const { junction } = checked;
  const next =
    routeIndex === undefined
      ? ((junction.routeIndex + 2) % (junction.exits.length + 1)) - 1
      : routeIndex;
  if (!Number.isInteger(next) || next < -1 || next >= junction.exits.length)
    return { ok: false, reason: 'invalid-route' };
  return applyRoutes(state, factionId, junction, next < 0 ? [] : [next], next, next >= 0);
}

/** Commands only: useful for a replayable player pilot without mutating simulation internals. */
export function planRoutes(state, factionId, style = 'expansionist') {
  if (state.status !== 'playing') return [];
  const owned = state.cities.filter((c) => c.owner === factionId);
  const steps = new Map(state.cities.filter((c) => c.owner !== factionId).map((c) => [c.id, 0]));
  for (let pass = 0; pass < state.cities.length; pass++)
    for (const c of owned) {
      const best =
        Math.min(...junctionOf(state, c).exits.map((id) => steps.get(id) ?? Infinity)) + 1;
      if (best < (steps.get(c.id) ?? Infinity)) steps.set(c.id, best);
    }
  const inbound = (id, hostile) =>
    state.packets
      .filter(
        (p) => p.targetCityId === id && (hostile ? p.owner !== factionId : p.owner === factionId),
      )
      .reduce((sum, p) => sum + p.troops, 0);
  return owned.map((source) => {
    const junction = junctionOf(state, source);
    const strength =
      source.troops + inbound(source.id, false) + generalsOf(state, source).length * 12;
    const threat = inbound(source.id, true);
    const choices = junction.exits
      .map((id, index) => {
        const target = cityOf(state, id),
          road = state.roads.find(
            (r) => (r.a === source.id && r.b === id) || (r.b === source.id && r.a === id),
          );
        const cost = road.length / road.speed / 40;
        const defense =
          target.troops +
          target.fortification / RULES.health +
          generalsOf(state, target).length * 10;
        const support = inbound(id, false);
        if (target.owner === factionId) {
          const advancing = (steps.get(id) ?? Infinity) < (steps.get(source.id) ?? Infinity);
          return {
            routeIndex: index,
            value: (advancing ? 22 : -60) + Math.min(20, inbound(id, true)) - support * 0.3 - cost,
          };
        }
        const ready =
          strength + support >= Math.max(2, defense * (style === 'aggressive' ? 0.9 : 1.15) + 2) ||
          source.troops >= source.capacity * 0.8;
        return {
          routeIndex: ready ? index : -1,
          value:
            35 +
            (target.owner === null ? (style === 'expansionist' ? 15 : 9) : 0) +
            (target.type === 'muster' ? 6 : 0) -
            defense * 0.6 -
            support * 0.15 -
            cost,
        };
      })
      .sort((a, b) => b.value - a.value || a.routeIndex - b.routeIndex);
    const routeIndex =
      threat > strength * (style === 'defensive' ? 0.7 : 1.3) &&
      source.troops < source.capacity * 0.8
        ? -1
        : (choices[0]?.routeIndex ?? -1);
    return { junctionId: junction.id, routeIndex };
  });
}

function updateAi(state) {
  if (!state.aiEnabled) return;
  for (const ai of state.ai) {
    if (state.time + EPS < ai.nextDecision || state.eliminatedAt[ai.factionId] !== null) continue;
    ai.nextDecision = state.time + DIFFICULTIES[state.difficulty].reaction + random(state) * 1.3;
    for (const command of planRoutes(state, ai.factionId, ai.style)) {
      const junction = state.junctions.find((j) => j.id === command.junctionId);
      if (random(state) < DIFFICULTIES[state.difficulty].errorRate) continue;
      if (junction.routeIndex !== command.routeIndex)
        switchRoute(state, ai.factionId, junction.id, command.routeIndex);
    }
  }
}

function refreshCities(state) {
  const sources = effectSources(state);
  for (const city of state.cities) {
    const bonus = modifiersAt(state, city.owner, city, sources).territory;
    city.capacity = Math.floor(city.baseCapacity * (1 + bonus));
    const fortCard = state.sources.filter(
      (s) =>
        s.kind === 'territory' &&
        s.sourceType === 'card' &&
        s.cityId === city.id &&
        s.factionId === city.owner,
    );
    const extraFortification = fortCard.length
      ? Math.max(...fortCard.map((s) => 12 + s.tier * 4))
      : 0;
    const remaining = city.maxFortification > 0 ? city.fortification / city.maxFortification : 1;
    city.maxFortification = (city.baseFortification + extraFortification) * (1 + bonus);
    city.fortification = remaining * city.maxFortification;
    if (city.troops > city.capacity) {
      const overflow = city.troops - city.capacity;
      const packet = stationPacket(state, city, city.owner, overflow);
      transferWounds(city, packet, overflow);
      city.troops = city.capacity;
    }
  }
}

function stationPacket(state, city, owner, troops) {
  const packet = {
    id: state.nextPacketId++,
    owner,
    troops,
    damage: 0,
    nextAttack: 0,
    fromCityId: city.id,
    targetCityId: city.id,
    junctionId: city.junctionId,
    phase: 'stationed',
    roadId: null,
    from: point(city),
    to: point(city),
    progress: 1,
    elapsed: 0,
    duration: 0,
    engaged: false,
  };
  state.packets.push(packet);
  return packet;
}

// Split existing wounds proportionally; moving troops never heals or wounds another stack.
function transferWounds(from, to, count) {
  const damage = from.troops > 0 ? (from.damage * count) / from.troops : 0;
  from.damage -= damage;
  to.damage += damage;
}

function sendPacket(state, packet, city, target) {
  const road = state.roads.find(
    (r) => (r.a === city.id && r.b === target.id) || (r.b === city.id && r.a === target.id),
  );
  Object.assign(packet, {
    phase: 'road',
    roadId: road.id,
    fromCityId: city.id,
    targetCityId: target.id,
    junctionId: city.junctionId,
    from: point(city),
    to: point(target),
    progress: 0,
    elapsed: 0,
    duration: road.length / (RULES.speed * road.speed),
    departedAt: state.time,
    engaged: false,
  });
}

function dispatchTo(state, city, target, budget) {
  for (const stationed of state.packets
    .filter((p) => p.phase === 'stationed' && p.targetCityId === city.id && p.owner === city.owner)
    .sort((a, b) => a.id - b.id)) {
    if (budget <= 0) break;
    const count = Math.min(budget, stationed.troops);
    if (count < stationed.troops) {
      const packet = stationPacket(state, city, city.owner, count);
      transferWounds(stationed, packet, count);
      stationed.troops -= count;
      sendPacket(state, packet, city, target);
    } else sendPacket(state, stationed, city, target);
    budget -= count;
  }
  const count = Math.min(budget, Math.max(0, city.troops - city.reserve));
  const generals = generalsOf(state, city);
  if (count <= 0 && generals.length === 0) return;
  const packet = stationPacket(state, city, city.owner, count);
  transferWounds(city, packet, count);
  city.troops -= count;
  sendPacket(state, packet, city, target);
  for (const general of generals) {
    general.cityId = null;
    general.packetId = packet.id;
  }
}

function produceAndDispatch(state) {
  const sources = effectSources(state);
  for (const city of state.cities) {
    if (city.owner === null) continue;
    if (city.troops < city.capacity) {
      city.productionProgress +=
        city.production *
        (1 + modifiersAt(state, city.owner, city, sources).production) *
        RULES.step;
      const produced = Math.min(
        city.capacity - city.troops,
        Math.floor(city.productionProgress + EPS),
      );
      city.troops += produced;
      city.productionProgress -= produced;
      if (city.troops === city.capacity) city.productionProgress = 0;
    } else city.productionProgress = 0;
    const junction = junctionOf(state, city);
    const routes = activeRoutes(junction);
    if (routes.length === 0) {
      city.dispatchProgress = 0;
      city.dispatchWaves = 0;
      city.dispatchCursor = 0;
      continue;
    }
    // One city-wide budget includes overflow reinforcements. More targets never multiply it.
    const available =
      Math.max(0, city.troops - city.reserve) +
      state.packets
        .filter(
          (p) => p.phase === 'stationed' && p.targetCityId === city.id && p.owner === city.owner,
        )
        .reduce((sum, packet) => sum + packet.troops, 0);
    const momentum = Math.min(city.dispatchWaves ?? 0, RULES.maxDispatchMomentum);
    const interval = Math.max(
      RULES.minDispatchInterval,
      RULES.dispatchInterval /
        (1 +
          Math.sqrt(available / RULES.dispatchStrengthScale) +
          momentum * RULES.dispatchMomentum),
    );
    city.dispatchProgress += RULES.step;
    if (available === 0 && generalsOf(state, city).length === 0) {
      city.dispatchProgress = Math.min(city.dispatchProgress, interval);
      continue;
    }
    if (city.dispatchProgress + EPS < interval) continue;
    city.dispatchProgress -= interval;
    // Bounded seeded variation changes formations without capping a large army at eight.
    const variation = 1 + (random(state) * 2 - 1) * RULES.packetVariation;
    const budget = Math.min(
      available,
      Math.max(
        1,
        Math.floor(
          Math.max(RULES.packetSize, available * RULES.packetFraction) *
            (1 + momentum * RULES.packetMomentum) *
            variation,
        ),
      ),
    );
    const cursor = (city.dispatchCursor ?? 0) % routes.length;
    for (let i = 0; i < routes.length; i++) {
      const count = Math.floor(budget / routes.length) + Number(i < budget % routes.length);
      if (count === 0 && (i !== 0 || generalsOf(state, city).length === 0)) continue;
      const routeIndex = routes[(cursor + i) % routes.length];
      dispatchTo(state, city, cityOf(state, junction.exits[routeIndex]), count);
    }
    city.dispatchCursor = (cursor + Math.max(1, budget % routes.length)) % routes.length;
    city.dispatchWaves = (city.dispatchWaves ?? 0) + 1;
  }
}

function movePackets(state) {
  const sources = effectSources(state);
  const motions = state.packets
    .filter((p) => p.phase === 'road')
    .sort((a, b) => a.id - b.id)
    .map((p) => {
      const road = state.roads.find((r) => r.id === p.roadId);
      const step =
        (RULES.step / p.duration) *
        (1 + modifiersAt(state, p.owner, positionOfPacket(state, p), sources).speed);
      const forward = road.a === p.fromCityId;
      const old = forward ? p.progress : 1 - p.progress;
      const end = forward ? Math.min(1, p.progress + step) : 1 - Math.min(1, p.progress + step);
      return { p, road, forward, old, end, stop: 1 };
    });
  for (let i = 0; i < motions.length; i++)
    for (let j = i + 1; j < motions.length; j++) {
      const a = motions[i],
        b = motions[j];
      if (a.road.id !== b.road.id || a.p.owner === b.p.owner) continue;
      const gap = a.old - b.old,
        change = a.end - a.old - (b.end - b.old);
      const encounter =
        Math.abs(gap) * a.road.length < 2 ? 0 : change !== 0 ? -gap / change : Infinity;
      if (encounter >= 0 && encounter <= 1) {
        a.stop = Math.min(a.stop, encounter);
        b.stop = Math.min(b.stop, encounter);
      }
    }
  for (const m of motions) {
    const progress = m.old + (m.end - m.old) * m.stop;
    m.p.progress = m.forward ? progress : 1 - progress;
    m.p.elapsed = m.p.progress * m.p.duration;
    m.p.engaged = m.stop < 1;
    if (m.p.progress + EPS >= 1) {
      m.p.progress = 1;
      m.p.phase = 'siege';
    }
  }
}

function joinFriendly(state) {
  for (const packet of state.packets) {
    if (!['siege', 'stationed'].includes(packet.phase)) continue;
    const city = cityOf(state, packet.targetCityId);
    if (city.owner !== packet.owner) continue;
    const accepted = Math.min(city.capacity - city.troops, packet.troops);
    transferWounds(packet, city, accepted);
    city.troops += accepted;
    packet.troops -= accepted;
    packet.phase = 'stationed';
    packet.roadId = null;
    for (const g of generalsOf(state, packet)) {
      g.packetId = null;
      g.cityId = city.id;
    }
  }
  state.packets = state.packets.filter((p) => alivePacket(state, p));
}

function siegeAt(state, city) {
  return state.packets.some(
    (p) =>
      p.phase === 'siege' &&
      p.targetCityId === city.id &&
      p.owner !== city.owner &&
      alivePacket(state, p),
  );
}

function recruit(state) {
  const sources = effectSources(state);
  for (const city of state.cities) {
    if (city.owner === null || !city.generalKind) continue;
    const cardSource = state.sources.find(
      (s) => s.sourceType === 'card' && s.kind === 'general' && s.cityId === city.id,
    );
    if (cardSource && city.owner !== cardSource.factionId) {
      city.recruitProgress = 0;
      continue;
    }
    if (
      state.generals.some((g) => g.originCityId === city.id) ||
      state.generals.filter((g) => g.owner === city.owner).length >= 2
    ) {
      city.recruitProgress = 0;
      continue;
    }
    if (state.time < city.recruitReadyAt || siegeAt(state, city)) continue;
    city.recruitProgress +=
      RULES.step * (1 + modifiersAt(state, city.owner, city, sources).general);
    if (city.recruitProgress + EPS < RULES.recruitTime) continue;
    city.recruitProgress = 0;
    const type = GENERAL_TYPES[city.generalKind];
    const general = {
      id: state.nextGeneralId++,
      kind: city.generalKind,
      owner: city.owner,
      originCityId: city.id,
      cityId: city.id,
      packetId: null,
      attack: type.attack,
      interval: type.interval,
      defense: type.defense,
      health: type.health,
      maxHealth: type.health,
      nextAttack: state.time,
    };
    state.generals.push(general);
    emit(
      state,
      'general',
      { factionId: city.owner, cityId: city.id, generalId: general.id, kind: general.kind },
      city,
    );
  }
}

function battle(state) {
  const sources = effectSources(state);
  const stacks = [
    ...state.cities.map((c) => ({
      key: `city-${c.id}`,
      entry: c,
      owner: c.owner,
      position: point(c),
      city: c,
      packet: false,
    })),
    ...state.packets
      .filter((p) => alivePacket(state, p))
      .map((p) => ({
        key: `packet-${String(p.id).padStart(8, '0')}`,
        entry: p,
        owner: p.owner,
        position: positionOfPacket(state, p),
        city: null,
        packet: true,
      })),
  ].sort((a, b) => a.key.localeCompare(b.key));
  const contacts = (a, b) => {
    if (a.owner === b.owner) return false;
    if (!a.packet && !b.packet) return false;
    if (a.city || b.city) {
      const c = a.city ?? b.city,
        p = (a.packet ? a : b).entry;
      return ['siege', 'stationed'].includes(p.phase) && p.targetCityId === c.id;
    }
    if (a.entry.phase === 'road' && b.entry.phase === 'road')
      return a.entry.roadId === b.entry.roadId && distance(a.position, b.position) <= 2 + EPS;
    return (
      a.entry.phase !== 'road' &&
      b.entry.phase !== 'road' &&
      a.entry.targetCityId === b.entry.targetCityId
    );
  };
  const liveDefense = (s) =>
    s.entry.troops > 0 || generalsOf(state, s.entry).length > 0 || (s.city?.fortification ?? 0) > 0;
  const damage = new Map();
  const addDamage = (target, value) =>
    damage.set(target.key, (damage.get(target.key) ?? 0) + value);
  for (const stack of stacks) {
    const candidates = stacks.filter((other) => contacts(stack, other) && liveDefense(other));
    if (stack.packet) stack.entry.engaged = candidates.length > 0;
    if (candidates.length === 0) continue;
    const target = candidates.sort(
      (a, b) =>
        distance(stack.position, a.position) - distance(stack.position, b.position) ||
        a.key.localeCompare(b.key),
    )[0];
    const bonus = modifiersAt(state, stack.owner, stack.position, sources);
    if (stack.entry.troops > 0 && state.time + EPS >= stack.entry.nextAttack) {
      stack.entry.nextAttack = state.time + RULES.interval / (1 + bonus.rate);
      addDamage(target, stack.entry.troops * RULES.attack * (1 + bonus.attack));
      emit(
        state,
        'battle',
        { factionId: stack.owner, targetFactionId: target.owner, targetId: target.entry.id },
        stack.position,
      );
    }
    for (const general of generalsOf(state, stack.entry))
      if (state.time + EPS >= general.nextAttack) {
        general.nextAttack = state.time + general.interval / (1 + bonus.rate);
        addDamage(target, general.attack * (1 + bonus.attack));
        emit(
          state,
          'battle',
          { factionId: stack.owner, generalId: general.id, targetFactionId: target.owner },
          stack.position,
        );
      }
  }
  for (const city of state.cities) {
    const weapon = city.weapon;
    if (
      !weapon ||
      state.time < weapon.readyAt ||
      state.time + EPS < weapon.nextFire ||
      (weapon.sourceOwner !== null && weapon.sourceOwner !== city.owner)
    )
      continue;
    const spec = WEAPONS[weapon.kind];
    const targets = stacks
      .filter((s) => s.packet && s.owner !== city.owner && distance(city, s.position) <= spec.range)
      .sort(
        (a, b) =>
          distance(city, a.position) - distance(city, b.position) || a.key.localeCompare(b.key),
      );
    if (targets.length === 0) continue;
    const target = targets[0],
      bonus = modifiersAt(state, city.owner, city, sources).weapon;
    weapon.nextFire = state.time + spec.interval;
    for (const hit of targets)
      if (
        hit === target ||
        (spec.splash > 0 && distance(hit.position, target.position) <= spec.splash)
      )
        addDamage(hit, spec.damage * (1 + bonus));
    emit(
      state,
      'fire',
      {
        factionId: city.owner,
        cityId: city.id,
        weapon: weapon.kind,
        target: target.position,
        targetFactionId: target.owner,
      },
      city,
    );
  }
  // All attacks above observe the same pre-damage snapshot; casualties cannot cancel a return shot.
  for (const stack of stacks) {
    let amount = damage.get(stack.key) ?? 0;
    const bonus = modifiersAt(state, stack.owner, stack.position, sources);
    if (stack.city && stack.city.fortification > 0) {
      const absorbed = Math.min(amount, stack.city.fortification);
      stack.city.fortification -= absorbed;
      amount -= absorbed;
    }
    const hp = RULES.health * (1 + bonus.health);
    if (stack.entry.troops > 0) {
      const defense = Math.min(
        0.65,
        RULES.defense + bonus.defense + (stack.city?.terrain === 'forest' ? 0.08 : 0),
      );
      const received = amount * (1 - defense) + stack.entry.damage;
      const lost = Math.min(stack.entry.troops, Math.floor((received + EPS) / hp));
      stack.entry.troops -= lost;
      stack.entry.damage = stack.entry.troops > 0 ? Math.max(0, received - lost * hp) : 0;
      amount = stack.entry.troops === 0 ? Math.max(0, received - lost * hp) / (1 - defense) : 0;
    }
    for (const g of generalsOf(state, stack.entry).sort((a, b) => a.id - b.id)) {
      const defense = Math.min(0.75, g.defense + bonus.defense);
      const effectiveHealth = g.health * (1 + bonus.health);
      const received = amount * (1 - defense);
      g.health = Math.max(0, effectiveHealth - received) / (1 + bonus.health);
      amount = Math.max(0, received - effectiveHealth) / (1 - defense);
    }
  }
  for (const general of state.generals)
    if (general.health <= 0)
      cityOf(state, general.originCityId).recruitReadyAt = state.time + RULES.recruitCooldown;
  state.generals = state.generals.filter((g) => g.health > 0);
  state.packets = state.packets.filter((p) => alivePacket(state, p));
}

function captureCities(state) {
  for (const city of state.cities) {
    if (city.troops > 0 || city.fortification > EPS || generalsOf(state, city).length) continue;
    const visitors = state.packets.filter(
      (p) => p.phase !== 'road' && p.targetCityId === city.id && alivePacket(state, p),
    );
    const owners = new Set(visitors.map((p) => p.owner));
    if (owners.size !== 1 || owners.has(city.owner)) continue;
    const previousOwner = city.owner;
    city.owner = visitors[0].owner;
    city.damage = 0;
    city.productionProgress = 0;
    city.dispatchProgress = 0;
    city.dispatchWaves = 0;
    city.dispatchCursor = 0;
    city.recruitProgress = 0;
    city.recruitReadyAt = state.time + RULES.recruitCooldown;
    city.capturedAt = state.time;
    const junction = junctionOf(state, city);
    junction.owner = city.owner;
    junction.routeIndex = -1;
    junction.routeIndices = [];
    junction.lastSwitchTime = -1;
    if (city.weapon) {
      city.weapon.readyAt = state.time + 3;
      city.weapon.nextFire = city.weapon.readyAt;
    }
    if (city.owner === 0) state.stats.captured++;
    if (previousOwner === 0) state.stats.lost++;
    emit(state, 'capture', { factionId: city.owner, previousOwner, cityId: city.id }, city);
  }
  refreshCities(state);
  joinFriendly(state);
}

export function getScore(state) {
  const scores = state.factions.map((factionId) => {
    const cities = state.cities.filter((c) => c.owner === factionId);
    const troops =
      cities.reduce((sum, c) => sum + c.troops, 0) +
      state.packets.filter((p) => p.owner === factionId).reduce((sum, p) => sum + p.troops, 0);
    const generals = state.generals.filter((g) => g.owner === factionId && g.health > 0).length;
    return {
      factionId,
      cities: cities.length,
      troops,
      generals,
      score: cities.length * 1000 + troops,
      eliminatedAt: state.eliminatedAt[factionId],
      alive: cities.length > 0 || troops > 0 || generals > 0,
    };
  });
  const compare = (a, b) =>
    Number(b.alive) - Number(a.alive) ||
    (a.alive
      ? b.cities - a.cities || b.troops - a.troops
      : (b.eliminatedAt ?? state.time) - (a.eliminatedAt ?? state.time));
  scores.sort((a, b) => compare(a, b) || a.factionId - b.factionId);
  scores.forEach((entry, i) => {
    entry.rank = i && compare(entry, scores[i - 1]) === 0 ? scores[i - 1].rank : i + 1;
  });
  return scores;
}

function finishIfNeeded(state) {
  for (const rank of getScore(state))
    if (!rank.alive && state.eliminatedAt[rank.factionId] === null) {
      state.eliminatedAt[rank.factionId] = state.time;
      emit(
        state,
        'elimination',
        { factionId: rank.factionId },
        cityOf(state, state.spawns[rank.factionId]),
      );
    }
  const rankings = getScore(state),
    alive = rankings.filter((r) => r.alive);
  if (alive.length > 1 && state.time + EPS < state.duration) return;
  const leaders = rankings.filter((r) => r.rank === 1),
    player = rankings.find((r) => r.factionId === 0);
  const winnerId = alive.length === 0 || leaders.length !== 1 ? null : leaders[0].factionId;
  const outcome =
    winnerId === 0 ? 'victory' : winnerId === null && player.rank === 1 ? 'draw' : 'defeat';
  const reason = state.time + EPS >= state.duration ? 'timeout' : 'elimination';
  state.status = 'finished';
  state.result = {
    completed: true,
    rewardEligible: true,
    levelId: state.levelId,
    seed: state.seed,
    outcome,
    winnerId,
    reason,
    elapsed: state.time,
    score: player.score,
    stars: outcome === 'victory' ? (reason === 'elimination' ? (state.time <= 120 ? 3 : 2) : 1) : 0,
    rankings,
  };
  emit(
    state,
    'finished',
    { factionId: winnerId, outcome, winnerId },
    winnerId === null ? { x: 195, y: 330 } : cityOf(state, state.spawns[winnerId]),
  );
}

export function tick(state, seconds) {
  if (!Number.isFinite(seconds) || seconds < 0)
    throw new RangeError('Tick duration must be finite and nonnegative');
  if (state.status !== 'playing') return state;
  state.accumulator += Math.min(seconds, Math.max(0, state.duration - state.time));
  while (state.accumulator + EPS >= RULES.step && state.status === 'playing') {
    state.accumulator = Math.max(0, state.accumulator - RULES.step);
    state.stepCount++;
    state.time = Math.round(state.stepCount * RULES.step * 1e6) / 1e6;
    state.packets.sort((a, b) => a.id - b.id);
    state.generals.sort((a, b) => a.id - b.id);
    refreshCities(state);
    updateAi(state);
    produceAndDispatch(state);
    movePackets(state);
    joinFriendly(state);
    battle(state);
    captureCities(state);
    recruit(state);
    finishIfNeeded(state);
  }
  state.accumulator = state.status === 'finished' ? 0 : Math.round(state.accumulator * 1e9) / 1e9;
  return state;
}
