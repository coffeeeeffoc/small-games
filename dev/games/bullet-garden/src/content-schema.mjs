/** Game-owned Dynamic Content validation. Packs contain data, never executable handlers. */
const CATEGORIES = ['levels', 'enemies', 'plants', 'weather', 'buffs'];
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const ABILITIES = new Set([
  'controlResist',
  'charger',
  'brood',
  'burrower',
  'glider',
  'spitter',
  'shield',
  'shieldBreakStun',
  'bossPhases',
]);
const PLANT_EFFECTS = new Set([
  'slowAura',
  'damageAura',
  'block',
  'explode',
  'healAura',
  'chainLightning',
  'shoot',
]);
const WEATHER_STATS = new Set([
  'plantDamage',
  'plantDuration',
  'plantHealth',
  'seedRegen',
  'enemySpeed',
  'enemyFireRate',
  'gunRange',
  'iceHealth',
  'healPower',
  'electricDamage',
  'airSpeed',
  'projectileSpeed',
  'slopeChance',
]);
const BUFF_STATS = new Set([
  'damage',
  'fireRate',
  'projectiles',
  'burst',
  'bounces',
  'chill',
  'burn',
  'explosion',
  'split',
  'splitExplosion',
  'maxHp',
  'armor',
  'dashReduction',
  'energy',
  'terrainDamage',
  'terrainRadius',
  'terrainLife',
  'thornDamage',
  'thornRange',
  'iceHealth',
  'iceDuration',
  'mushroomDamage',
  'mushroomRange',
  'dashCooldown',
  'sunflowerHeal',
  'sunflowerRange',
  'stormDamage',
  'stormChainRange',
  'turretDamage',
  'turretFireRate',
]);
const BUFF_COUNTS = new Set(['projectiles', 'burst', 'bounces', 'chill', 'burn', 'split']);
const BUFF_FLAT = new Set([
  ...BUFF_COUNTS,
  'maxHp',
  'dashReduction',
  'explosion',
  'splitExplosion',
]);
const BUFF_PERCENT = new Set(['energy', 'terrainDamage', 'terrainRadius', 'terrainLife']);
const EFFECT_PARAMETERS = {
  slowAura: { slow: 0 },
  damageAura: { damagePerSecond: 0 },
  block: {},
  explode: { range: 1, damage: 0 },
  healAura: { range: 1, healPerSecond: 0, maxStackHeal: 0.01 },
  chainLightning: { range: 1, damage: 0, interval: 0.01, chainRange: 1 },
  shoot: { range: 1, damage: 0, interval: 0.01, projectileSpeed: 1 },
};
const finite = (value, minimum = 0) => Number.isFinite(value) && value >= minimum;
const rows = (catalog) => (Array.isArray(catalog) ? catalog : Object.values(catalog ?? {}));

function dataOnly(value, path, errors, depth = 0) {
  if (depth > 24) {
    errors.push(`${path}: nesting limit exceeded`);
    return;
  }
  if (typeof value === 'number' && !Number.isFinite(value))
    errors.push(`${path}: finite numbers required`);
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return;
  if (typeof value !== 'object') {
    errors.push(`${path}: JSON data required`);
    return;
  }
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    errors.push(`${path}: plain JSON objects required`);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key))
      errors.push(`${path}: reserved key ${key}`);
    dataOnly(child, `${path}.${key}`, errors, depth + 1);
  }
}

function reference(entry) {
  return entry.art ?? entry.designReference ?? entry.visual?.designReference;
}

