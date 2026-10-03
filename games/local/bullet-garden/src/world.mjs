import { LEVELS, WEATHER, WEATHER_MODIFIERS } from './config.mjs';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const levelOf = (state) => LEVELS[state.levelId] ?? LEVELS.ruins;
const terrainOf = (state) =>
  Array.isArray(state.terrain) ? state.terrain : (levelOf(state).terrain ?? []);
const weatherOf = (state) => state.weather ?? levelOf(state).weather ?? { kind: 'sunny' };

function inside(terrain, x, y, radius = 0) {
  if (terrain.shape === 'rect') {
    const halfWidth = finite(terrain.width) / 2;
    const halfHeight = finite(terrain.height) / 2;
    const nearestX = clamp(x, terrain.x - halfWidth, terrain.x + halfWidth);
    const nearestY = clamp(y, terrain.y - halfHeight, terrain.y + halfHeight);
    return Math.hypot(x - nearestX, y - nearestY) <= radius;
  }
  return Math.hypot(x - terrain.x, y - terrain.y) < finite(terrain.radius) + radius;
}

/** Shared obstacle geometry for the renderer, movement and projectiles. */
export function terrainSolids(state) {
  return terrainOf(state)
    .filter((terrain) => terrain.kind === 'wall')
    .map((terrain) => ({
      ...terrain,
      permanent: true,
      blocksProjectiles: terrain.blocksProjectiles !== false,
    }));
}

/** Air/underground bypass walls, but all layers must remain within the arena. */
export function terrainPointBlocked(state, x, y, radius = 0, movement = 'ground') {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
  const bounds = levelOf(state).bounds;
  const bodyRadius = Math.max(0, finite(radius));
  if (
    x < bounds.left + bodyRadius ||
    x > bounds.right - bodyRadius ||
    y < bounds.top + bodyRadius ||
    y > bounds.bottom - bodyRadius
  )
    return true;
  return (
    movement === 'ground' &&
    terrainSolids(state).some((terrain) => inside(terrain, x, y, bodyRadius))
  );
}

/** Environment multipliers never change the permanent profile or catalog definitions. */
export function weatherStats(state) {
  const settings = weatherOf(state);
  const definition = WEATHER[settings.kind] ?? WEATHER.sunny;
  const result = {
    plantDamage: 1,
    plantDuration: 1,
    plantHealth: 1,
    seedRegen: 1,
    enemySpeed: 1,
    enemyFireRate: 1,
    gunRange: 1,
    iceHealth: 1,
    healPower: 1,
    electricDamage: 1,
    airSpeed: 1,
    projectileSpeed: 1,
    slopeChance: 1,
  };
  for (const [key, multiplier] of Object.entries(definition.modifiers ?? {})) {
    if (Object.hasOwn(result, key)) result[key] *= Math.max(0.1, finite(multiplier, 1));
  }
  const wind = clamp(finite(settings.wind), 0, 1);
  for (const [key, strength] of Object.entries(WEATHER_MODIFIERS.wind.perPower)) {
    if (Object.hasOwn(result, key)) result[key] *= 1 + wind * strength;
  }
  if (settings.thunder) {
    for (const [key, multiplier] of Object.entries(WEATHER_MODIFIERS.thunder.modifiers)) {
      if (Object.hasOwn(result, key)) result[key] *= multiplier;
    }
  }
  return result;
}

function random(state) {
  state.randomState = (Math.imul(1664525, finite(state.randomState, 42) >>> 0) + 1013904223) >>> 0;
  return state.randomState / 4294967296;
}

/** One seeded slip check per slope entry; returned displacement uses normal swept collision. */
export function terrainMovement(state, body, dt) {
  const previous = Array.isArray(body.terrainContacts) ? body.terrainContacts : [];
  const previousX = finite(body.terrainLastX, body.x);
  const previousY = finite(body.terrainLastY, body.y);
  body.terrainSlipCooldown = Math.max(
    0,
    finite(body.terrainSlipCooldown) - Math.max(0, finite(dt)),
  );
  body.terrainLastX = body.x;
  body.terrainLastY = body.y;
  if ((body.layer ?? 'ground') !== 'ground') {
    body.terrainContacts = [];
    return { speedMultiplier: 1, slip: null };
  }
  const contacts = terrainOf(state).filter(
    (terrain) => terrain.kind !== 'wall' && inside(terrain, body.x, body.y),
  );
  const isPlayer = body === state.player;
  const weather = weatherOf(state);
  let speedMultiplier = 1;
  let slip = null;
  for (const terrain of contacts) {
    if (terrain.kind === 'mud') {
      let movement = isPlayer ? finite(terrain.playerSpeed, 0.8) : finite(terrain.enemySpeed, 0.72);
      if (!isPlayer) movement *= WEATHER[weather.kind]?.mudSpeed ?? 1;
      speedMultiplier = Math.min(speedMultiplier, movement);
    }
    if (terrain.kind === 'slope') {
      speedMultiplier = Math.min(speedMultiplier, finite(terrain.speedMultiplier, 0.9));
      if (previous.includes(terrain.id) || body.terrainSlipCooldown > 0 || slip) continue;
      const chance = clamp(
        finite(terrain.slipChance, 0.22) * weatherStats(state).slopeChance,
        0,
        1,
      );
      // Exactly one roll on entry, independent of how long the body stays on the slope.
      if (random(state) >= chance) continue;
      let dx = body.x - previousX,
        dy = body.y - previousY;
      let length = Math.hypot(dx, dy);
      if (length < 0.01) {
        dx = terrain.direction?.x ?? terrain.x - body.x;
        dy = terrain.direction?.y ?? terrain.y - body.y;
        length = Math.hypot(dx, dy);
      }
      if (length < 0.01) {
        dx = 0;
        dy = -1;
        length = 1;
      }
      const retreat = Math.max(0, finite(terrain.slipDistance, 35));
      slip = { dx: (-dx / length) * retreat, dy: (-dy / length) * retreat, terrainId: terrain.id };
      body.terrainSlipCooldown = Math.max(0, finite(terrain.slipCooldown, 1.8));
    }
  }
  body.terrainContacts = contacts.map((terrain) => terrain.id);
  return { speedMultiplier: clamp(speedMultiplier, 0.35, 2), slip };
}
