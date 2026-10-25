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

// Stable original IDs stay first; every sector combines traversal and contested capture.
const sectorNames = [
  '灰渣码头',
  '裂轨货站',
  '风蚀泵房',
  '冷却回廊',
  '铆钉高架',
  '焦土仓库',
  '烟囱阵列',
  '废钢矿场',
  '炉心栈桥',
  '断电车库',
  '灰雨管线',
  '重压工坊',
  '荒原中继',
  '黑烟港口',
  '熔渣深井',
  '风暴前哨',
  '铁幕内环',
  '余烬基地',
  '核心防线',
  '黎明撤离',
];
// Explicit routes, platform formations and reinforcement rosters define the 23 sectors.
const routes = [
  [[900, 2450, 4150, 5900, 7720, 9610], 'LLULUL', 'scd', 330],
  [[920, 2660, 4380, 6020, 7960, 9840], 'ULUULL', 'sdc', 336],
  [[940, 2520, 4470, 6280, 8100, 10040], 'LULULU', 'csd', 332],
  [[960, 2420, 3990, 5580, 7180, 8840, 10480], 'LLUULUL', 'ccd', 338],
  [[980, 3010, 5220, 7580, 10120], 'UULUL', 'ssd', 340],
  [[1000, 2720, 4510, 6200, 8070, 10240], 'ULULLU', 'dcs', 342],
  [[1020, 2550, 4090, 5670, 7280, 8960, 10520], 'LULUULL', 'dsc', 344],
  [[1040, 2810, 4620, 6490, 8380, 10360], 'UULLUL', 'ccs', 346],
  [[1060, 3180, 5390, 7800, 10540], 'ULULU', 'ddc', 348],
  [[1080, 2640, 4210, 5790, 7420, 9090, 10600], 'UUULULL', 'sdd', 350],
  [[1100, 2890, 4720, 6580, 8500, 10480], 'LLUUUL', 'css', 352],
  [[1120, 2770, 4600, 6410, 8460, 10620], 'ULLULU', 'dcd', 354],
  [[1140, 2680, 4300, 5930, 7560, 9200, 10700], 'ULUULUL', 'cdd', 356],
  [[1160, 3340, 5700, 8120, 10680], 'UULLU', 'sds', 358],
  [[1180, 2970, 4850, 6800, 8820, 10840], 'LUULUU', 'dss', 360],
  [[1200, 2790, 4400, 6060, 7700, 9380, 10880], 'UULULUU', 'cdc', 362],
  [[1220, 3100, 5050, 7010, 9020, 10920], 'UUULLU', 'dsc', 364],
  [[1240, 3480, 5890, 8360, 11020], 'ULUUU', 'sdc', 366],
  [[1260, 2860, 4520, 6200, 7910, 9620, 11120], 'LULLUUU', 'dds', 368],
  [[1280, 3190, 5190, 7240, 9300, 11160], 'ULLUUU', 'scs', 370],
  [[1300, 3000, 4710, 6450, 8170, 9900, 11300], 'UUUULUL', 'dcs', 372],
  [[1320, 3660, 6100, 8670, 11360], 'UUULU', 'csd', 374],
  [[1340, 3340, 5400, 7490, 9600, 11500], 'ULUUUL', 'dsc', 376],
];
for (const [i, name] of sectorNames.entries()) {
  LEVELS.push({
    ...structuredClone(LEVELS[i % 3]),
    id: `campaign-${String(i + 4).padStart(2, '0')}`,
    name,
  });
}
for (const [index, level] of LEVELS.entries()) {
  const [positions, formation, roster, budget] = routes[index];
  level.width = positions.at(-1) + 1300;
  level.exitX = level.width - 180;
  level.subtitle = `推进${positions.length}处阵地，掩护中继接通`;
  level.targetSeconds = [360, 540];
  level.platforms = [];
  level.barrels = [];
  level.waves = positions.map((x, checkpoint) => {
    const upper = formation[checkpoint] === 'U';
    const platformX = x + (upper ? -240 : 180);
    level.platforms.push({ x: platformX, y: 442, w: upper ? 320 : 280, h: 22 });
    if (upper) level.platforms.push({ x: x + 30, y: 328, w: 220, h: 22 });
    level.barrels.push({ x: x + 250, y: 570 }, { x: x + 380, y: 570 });
    const enemies = [
      { type: 'shooter', x: x + 40, y: 570 },
      { type: 'chaser', x: x + 520, y: 570 },
      { type: 'drone', x: x + 610, y: 365 },
      { type: upper ? 'drone' : 'shooter', x: platformX + 160, y: upper ? 320 : 442 },
    ];
    if (checkpoint === positions.length - 1 && (index === 2 || index === 22 || index % 5 === 4))
      enemies.push({ type: 'boss', x: x + 700, y: 570 });
    return {
      id: `${level.id}-relay-${checkpoint + 1}`,
      checkpointX: x,
      captureSeconds: budget / positions.length,
      radius: upper ? 380 : 360,
      contestRadius: index < 6 ? 95 : 105,
      reinforcementInterval: index < 8 ? 8.5 : index < 16 ? 8 : 7.5,
      reinforcements: roster.split('').map((letter, i) => ({
        type: { s: 'shooter', c: 'chaser', d: 'drone' }[letter],
        x: x + 590 + i * 95,
        y: letter === 'd' ? 360 : 570,
      })),
      enemies,
    };
  });
  level.reward = { heal: 30, upgrade: index < LEVELS.length - 1 };
  level.unlocks = index + 1 < LEVELS.length ? [LEVELS[index + 1].id] : [];
}

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
      if (
        !inside(wave.checkpointX, level.ground) ||
        ![wave.captureSeconds, wave.reinforcementInterval, wave.radius, wave.contestRadius].every(
          Number.isFinite,
        ) ||
        wave.captureSeconds < 1 ||
        wave.reinforcementInterval < 1 ||
        wave.radius < 120 ||
        wave.contestRadius < 0 ||
        wave.contestRadius >= wave.radius ||
        !Array.isArray(wave.reinforcements) ||
        !wave.reinforcements.length
      )
        errors.push(`${label}: 无效推进阵地`);
      if (!Array.isArray(wave.enemies) || !wave.enemies.length) errors.push(`${label}: 空敌人波次`);
      for (const enemy of [...(wave.enemies || []), ...(wave.reinforcements || [])]) {
        if (!ENEMY_TYPES.has(enemy.type)) errors.push(`${label}: 未知敌人 ${enemy.type}`);
        if (!inside(enemy.x, enemy.y)) errors.push(`${label}: 敌人越界`);
        if (
          waveIndex === 0 &&
          wave.enemies.includes(enemy) &&
          level.spawn &&
          Math.abs(enemy.x - level.spawn.x) < 350
        )
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