/** Verify an open spawn zone and connected traversable arena using conservative 32px cells. */
function connectedArena(level, errors, prefix) {
  const { bounds, playerStart, terrain = [] } = level;
  const walls = terrain.filter((item) => item.kind === 'wall');
  const clear = (x, y) =>
    x >= bounds.left + 18 &&
    x <= bounds.right - 18 &&
    y >= bounds.top + 18 &&
    y <= bounds.bottom - 18 &&
    walls.every((wall) => Math.hypot(x - wall.x, y - wall.y) >= wall.radius + 20);
  if (!clear(playerStart.x, playerStart.y)) {
    errors.push(`${prefix}: blocked player spawn`);
    return;
  }
  const cells = [],
    lookup = new Map();
  for (let y = bounds.top + 24, row = 0; y <= bounds.bottom - 24; y += 32, row++) {
    for (let x = bounds.left + 24, column = 0; x <= bounds.right - 24; x += 32, column++) {
      if (clear(x, y)) {
        const cell = { x, y, row, column };
        cells.push(cell);
        lookup.set(`${row}:${column}`, cell);
      }
    }
  }
  if (!cells.length) {
    errors.push(`${prefix}: no walkable arena`);
    return;
  }
  const first = cells.reduce((best, cell) =>
    Math.hypot(cell.x - playerStart.x, cell.y - playerStart.y) <
    Math.hypot(best.x - playerStart.x, best.y - playerStart.y)
      ? cell
      : best,
  );
  const queue = [first],
    visited = new Set([`${first.row}:${first.column}`]);
  for (let index = 0; index < queue.length; index++) {
    const cell = queue[index];
    for (const [dr, dc] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      const key = `${cell.row + dr}:${cell.column + dc}`;
      if (lookup.has(key) && !visited.has(key)) {
        visited.add(key);
        queue.push(lookup.get(key));
      }
    }
  }
  if (visited.size !== cells.length) errors.push(`${prefix}: disconnected arena`);
}

