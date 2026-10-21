import { LEVELS } from './catalog.mjs';
import {
  FACTIONS,
  CITY_TYPES,
  ROAD_TYPES,
  GENERAL_TYPES,
  WEAPONS,
  TERRAINS,
  LOADOUT_KINDS,
} from './rules.mjs';
export { LEVELS } from './catalog.mjs';
export * from './rules.mjs';
export const CONTENT_VERSION = 2;

const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const identity = (v) => typeof v === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(v);
const number = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
const text = (v) => typeof v === 'string' && v.length > 0 && v.length <= 200;
const unique = (values) => new Set(values).size === values.length;
function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
function keys(value, allowed, name) {
  requireValue(
    object(value) && Object.keys(value).every((key) => allowed.includes(key)),
    `Invalid ${name} fields`,
  );
}

/** Strict game-owned schema: malformed authoring data never becomes playable defaults. */
export function validateLevels(levels = LEVELS) {
  const errors = [];
  if (!Array.isArray(levels) || levels.length === 0)
    return { valid: false, errors: ['Expected a nonempty level catalog'] };
  const ids = new Set(levels.filter(object).map((l) => l.id));
  const orders = new Set(),
    seenIds = new Set();
  for (const level of levels) {
    try {
      keys(
        level,
        [
          'id',
          'order',
          'chapter',
          'chapterName',
          'name',
          'subtitle',
          'objective',
          'tutorial',
          'duration',
          'requires',
          'reward',
          'factions',
          'ai',
          'baseline',
          'terrain',
          'spawnSets',
          'cities',
          'roads',
        ],
        'level',
      );
      requireValue(identity(level.id) && !seenIds.has(level.id), 'Invalid or duplicate level id');
      seenIds.add(level.id);
      requireValue(
        Number.isInteger(level.order) && number(level.order, 1, 100) && !orders.has(level.order),
        'Invalid or duplicate order',
      );
      orders.add(level.order);
      requireValue(
        level.chapter === Math.ceil(level.order / 10) && text(level.chapterName),
        'Invalid chapter',
      );
      requireValue(
        [level.name, level.subtitle, level.objective].every(text) &&
          typeof level.tutorial === 'string',
        'Invalid descriptions',
      );
      requireValue([180, 240].includes(level.duration), 'Invalid duration');
      requireValue(
        Array.isArray(level.requires) &&
          unique(level.requires) &&
          level.requires.every((id) => ids.has(id) && id !== level.id),
        'Invalid prerequisites',
      );
      keys(level.reward, ['unlock'], 'reward');
      requireValue(
        level.reward.unlock === null ||
          (ids.has(level.reward.unlock) && level.reward.unlock !== level.id),
        'Unknown reward unlock',
      );
      requireValue(
        Array.isArray(level.factions) &&
          number(level.factions.length, 2, 4) &&
          unique(level.factions) &&
          level.factions.includes(0) &&
          level.factions.every((id) => FACTIONS.some((f) => f.id === id)),
        'Invalid factions',
      );
      keys(level.ai, level.factions.filter((f) => f !== 0).map(String), 'AI');
      requireValue(
        level.factions
          .filter((f) => f !== 0)
          .every((f) =>
            ['aggressive', 'defensive', 'expansionist', 'opportunist'].includes(level.ai[f]),
          ),
        'Missing or invalid AI style',
      );
      keys(level.baseline, ['kind', 'value', 'radius'], 'baseline');
      requireValue(
        LOADOUT_KINDS.includes(level.baseline.kind) &&
          level.baseline.kind !== 'troops' &&
          number(level.baseline.value, 0.01, 0.3) &&
          number(level.baseline.radius, 40, 150),
        'Invalid baseline',
      );
      requireValue(Array.isArray(level.terrain) && level.terrain.length > 0, 'Missing terrain');
      for (const t of level.terrain) {
        keys(t, ['type', 'x', 'y', 'radius'], 'terrain');
        requireValue(
          TERRAINS.includes(t.type) &&
            number(t.x, 0, 390) &&
            number(t.y, 0, 660) &&
            number(t.radius, 1, 200),
          'Invalid terrain',
        );
      }
      requireValue(
        Array.isArray(level.cities) && number(level.cities.length, level.factions.length + 1, 12),
        'Invalid cities',
      );
      const cityIds = new Set(),
        junctionIds = new Set();
      for (let i = 0; i < level.cities.length; i++)
        for (let j = i + 1; j < level.cities.length; j++) {
          const a = level.cities[i],
            b = level.cities[j];
          requireValue(
            a && b && Math.hypot(a.x - b.x, a.y - b.y) >= 64,
            'City touch/label spacing must be at least 64',
          );
        }
      for (const c of level.cities) {
        keys(
          c,
          [
            'id',
            'name',
            'x',
            'y',
            'type',
            'terrain',
            'owner',
            'troops',
            'reserve',
            'weapon',
            'general',
            'junction',
          ],
          'city',
        );
        requireValue(identity(c.id) && !cityIds.has(c.id) && text(c.name), 'Invalid city identity');
        cityIds.add(c.id);
        requireValue(number(c.x, 25, 365) && number(c.y, 70, 610), 'City outside battlefield');
        requireValue(
          Object.hasOwn(CITY_TYPES, c.type) && TERRAINS.includes(c.terrain),
          'Invalid city type/terrain',
        );
        requireValue(
          c.owner === null && c.troops === 0 && c.reserve === 0,
          'Initial city owner/troops/reserve must be null/0/0',
        );
        requireValue(c.weapon === null || Object.hasOwn(WEAPONS, c.weapon), 'Invalid weapon');
        requireValue(
          c.general === null || Object.hasOwn(GENERAL_TYPES, c.general),
          'Invalid general',
        );
        requireValue(
          (c.type === 'muster') === (c.general !== null),
          'Muster must specify a general',
        );
        keys(c.junction, ['id', 'x', 'y', 'routeIndex', 'exits'], 'junction');
        requireValue(
          identity(c.junction.id) && !junctionIds.has(c.junction.id),
          'Invalid junction id',
        );
        junctionIds.add(c.junction.id);
        requireValue(
          c.junction.x === c.x && c.junction.y === c.y && c.junction.routeIndex === -1,
          'Junction must initially hold at city',
        );
      }
      requireValue(
        Array.isArray(level.roads) && level.roads.length > 0 && level.roads.length <= 150,
        'Invalid roads',
      );
      const pairs = new Set(),
        roadIds = new Set(),
        adjacency = new Map([...cityIds].map((id) => [id, []]));
      for (const r of level.roads) {
        keys(r, ['id', 'a', 'b', 'type'], 'road');
        const pair = [r.a, r.b].sort().join('|');
        requireValue(identity(r.id) && !roadIds.has(r.id) && !pairs.has(pair), 'Duplicate road');
        requireValue(
          r.a !== r.b && cityIds.has(r.a) && cityIds.has(r.b) && Object.hasOwn(ROAD_TYPES, r.type),
          'Invalid road endpoint/type',
        );
        pairs.add(pair);
        roadIds.add(r.id);
        adjacency.get(r.a).push(r.b);
        adjacency.get(r.b).push(r.a);
      }
      for (const c of level.cities)
        requireValue(
          Array.isArray(c.junction.exits) &&
            unique(c.junction.exits) &&
            c.junction.exits.length === adjacency.get(c.id).length &&
            c.junction.exits.every((id) => adjacency.get(c.id).includes(id)) &&
            c.junction.exits.length > 0,
          'Invalid exits: must exactly match bidirectional roads',
        );
      const reached = new Set([level.cities[0].id]);
      for (const id of reached) for (const next of adjacency.get(id)) reached.add(next);
      requireValue(reached.size === cityIds.size, 'Road graph must be connected');
      requireValue(
        Array.isArray(level.spawnSets) && number(level.spawnSets.length, 1, 8),
        'Missing spawn sets',
      );
      const seenSets = new Set();
      for (const set of level.spawnSets) {
        requireValue(
          Array.isArray(set) &&
            set.length === level.factions.length &&
            unique(set) &&
            set.every((id) => cityIds.has(id)),
          'Invalid spawn set',
        );
        const sig = [...set].sort().join('|');
        requireValue(!seenSets.has(sig), 'Duplicate spawn set');
        seenSets.add(sig);
        const budgets = set.map((id) => {
          const c = level.cities.find((entry) => entry.id === id);
          return JSON.stringify([
            c.type,
            c.weapon,
            c.general,
            c.terrain,
            level.roads
              .filter((r) => r.a === id || r.b === id)
              .map((r) => r.type)
              .sort(),
          ]);
        });
        requireValue(
          budgets.every((b) => b === budgets[0]),
          'Unequal spawn budgets/degrees',
        );
      }
    } catch (error) {
      errors.push(`${level?.id ?? '?'}: ${error.message}`);
    }
  }
  const unlocked = new Set();
  for (let pass = 0; pass < levels.length; pass++)
    for (const l of levels)
      if (
        identity(l?.id) &&
        Array.isArray(l.requires) &&
        l.requires.every((id) => unlocked.has(id))
      )
        unlocked.add(l.id);
  if (unlocked.size !== ids.size)
    errors.push('Campaign unlock graph contains an unreachable level');
  return { valid: errors.length === 0, errors };
}

