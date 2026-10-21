// Game-owned content: rows arrive from top to bottom; zero means empty space.
export const SCHEMA_VERSION = 1;
export const UPGRADES = Object.freeze([
  {
    id: 'extra',
    max: 5,
    title: '分裂弹群',
    description: '每轮多发射 2 颗，最多 22 颗',
    glyph: '◉',
    color: '#73f5db',
  },
  {
    id: 'power',
    max: 3,
    title: '重击核心',
    description: '每颗伤害 +1，三阶在 5 / 20 / 40 轮开放',
    glyph: '◆',
    color: '#ffb96e',
  },
  {
    id: 'pierce',
    max: 2,
    title: '相位穿透',
    description: '每颗额外穿过 1 颗球珠，最多 2 颗',
    glyph: '↗',
    color: '#9ba6ff',
  },
  {
    id: 'blast',
    max: 3,
    title: '爆裂余波',
    description: '命中有 10% 概率伤害周围，最多 30%',
    glyph: '✦',
    color: '#ff8caa',
  },
  {
    id: 'chain',
    max: 3,
    title: '闪电连锁',
    description: '命中有 12% 概率连锁一颗，最多 36%',
    glyph: 'ϟ',
    color: '#83d7ff',
  },
  {
    id: 'critical',
    max: 3,
    title: '幸运暴击',
    description: '暴击率增加 10%，造成双倍伤害',
    glyph: '✧',
    color: '#d2a3ff',
  },
]);

// Each row is seven cells: number = glass, bN = burst crystal, aN = absorber, + = next-volley marble.
const level = (id, title, subtitle, unlock, balls, waves, color, initialRows = 3) => ({
  schemaVersion: SCHEMA_VERSION,
  id,
  title,
  subtitle,
  unlock,
  balls,
  waves,
  color,
  initialRows,
  upgradeEvery: 5,
});
export const LEVELS = Object.freeze([
  level(
    'stardust',
    '星尘航道',
    '中央留白，借侧墙接住两翼',
    null,
    5,
    [
      [4, 0, 5, 0, 5, 0, 4],
      [0, 7, 0, '+', 0, 7, 0],
      [5, 0, 0, 0, 0, 0, 5],
      [0, 6, 0, 'b4', 0, 6, 0],
      [4, 0, 7, 0, 7, 0, 4],
    ],
    '#73f5db',
    2,
  ),
  level(
    'prism',
    '紫微残带',
    '绕开暗核，从侧面打开缺口',
    'stardust',
    6,
    [
      [5, 0, 6, 'a4', 6, 0, 5],
      [0, 8, 0, 0, 0, 8, 0],
      ['b4', 0, 7, '+', 7, 0, 'b4'],
      [0, 6, 'a4', 0, 'a4', 6, 0],
      [7, 0, 0, 9, 0, 0, 7],
      [0, 8, 0, 'b5', 0, 8, 0],
    ],
    '#b79aff',
    3,
  ),
  level(
    'flare',
    '熔核星渊',
    '先引爆侧翼，拆掉吸收屏障',
    'prism',
    7,
    [
      [0, 7, 'a6', 0, 'a6', 7, 0],
      [8, 'b5', 0, 10, 0, 'b5', 8],
      [0, 10, 0, '+', 0, 10, 0],
      [7, 0, 'a5', 'b5', 'a5', 0, 7],
      [0, 9, 'b5', 0, 'b5', 9, 0],
      [10, 0, 0, 12, 0, 0, 10],
      [0, 11, 0, 'b6', 0, 11, 0],
    ],
    '#ffb96e',
    3,
  ),
  level(
    'frost',
    '霜陨星域',
    '斜穿交错缺口，留下回弹空间',
    'flare',
    8,
    [
      [8, 'a6', 0, 9, 0, 'a6', 8],
      [0, 11, 0, 0, 11, 0, 0],
      [10, 0, 12, '+', 0, 0, 10],
      [0, 0, 'a7', 0, 'a7', 0, 0],
      [11, 'b5', 0, 13, 0, 'b5', 11],
      [0, 12, 0, 0, 12, 0, 0],
      [10, 0, 'a6', 0, 'a6', 0, 10],
      [0, 13, 'b6', 0, 'b6', 13, 0],
    ],
    '#83d7ff',
    4,
  ),
  level(
    'void',
    '虚空回廊',
    '中路暗核吸收，沿边墙进入腹地',
    'frost',
    8,
    [
      [0, 9, 0, 'a8', 0, 9, 0],
      [11, 0, 12, 0, 12, 0, 11],
      [0, 'a6', 0, '+', 0, 'a6', 0],
      ['b6', 10, 0, 14, 0, 10, 'b6'],
      [0, 0, 'a7', 0, 'a7', 0, 0],
      [12, 'b6', 0, 0, 0, 'b6', 12],
      [0, 13, 0, 'a8', 0, 13, 0],
      [12, 0, 14, '+', 14, 0, 12],
      [0, 14, 0, 'b7', 0, 14, 0],
    ],
    '#f194d7',
    4,
  ),
  level(
    'orbit',
    '终焉轨道',
    '先拆守门暗核，再连通两侧晶阵',
    'void',
    9,
    [
      [9, 0, 'a8', 0, 'a8', 0, 9],
      [0, 13, 0, 14, 0, 13, 0],
      [12, 'b6', 0, 'a6', 0, 'b6', 12],
      [0, 0, 14, '+', 14, 0, 0],
      [12, 0, 'a8', 0, 'a8', 0, 12],
      [0, 14, 'b7', 0, 'b7', 14, 0],
      [13, 'a7', 0, 15, 0, 'a7', 13],
      [0, 14, 0, '+', 0, 14, 0],
      [14, 0, 'b8', 16, 'b8', 0, 14],
      [0, 16, 0, 'a9', 0, 16, 0],
    ],
    '#e2ca8f',
    4,
  ),
  level(
    'lattice',
    '折光迷阵',
    '专家 · 交替借墙，避开双层吸收带',
    'orbit',
    9,
    [
      [0, 'a8', 0, 12, 0, 'a8', 0],
      [14, 0, 15, 0, 15, 0, 14],
      [0, 12, 'a7', '+', 'a7', 12, 0],
      ['b7', 0, 0, 16, 0, 0, 'b7'],
      [0, 'a9', 0, 0, 0, 'a9', 0],
      [15, 0, 'b7', 17, 'b7', 0, 15],
      [0, 15, 0, 'a9', 0, 15, 0],
      [16, 0, 17, '+', 17, 0, 16],
      [0, 'a8', 0, 18, 0, 'a8', 0],
      [16, 'b8', 0, 0, 0, 'b8', 16],
    ],
    '#8fdced',
    4,
  ),
  level(
    'eclipse',
    '黑曜终环',
    '专家 · 保留弹群，用爆裂反制暗核',
    'lattice',
    9,
    [
      [12, 0, 'a9', 0, 'a9', 0, 12],
      [0, 15, 0, 18, 0, 15, 0],
      [14, 'a8', 'b7', 0, 'b7', 'a8', 14],
      [0, 0, 16, '+', 16, 0, 0],
      ['a8', 16, 0, 0, 0, 16, 'a8'],
      [16, 0, 'b8', 'a10', 'b8', 0, 16],
      [0, 18, 0, 0, 0, 18, 0],
      [17, 'a9', 0, '+', 0, 'a9', 17],
      [0, 17, 'b9', 19, 'b9', 17, 0],
      [18, 0, 'a10', 0, 'a10', 0, 18],
      [0, 19, 0, 'b10', 0, 19, 0],
    ],
    '#b399e9',
    5,
  ),
]);
export const ENDLESS = Object.freeze({
  schemaVersion: 1,
  id: 'endless',
  title: '无尽挑战',
  subtitle: '每五轮强化，谨慎保留弹群',
  unlock: null,
  balls: 5,
  initialRows: 3,
  upgradeEvery: 5,
  waves: [],
  color: '#b79aff',
  endless: true,
});
export const levelById = (id) =>
  id === ENDLESS.id ? ENDLESS : LEVELS.find((item) => item.id === id);

