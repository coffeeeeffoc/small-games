/** Game-owned campaign data. Coordinates use the portrait 390 × 660 battlefield. */
export const FACTIONS = Object.freeze([
  { id: 0, name: '赤岚', shortName: '赤', color: '#b94339', style: 'aggressive' },
  { id: 1, name: '苍澜', shortName: '苍', color: '#467c9a', style: 'defensive' },
  { id: 2, name: '青岑', shortName: '青', color: '#608c65', style: 'expansionist' },
  { id: 3, name: '玄金', shortName: '金', color: '#c6943c', style: 'opportunist' },
]);

export const RULES = Object.freeze({
  duration: 180,
  step: 0.1,
  reserve: 8,
  capacity: 99,
  production: 1.25,
  dispatchInterval: 2,
  packetSize: 8,
  speed: 42,
  switchCooldown: 0.2,
});

const city = (id, name, x, y, owner, troops, exits, routeIndex = 0) => ({
  id,
  name,
  x,
  y,
  owner,
  troops,
  // Every city owns exactly one switch; the approach road is short but real.
  junction: { id: `${id}-switch`, x: x + (x < 195 ? 30 : -30), y: y - 31, exits, routeIndex },
});

export const LEVELS = [
  {
    id: 'crossroads',
    order: 1,
    name: '初识岔路',
    subtitle: '一念转向，兵分两岸',
    objective: '夺下中立城，接通前线。',
    tutorial: '点赤色岔路切换出口。军队自动出发，先取无主城。',
    requires: [],
    reward: { unlock: 'riverfork' },
    factions: [0, 1],
    ai: { 1: 'expansionist' },
    cities: [
      city('redgate', '赤关', 195, 545, 0, 40, ['westford', 'eastford']),
      city('westford', '西津', 88, 365, null, 10, ['bluegate', 'eastford', 'redgate'], 2),
      city('eastford', '东津', 300, 365, null, 10, ['bluegate', 'redgate', 'westford'], 1),
      city('bluegate', '苍关', 195, 176, 1, 32, ['eastford', 'westford']),
    ],
  },
  {
    id: 'riverfork',
    order: 2,
    name: '两岸争渡',
    subtitle: '内线调兵，争一线先机',
    objective: '让后方兵力汇入前线，争夺河中要塞。',
    tutorial: '占城后，岔路也归你。调转后方出口，持续补给前线。',
    requires: ['crossroads'],
    reward: { unlock: 'four-kingdoms' },
    factions: [0, 1, 2],
    ai: { 1: 'defensive', 2: 'expansionist' },
    cities: [
      city('redgate', '赤关', 111, 556, 0, 44, ['southbank', 'westbank']),
      city('southbank', '南津', 292, 511, null, 9, ['heartland', 'redgate', 'jadegate'], 1),
      city('westbank', '西渡', 82, 345, null, 9, ['heartland', 'bluegate', 'redgate'], 2),
      city('heartland', '河中', 235, 347, null, 16, [
        'bluegate',
        'jadegate',
        'westbank',
        'southbank',
      ]),
      city('bluegate', '苍关', 101, 160, 1, 36, ['westbank', 'heartland', 'jadegate']),
      city('jadegate', '青关', 298, 160, 2, 36, ['heartland', 'southbank', 'bluegate']),
    ],
  },
  {
    id: 'four-kingdoms',
    order: 3,
    name: '四方逐鹿',
    subtitle: '四方势起，天下归流',
    objective: '观察四方战线，抓住空城与合流时机。',
    tutorial: '三军各有取舍。点亮相邻城的出口，让你的兵线形成合流。',
    requires: ['riverfork'],
    reward: { unlock: null },
    factions: [0, 1, 2, 3],
    ai: { 1: 'defensive', 2: 'expansionist', 3: 'opportunist' },
    cities: [
      city('redgate', '赤关', 89, 552, 0, 42, ['westbank', 'southbank']),
      city('southbank', '南津', 228, 541, null, 10, ['heartland', 'goldgate', 'redgate'], 2),
      city('goldgate', '金关', 307, 433, 3, 36, ['southbank', 'heartland', 'eastbank']),
      city('westbank', '西渡', 74, 351, null, 10, ['heartland', 'bluegate', 'redgate'], 2),
      city('heartland', '王畿', 195, 355, null, 18, [
        'westbank',
        'northbank',
        'eastbank',
        'southbank',
      ]),
      city('eastbank', '东渡', 309, 295, null, 10, ['jadegate', 'heartland', 'goldgate']),
      city('bluegate', '苍关', 80, 161, 1, 36, ['northbank', 'westbank']),
      city('northbank', '北津', 201, 197, null, 10, ['jadegate', 'heartland', 'bluegate']),
      city('jadegate', '青关', 310, 147, 2, 36, ['eastbank', 'northbank']),
    ],
  },
];

export const CONTENT_VERSION = 1;