export function getLevel(id) {
  const level = LEVELS.find((entry) => entry.id === id);
  if (!level) throw new RangeError(`Unknown level: ${id}`);
  return level;
}

export function migrateProgress(raw) {
  const source = object(raw) ? raw : {};
  const progress = { version: CONTENT_VERSION, completed: [], stars: {}, best: {} };
  if (Array.isArray(source.completed))
    progress.completed = [
      ...new Set(source.completed.filter((id) => LEVELS.some((level) => level.id === id))),
    ];
  for (const level of LEVELS) {
    if (Number.isFinite(source.stars?.[level.id]))
      progress.stars[level.id] = Math.max(0, Math.min(3, Math.floor(source.stars[level.id])));
    if (Number.isFinite(source.best?.[level.id]))
      progress.best[level.id] = Math.max(0, Math.floor(source.best[level.id]));
  }
  return progress;
}

export function getUnlockedLevels(progress = {}) {
  const completed = new Set(migrateProgress(progress).completed);
  return LEVELS.filter(
    (level) => completed.has(level.id) || level.requires.every((id) => completed.has(id)),
  ).map((level) => level.id);
}

export function applyResult(progress, result) {
  if (!object(progress)) throw new TypeError('Progress must be an object');
  Object.assign(progress, migrateProgress(progress));
  if (
    !result?.completed ||
    !['elimination', 'timeout'].includes(result.reason) ||
    !LEVELS.some((level) => level.id === result.levelId)
  )
    return progress;
  if (Number.isFinite(result.score))
    progress.best[result.levelId] = Math.max(
      progress.best[result.levelId] ?? 0,
      Math.max(0, Math.floor(result.score)),
    );
  if (result.outcome === 'victory') {
    if (!progress.completed.includes(result.levelId)) progress.completed.push(result.levelId);
    progress.stars[result.levelId] = Math.max(
      progress.stars[result.levelId] ?? 0,
      Math.max(1, Math.min(3, Math.floor(Number(result.stars) || 1))),
    );
  }
  return progress;
}