export function validateLevels(levels = LEVELS) {
  const errors = [],
    seen = new Set();
  for (const item of levels) {
    if (!item.id || seen.has(item.id)) errors.push('关卡 ID 缺失或重复');
    if (item.schemaVersion !== SCHEMA_VERSION) errors.push(`${item.id}: schema 不支持`);
    if (item.unlock && !seen.has(item.unlock)) errors.push(`${item.id}: 解锁前置不可达`);
    seen.add(item.id);
    if (!Number.isInteger(item.balls) || item.balls < 1 || item.balls > 22)
      errors.push(`${item.id}: 球数无效`);
    if (!Number.isInteger(item.initialRows) || item.initialRows < 1 || item.initialRows > 6)
      errors.push(`${item.id}: 初始行数无效`);
    if (!Number.isInteger(item.upgradeEvery) || item.upgradeEvery < 1)
      errors.push(`${item.id}: 强化周期无效`);
    if (!Array.isArray(item.waves) || (!item.endless && item.waves.length < item.initialRows))
      errors.push(`${item.id}: 波次不足`);
    for (const row of item.waves ?? []) {
      if (
        !Array.isArray(row) ||
        row.length !== 7 ||
        row.some(
          (cell) =>
            !(
              cell === '+' ||
              (Number.isInteger(cell) && cell >= 0 && cell <= 999) ||
              /^[ab][1-9]\d{0,2}$/.test(cell)
            ),
        )
      )
        errors.push(`${item.id}: 行配置无效`);
    }
  }
  return errors;
}
