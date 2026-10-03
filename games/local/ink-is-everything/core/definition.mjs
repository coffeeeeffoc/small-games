import { finite } from './math.mjs';

export const getLevelDefinition = (state) => state.definition;
export const getRoom = (state, id = state.roomId) => state.rooms[id];
export function normalizeDefinition(input) {
  const fail = (field, message) => {
    throw new Error(`Chapter ${input?.id ?? '(unnamed)'} · ${field}: ${message}`);
  };
  if (!input || typeof input.id !== 'string' || !Array.isArray(input.rooms) || !input.rooms.length)
    fail('id/rooms', 'an id and at least one room are required');
  const definition = structuredClone(input);
  if (
    !definition.initial ||
    !finite(definition.initial.ink) ||
    !finite(definition.initial.maxInk) ||
    definition.initial.ink <= 0 ||
    definition.initial.ink > definition.initial.maxInk
  )
    fail('initial', 'ink must be positive and no greater than maxInk');
  if ('hp' in definition.initial || 'maxHp' in definition.initial)
    fail('initial', 'v3 has one player resource: ink');
  if (!finite(definition.spawn?.x) || !finite(definition.spawn?.y))
    fail('spawn', 'finite x and y are required');
  definition.enemyTypes ??= {};
  definition.equipment ??= {};
  definition.skills ??= {};
  definition.shopItems ??= [];
  definition.requiredSeals ??= 0;
  definition.progression = {
    baseNextXp: 12,
    xpGrowth: 8,
    maxInkPerLevel: 8,
    inkPerLevel: 8,
    choiceCount: 3,
    fallbackInk: 6,
    ...definition.progression,
  };
  definition.rules = {
    minInkAfterSpend: 1,
    maxDropReturnRatio: 0.8,
    pickupRadius: 26,
    dropArmTime: 0.5,
    dropLifetime: 12,
    dropDistanceMin: 80,
    dropDistanceMax: 110,
    lifeSteal: 0.25,
    killRestore: 6,
    ...definition.rules,
  };
  for (const [key, value] of Object.entries(definition.rules))
    if (!finite(value)) fail(`rules.${key}`, 'must be a finite number');
  for (const key of ['attackCost', 'novaCost', 'minInkAfterSpend', 'dropLifetime', 'pickupRadius'])
    if (definition.rules[key] !== undefined && definition.rules[key] <= 0)
      fail(`rules.${key}`, 'must be positive');
  for (const key of ['baseNextXp', 'choiceCount'])
    if (!Number.isInteger(definition.progression[key]) || definition.progression[key] <= 0)
      fail(`progression.${key}`, 'must be a positive integer');
  for (const key of ['xpGrowth', 'maxInkPerLevel', 'inkPerLevel', 'fallbackInk'])
    if (!finite(definition.progression[key]) || definition.progression[key] < 0)
      fail(`progression.${key}`, 'must be nonnegative');
  if (!Number.isInteger(definition.requiredSeals) || definition.requiredSeals < 0)
    fail('requiredSeals', 'must be a nonnegative integer');
  const ids = new Set();
  for (const room of definition.rooms) {
    if (!room.id || ids.has(room.id)) fail(`room.${room.id}`, 'room ids must be unique');
    ids.add(room.id);
    Object.assign(room, {
      width: 960,
      height: 600,
      boundary: 33,
      objects: [],
      obstacles: [],
      portals: [],
      bridges: [],
      enemySpawns: [],
      waves: [],
      ...room,
    });
    if (
      ![room.width, room.height, room.boundary].every(finite) ||
      room.width <= room.boundary * 2 ||
      room.height <= room.boundary * 2 ||
      room.boundary < 0
    )
      fail(`room.${room.id}.dimensions`, 'positive playable width and height are required');
    for (const name of ['objects', 'obstacles', 'portals', 'bridges', 'enemySpawns', 'waves'])
      if (!Array.isArray(room[name])) fail(`room.${room.id}.${name}`, 'must be an array');
    for (const [index, enemy] of [...room.enemySpawns, ...room.waves.flat()].entries()) {
      if (!definition.enemyTypes[enemy.type])
        fail(`room.${room.id}.enemies[${index}].type`, `unknown enemy type ${enemy.type}`);
      if (!finite(enemy.x) || !finite(enemy.y))
        fail(`room.${room.id}.enemies[${index}]`, 'finite x and y are required');
      const hp = enemy.hp ?? definition.enemyTypes[enemy.type].hp;
      if (!finite(hp) || hp <= 0) fail(`room.${room.id}.enemies[${index}].hp`, 'must be positive');
    }
    for (const rectangle of room.obstacles)
      if (
        ![rectangle.x, rectangle.y, rectangle.w, rectangle.h].every(finite) ||
        rectangle.w <= 0 ||
        rectangle.h <= 0
      )
        fail(
          `room.${room.id}.obstacles`,
          'rectangles require finite coordinates and positive dimensions',
        );
  }
  if (!ids.has(definition.start)) fail('start', `unknown room ${definition.start}`);
  for (const room of definition.rooms) {
    for (const portal of room.portals) {
      if (!ids.has(portal.target))
        fail(`room.${room.id}.portal.${portal.id}.target`, `unknown room ${portal.target}`);
      if (!finite(portal.spawn?.x) || !finite(portal.spawn?.y))
        fail(`room.${room.id}.portal.${portal.id}.spawn`, 'finite coordinates are required');
    }
    for (const bridge of room.bridges)
      if (!finite(bridge.cost) || bridge.cost < 0)
        fail(`room.${room.id}.bridge.${bridge.id}.cost`, 'must be nonnegative');
  }
  return definition;
}
