export const CONTENT_SCHEMA_VERSION = 1;

// Character positions use a centre x and a feet y. Platforms use left/top.
export const LEVELS = [
  {
    schemaVersion: 1,
    id: 'foundry-entry',
    name: '运输车间',
    subtitle: '突破前哨，寻找出路',
    width: 2400,
    ground: 570,
    spawn: { x: 420, y: 570 },
    exitX: 2260,
    platforms: [{ x: 1060, y: 444, w: 280, h: 22 }],
    barrels: [
      { x: 770, y: 570 },
      { x: 920, y: 570 },
      { x: 1680, y: 570 },
      { x: 1820, y: 570 },
    ],
    waves: [
      {
        id: 'entry-watch',
        enemies: [
          { type: 'shooter', x: 810, y: 570 },
          { type: 'chaser', x: 940, y: 570 },
          { type: 'shooter', x: 1200, y: 444 },
          { type: 'chaser', x: 1510, y: 570 },
          { type: 'drone', x: 1610, y: 365 },
        ],
      },
      {
        id: 'entry-reinforcements',
        delay: 1.8,
        enemies: [
          { type: 'shooter', x: 1720, y: 570 },
          { type: 'chaser', x: 1820, y: 570 },
          { type: 'drone', x: 1960, y: 365 },
          { type: 'shooter', x: 2180, y: 570 },
          { type: 'chaser', x: 2280, y: 570 },
        ],
      },
    ],
    reward: { heal: 30, upgrade: true },
    unlocks: ['furnace-crossing'],
  },
  {
    schemaVersion: 1,
    id: 'furnace-crossing',
    name: '熔炉走廊',
    subtitle: '清空两波守卫',
    width: 2400,
    ground: 570,
    spawn: { x: 420, y: 570 },
    exitX: 2260,
    platforms: [
      { x: 610, y: 442, w: 290, h: 22 },
      { x: 840, y: 330, w: 240, h: 22 },
      { x: 1580, y: 442, w: 340, h: 22 },
    ],
    barrels: [
      { x: 720, y: 570 },
      { x: 855, y: 570 },
      { x: 1680, y: 442 },
      { x: 1770, y: 570 },
      { x: 1930, y: 570 },
    ],
    waves: [
      {
        id: 'furnace-watch',
        enemies: [
          { type: 'chaser', x: 810, y: 570 },
          { type: 'shooter', x: 850, y: 442 },
          { type: 'drone', x: 1100, y: 320 },
          { type: 'shooter', x: 1340, y: 570 },
          { type: 'chaser', x: 1730, y: 570 },
          { type: 'shooter', x: 1850, y: 442 },
        ],
      },
      {
        id: 'furnace-reinforcements',
        delay: 1.8,
        enemies: [
          { type: 'chaser', x: 1570, y: 570 },
          { type: 'drone', x: 1760, y: 338 },
          { type: 'shooter', x: 1960, y: 570 },
          { type: 'chaser', x: 2150, y: 570 },
          { type: 'shooter', x: 2270, y: 570 },
        ],
      },
    ],
    reward: { heal: 30, upgrade: true },
    unlocks: ['dismantler-core'],
  },
  {
    schemaVersion: 1,
    id: 'dismantler-core',
    name: '核心机库',
    subtitle: '击败拆解者',
    boss: '拆解者',
    width: 2400,
    ground: 570,
    spawn: { x: 420, y: 570 },
    exitX: 2260,
    platforms: [
      { x: 670, y: 442, w: 260, h: 22 },
      { x: 1430, y: 442, w: 280, h: 22 },
    ],
    barrels: [
      { x: 1160, y: 570 },
      { x: 1780, y: 570 },
      { x: 1915, y: 570 },
    ],
    waves: [{ id: 'dismantler', enemies: [{ type: 'boss', x: 1990, y: 570 }] }],
    reward: { heal: 0, upgrade: false },
    unlocks: [],
  },
];

const ENEMY_TYPES = new Set(['shooter', 'chaser', 'drone', 'boss']);

/** Validate this game's content schema without DOM or build-tool dependencies. */
export function validateLevels(levels = LEVELS) {
  const errors = [];
  if (!Array.isArray(levels) || !levels.length) return ['关卡目录不能为空'];
  const ids = new Set();
  for (const level of levels) {
    if (!level || typeof level !== 'object') {
      errors.push('关卡必须是对象');
      continue;
    }
    const label = level.id || '未命名关卡';
    if (typeof level.id !== 'string' || !level.id || ids.has(level.id))
      errors.push(`${label}: ID 必须唯一`);
    ids.add(level.id);
    if (level.schemaVersion !== CONTENT_SCHEMA_VERSION) errors.push(`${label}: 不支持的内容版本`);
    if (!Number.isFinite(level.width) || level.width < 1280 || !Number.isFinite(level.ground))
      errors.push(`${label}: 无效场地尺寸`);
    const inside = (x, y) =>
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      x >= 40 &&
      x <= level.width - 40 &&
      y >= 140 &&
      y <= level.ground;
    if (!level.spawn || !inside(level.spawn.x, level.spawn.y) || level.spawn.y !== level.ground)
      errors.push(`${label}: 起点必须位于安全地面`);
    // Each room has an uninterrupted floor; any in-bounds floor exit is reachable.
    if (!Number.isFinite(level.exitX) || level.exitX < 40 || level.exitX > level.width - 40)
      errors.push(`${label}: 出口不可达`);
    if (!Array.isArray(level.platforms)) errors.push(`${label}: 缺少平台配置`);
    for (const p of level.platforms || []) {
      if (
        ![p.x, p.y, p.w, p.h].every(Number.isFinite) ||
        p.x < 0 ||
        p.x + p.w > level.width ||
        p.y < 140 ||
        p.y >= level.ground ||
        p.w < 60 ||
        p.h <= 0
      )
        errors.push(`${label}: 平台越界`);
    }
    for (const b of level.barrels || []) if (!inside(b.x, b.y)) errors.push(`${label}: 爆炸桶越界`);
    if (!Array.isArray(level.waves) || !level.waves.length)
      errors.push(`${label}: 至少需要一波敌人`);
    for (const [waveIndex, wave] of (level.waves || []).entries()) {
      if (!Array.isArray(wave.enemies) || !wave.enemies.length) errors.push(`${label}: 空敌人波次`);
      for (const enemy of wave.enemies || []) {
        if (!ENEMY_TYPES.has(enemy.type)) errors.push(`${label}: 未知敌人 ${enemy.type}`);
        if (!inside(enemy.x, enemy.y)) errors.push(`${label}: 敌人越界`);
        if (waveIndex === 0 && level.spawn && Math.abs(enemy.x - level.spawn.x) < 350)
          errors.push(`${label}: 敌人距离起点过近`);
      }
    }
    if (
      !level.reward ||
      !Number.isFinite(level.reward.heal) ||
      level.reward.heal < 0 ||
      typeof level.reward.upgrade !== 'boolean'
    )
      errors.push(`${label}: 无效奖励`);
    if (!Array.isArray(level.unlocks)) errors.push(`${label}: 缺少解锁关系`);
  }
  const byId = new Map(levels.filter(Boolean).map((level) => [level.id, level]));
  for (const level of levels.filter(Boolean)) {
    for (const id of level.unlocks || [])
      if (!byId.has(id)) errors.push(`${level.id}: 解锁引用不存在 ${id}`);
  }
  const visited = new Set(),
    visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) {
      errors.push(`${id}: 解锁关系形成循环`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of byId.get(id)?.unlocks || []) if (byId.has(next)) visit(next);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of byId.keys()) visit(id);
  return errors;
}