/** Validation is owned by this Game rather than a shared platform schema. */
export function validateLevels(levels = LEVELS) {
  const errors = [];
  if (!Array.isArray(levels) || levels.length === 0)
    return { valid: false, errors: ['Expected a nonempty level catalog'] };
  const ids = new Set();
  for (const level of levels) {
    if (
      !level ||
      typeof level !== 'object' ||
      Array.isArray(level) ||
      typeof level.id !== 'string' ||
      !level.id
    ) {
      errors.push('Level id must be a nonempty string');
      continue;
    }
    if (ids.has(level.id)) errors.push(`Duplicate level id: ${level.id}`);
    ids.add(level.id);
  }
  const unlocked = new Set();
  for (const level of levels) {
    if (!level || typeof level.id !== 'string') continue;
    const prefix = `${level.id}: `;
    if (!Array.isArray(level.requires)) {
      errors.push(prefix + 'requires must be an array');
      continue;
    }
    for (const prerequisite of level.requires)
      if (!ids.has(prerequisite) || prerequisite === level.id)
        errors.push(prefix + `Invalid prerequisite ${prerequisite}`);
    if (level.reward?.unlock != null && !ids.has(level.reward.unlock))
      errors.push(prefix + 'Unknown reward unlock');
    if (
      !Array.isArray(level.factions) ||
      !level.factions.includes(0) ||
      level.factions.length < 2 ||
      new Set(level.factions).size !== level.factions.length ||
      level.factions.some((id) => !FACTIONS.some((faction) => faction.id === id))
    ) {
      errors.push(prefix + 'Invalid factions');
      continue;
    }
    if (!Array.isArray(level.cities) || level.cities.length < 2) {
      errors.push(prefix + 'Expected at least two cities');
      continue;
    }
    if (level.cities.some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry))) {
      errors.push(prefix + 'Invalid city object');
      continue;
    }
    const cityIds = new Set(level.cities.map((entry) => entry.id));
    const junctionIds = new Set();
    if (cityIds.size !== level.cities.length) errors.push(prefix + 'Duplicate city id');
    for (const entry of level.cities) {
      if (typeof entry.id !== 'string' || !entry.id || !entry.name)
        errors.push(prefix + 'Invalid city identity');
      if (
        ![entry.x, entry.y].every(Number.isFinite) ||
        entry.x < 30 ||
        entry.x > 360 ||
        entry.y < 100 ||
        entry.y > 590
      )
        errors.push(prefix + `City outside battlefield: ${entry.id}`);
      if (entry.owner !== null && !level.factions?.includes(entry.owner))
        errors.push(prefix + `Unknown city owner: ${entry.id}`);
      if (!Number.isInteger(entry.troops) || entry.troops < 0 || entry.troops > RULES.capacity)
        errors.push(prefix + `Invalid garrison: ${entry.id}`);
      const junction = entry.junction;
      if (!junction || typeof junction.id !== 'string' || junctionIds.has(junction.id))
        errors.push(prefix + `Missing or duplicate junction: ${entry.id}`);
      if (!junction) continue;
      junctionIds.add(junction.id);
      if (
        ![junction.x, junction.y].every(Number.isFinite) ||
        junction.x < 20 ||
        junction.x > 370 ||
        junction.y < 80 ||
        junction.y > 610
      )
        errors.push(prefix + `Invalid junction position: ${entry.id}`);
      if (
        !Array.isArray(junction.exits) ||
        junction.exits.length < 2 ||
        new Set(junction.exits).size !== junction.exits.length ||
        junction.exits.some((id) => !cityIds.has(id) || id === entry.id)
      )
        errors.push(prefix + `Invalid exits: ${entry.id}`);
      if (
        !Number.isInteger(junction.routeIndex) ||
        junction.routeIndex < 0 ||
        junction.routeIndex >= (junction.exits?.length ?? 0)
      )
        errors.push(prefix + `Invalid selected exit: ${entry.id}`);
    }
    // A route graph must be strongly connected, otherwise a city can become unreachable.
    for (const start of cityIds) {
      const reached = new Set([start]);
      const queue = [start];
      for (let i = 0; i < queue.length; i++) {
        const source = level.cities.find((entry) => entry.id === queue[i]);
        for (const target of Array.isArray(source?.junction?.exits) ? source.junction.exits : [])
          if (cityIds.has(target) && !reached.has(target)) {
            reached.add(target);
            queue.push(target);
          }
      }
      if (reached.size !== cityIds.size) {
        errors.push(prefix + 'Road graph must be strongly connected');
        break;
      }
    }
    for (const faction of level.factions ?? [])
      if (!level.cities.some((entry) => entry.owner === faction))
        errors.push(prefix + `Faction ${faction} has no starting city`);
    for (const style of Object.values(level.ai ?? {}))
      if (!['aggressive', 'defensive', 'expansionist', 'opportunist'].includes(style))
        errors.push(prefix + 'Unknown AI style');
  }
  for (let pass = 0; pass < levels.length; pass++)
    for (const level of levels)
      if (
        level?.id &&
        Array.isArray(level.requires) &&
        level.requires.every((id) => unlocked.has(id))
      )
        unlocked.add(level.id);
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
  const source = raw && typeof raw === 'object' ? raw : {};
  const completed = Array.isArray(source.completed)
    ? source.completed.filter((id) => LEVELS.some((level) => level.id === id))
    : [];
  const progress = {
    version: CONTENT_VERSION,
    completed: [...new Set(completed)],
    stars: {},
    best: {},
  };
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
  return LEVELS.filter((level) => level.requires.every((id) => completed.has(id))).map(
    (level) => level.id,
  );
}

export function applyResult(progress, result) {
  if (!progress || typeof progress !== 'object') throw new TypeError('Progress must be an object');
  Object.assign(progress, migrateProgress(progress));
  if (!result || !LEVELS.some((level) => level.id === result.levelId)) return progress;
  if (Number.isFinite(result.score))
    progress.best[result.levelId] = Math.max(
      progress.best[result.levelId] ?? 0,
      Math.floor(result.score),
    );
  if (result.outcome === 'victory') {
    if (!progress.completed.includes(result.levelId)) progress.completed.push(result.levelId);
    const stars = Math.max(1, Math.min(3, Math.floor(Number(result.stars) || 1)));
    progress.stars[result.levelId] = Math.max(progress.stars[result.levelId] ?? 0, stars);
  }
  return progress;
}