/** Append-only packs preserve stable IDs and leave active definitions unchanged on failure. */
export function validateContentPack(pack, current = {}) {
  const errors = [];
  dataOnly(pack, 'pack', errors);
  if (errors.length) return { ok: false, errors };
  if (!pack || Array.isArray(pack) || pack.version !== 1)
    return { ok: false, errors: ['pack.version: expected 1'] };
  const additions = {};
  const catalogs = {};
  for (const category of CATEGORIES) {
    const existing = rows(current[category]);
    const ids = new Set(existing.map((entry) => entry.id));
    const incoming = pack[category] ?? [];
    if (!Array.isArray(incoming) || incoming.length > 1000) {
      errors.push(`${category}: expected at most 1000 definitions`);
      additions[category] = [];
      continue;
    }
    additions[category] = incoming;
    for (const entry of incoming) {
      if (!entry || typeof entry !== 'object' || !ID.test(entry.id)) {
        errors.push(`${category}: invalid stable ID`);
        continue;
      }
      if (ids.has(entry.id)) errors.push(`${category}.${entry.id}: duplicate ID`);
      ids.add(entry.id);
      if (typeof entry.name !== 'string' || !entry.name.trim())
        errors.push(`${category}.${entry.id}: name required`);
      if (typeof reference(entry) !== 'string' || !reference(entry).trim())
        errors.push(`${category}.${entry.id}: prior concept reference required`);
    }
    catalogs[category] = Object.fromEntries(
      [...existing, ...incoming.filter((entry) => entry?.id)].map((entry) => [entry.id, entry]),
    );
  }
  if (!Object.values(additions).some((entries) => entries.length))
    errors.push('pack: at least one definition required');
  if (errors.length) return { ok: false, errors };
  for (const enemy of additions.enemies) {
    const prefix = `enemies.${enemy.id}`;
    for (const key of ['hp', 'radius', 'speed', 'damage', 'coins', 'bite'])
      if (!finite(enemy[key], key === 'hp' || key === 'radius' ? 1 : 0))
        errors.push(`${prefix}.${key}: invalid value`);
    if (!['normal', 'leader', 'boss'].includes(enemy.rank ?? 'normal'))
      errors.push(`${prefix}.rank: unsupported`);
    if (!Array.isArray(enemy.abilities ?? [])) {
      errors.push(`${prefix}.abilities: array required`);
      continue;
    }
    for (const ability of enemy.abilities ?? []) {
      if (!ABILITIES.has(ability?.type)) errors.push(`${prefix}.abilities: unsupported handler`);
      for (const key of ['kind', 'summonKind'])
        if (ability?.[key] && !catalogs.enemies[ability[key]])
          errors.push(`${prefix}.${key}: unknown enemy`);
      for (const key of [
        'cooldown',
        'interval',
        'duration',
        'windup',
        'groundTime',
        'summonInterval',
      ])
        if (ability?.[key] !== undefined && !finite(ability[key], 0.01))
          errors.push(`${prefix}.${key}: positive timer required`);
    }
  }
  for (const plant of additions.plants) {
    const prefix = `plants.${plant.id}`;
    for (const key of ['radius', 'life', 'health', 'capacity', 'regenSeconds'])
      if (!finite(plant[key], 0.01)) errors.push(`${prefix}.${key}: positive value required`);
    if (!Array.isArray(plant.effects) || !plant.effects.length) {
      errors.push(`${prefix}.effects: handlers required`);
      continue;
    }
    for (const effect of plant.effects) {
      if (!PLANT_EFFECTS.has(effect?.type)) errors.push(`${prefix}.effects: unsupported handler`);
      if (effect?.interval !== undefined && !finite(effect.interval, 0.01))
        errors.push(`${prefix}.interval: positive timer required`);
      for (const [key, minimum] of Object.entries(EFFECT_PARAMETERS[effect?.type] ?? {}))
        if (!finite(effect?.[key], minimum))
          errors.push(`${prefix}.${key}: valid handler parameter required`);
      if (effect?.type === 'slowAura' && effect.slow > 1) errors.push(`${prefix}.slow: at most 1`);
    }
  }
  for (const weather of additions.weather) {
    for (const [key, value] of Object.entries(weather.modifiers ?? {}))
      if (!WEATHER_STATS.has(key) || !finite(value, 0.01) || value > 4)
        errors.push(`weather.${weather.id}.${key}: unsupported multiplier`);
    if (
      weather.hazard &&
      (!['hail', 'lightning'].includes(weather.hazard.kind) ||
        !finite(weather.hazard.interval, 1) ||
        !finite(weather.hazard.windup, 0.1) ||
        !finite(weather.hazard.damage) ||
        !finite(weather.hazard.radius, 1) ||
        weather.hazard.radius > 200 ||
        !finite(weather.hazard.plantDamage ?? 0))
    )
      errors.push(`weather.${weather.id}.hazard: unsupported hazard`);
  }
  for (const buff of additions.buffs) {
    const ranks = buff.maxRank ?? buff.maxStacks ?? buff.maxStack;
    if (!Number.isInteger(ranks) || ranks < 1 || ranks > 50 || !Array.isArray(buff.effects))
      errors.push(`buffs.${buff.id}: stack limit and effects required`);
    if ((buff.effects ?? []).filter((effect) => effect?.stat === 'maxHp').length > 1)
      errors.push(`buffs.${buff.id}.maxHp: one additive health effect supported`);
    for (const effect of buff.effects ?? [])
      if (
        !['add', 'addPercent', 'multiply'].includes(effect?.op) ||
        !Number.isFinite(effect.value) ||
        !BUFF_STATS.has(effect.stat)
      )
        errors.push(`buffs.${buff.id}: unsupported effect`);
    for (const effect of buff.effects ?? []) {
      if (
        (BUFF_FLAT.has(effect?.stat) && effect.op !== 'add') ||
        (BUFF_PERCENT.has(effect?.stat) && effect.op !== 'addPercent') ||
        (BUFF_COUNTS.has(effect?.stat) && !Number.isInteger(effect.value)) ||
        !finite(effect?.value) ||
        effect.value > (effect.op === 'multiply' ? 4 : 1000) ||
        (effect.op === 'multiply' && effect.value < 0.01)
      )
        errors.push(`buffs.${buff.id}.${effect?.stat}: unsupported stat/operator combination`);
    }
  }
  const orders = new Set(rows(current.levels).map((level) => level.order));
  for (const level of additions.levels) {
    const prefix = `levels.${level.id}`;
    if (!Number.isInteger(level.order) || level.order < 1 || orders.has(level.order))
      errors.push(`${prefix}.order: unique positive integer required`);
    orders.add(level.order);
    for (const key of ['duration', 'waveDuration', 'waves', 'plantCap'])
      if (!finite(level[key], 1)) errors.push(`${prefix}.${key}: positive value required`);
    if (
      !Number.isInteger(level.waves) ||
      Math.abs(level.duration - level.waveDuration * level.waves) > 0.001
    )
      errors.push(`${prefix}: wave timing mismatch`);
    const b = level.bounds,
      w = level.world,
      p = level.playerStart;
    const geometry =
      b &&
      w &&
      p &&
      [b.left, b.right, b.top, b.bottom, w.width, w.height, p.x, p.y].every(Number.isFinite) &&
      b.left >= 0 &&
      b.top >= 0 &&
      b.right <= w.width &&
      b.bottom <= w.height &&
      b.right - b.left >= 160 &&
      b.bottom - b.top >= 160;
    if (!geometry) {
      errors.push(`${prefix}: invalid world geometry`);
      continue;
    }
    if (!catalogs.weather[level.weather?.kind])
      errors.push(`${prefix}.weather: unknown base weather`);
    if (!finite(level.rewards?.coins) || !finite(level.rewards?.xp))
      errors.push(`${prefix}.rewards: invalid amount`);
    const terrain = level.terrain ?? [];
    if (!Array.isArray(terrain) || terrain.length > 120) {
      errors.push(`${prefix}.terrain: at most 120 regions`);
      continue;
    }
    const terrainIds = new Set();
    let terrainValid = true;
    for (const item of terrain) {
      if (
        !item?.id ||
        terrainIds.has(item.id) ||
        !['wall', 'mud', 'slope'].includes(item.kind) ||
        (item.shape !== undefined && item.shape !== 'circle') ||
        !finite(item.radius, 1) ||
        !Number.isFinite(item.x) ||
        !Number.isFinite(item.y) ||
        item.x - item.radius < b.left ||
        item.x + item.radius > b.right ||
        item.y - item.radius < b.top ||
        item.y + item.radius > b.bottom
      ) {
        errors.push(`${prefix}.terrain: invalid region`);
        terrainValid = false;
      }
      terrainIds.add(item?.id);
    }
    if (terrainValid) connectedArena(level, errors, prefix);
    const spawn = level.spawn;
    if (
      !spawn ||
      !finite(spawn.interval, 0.1) ||
      !finite(spawn.minimumInterval, 0.1) ||
      !Number.isInteger(spawn.maxEnemies) ||
      spawn.maxEnemies < 2 ||
      spawn.maxEnemies > 80 ||
      !Array.isArray(spawn.composition) ||
      !spawn.composition.length
    ) {
      errors.push(`${prefix}.spawn: invalid bounded spawn configuration`);
      continue;
    }
    if (spawn.composition[0].fromWave !== 1)
      errors.push(`${prefix}.spawn: first wave needs an enemy pool`);
    let lastWave = 0;
    for (const tier of spawn.composition) {
      if (
        !Number.isInteger(tier.fromWave) ||
        tier.fromWave <= lastWave ||
        tier.fromWave > level.waves
      )
        errors.push(`${prefix}.spawn: tiers must increase within wave count`);
      lastWave = tier.fromWave;
      const weights = Object.entries(tier.weights ?? {});
      if (!weights.length || !weights.some(([, weight]) => finite(weight, 0.01)))
        errors.push(`${prefix}.spawn: empty enemy pool`);
      if (
        !weights.some(
          ([kind, weight]) =>
            finite(weight, 0.01) &&
            (catalogs.enemies[kind]?.unlockLevel ?? 1) <= (level.unlockLevel ?? 1),
        )
      )
        errors.push(`${prefix}.spawn: no enemy available at entry player level`);
      for (const [kind, weight] of weights)
        if (
          !catalogs.enemies[kind] ||
          !finite(weight) ||
          (catalogs.enemies[kind]?.unlockStage ?? 1) > level.order ||
          (catalogs.enemies[kind]?.rank ?? 'normal') !== 'normal'
        )
          errors.push(`${prefix}.spawn.${kind}: invalid or locked enemy`);
    }
    if (
      level.encounter &&
      (!catalogs.enemies[level.encounter.kind] ||
        !['leader', 'boss'].includes(catalogs.enemies[level.encounter.kind]?.rank) ||
        !Number.isInteger(level.encounter.atWave) ||
        level.encounter.atWave < 1 ||
        level.encounter.atWave > level.waves)
    )
      errors.push(`${prefix}.encounter: invalid required enemy`);
    if (level.encounter && terrainValid && catalogs.enemies[level.encounter.kind]) {
      const radius = catalogs.enemies[level.encounter.kind].radius;
      const walls = terrain.filter((item) => item.kind === 'wall');
      let placement = false;
      for (let y = b.top + radius; y <= b.bottom - radius && !placement; y += 24)
        for (let x = b.left + radius; x <= b.right - radius && !placement; x += 24)
          placement = walls.every(
            (wall) => Math.hypot(x - wall.x, y - wall.y) >= radius + wall.radius + 2,
          );
      if (!placement)
        errors.push(`${prefix}.encounter: no legal placement for required enemy radius`);
    }
  }
  return errors.length
    ? { ok: false, errors }
    : { ok: true, additions: JSON.parse(JSON.stringify(additions)) };
}
