import { METAL_LEVELS } from './metal-levels.ts';
export { METAL_LEVELS } from './metal-levels.ts';
export const METAL_CHAPTERS = [
  {
    id: 1,
    name: '普通圆环',
    artifact: '金属解环',
    description: '从一对圆环理解穿扣与小缺口。',
    color: '#82c9c3',
  },
  {
    id: 2,
    name: '异形机关',
    artifact: '复合机关',
    description: '长环、U形与焊杆带来真实结构变化。',
    color: '#d9b77d',
  },
] as const;
import { circleIntersections, solveLevel, type Level, type Ring } from './rules.ts';
import { CLASSIC_LEVELS } from './classic.ts';

export { CLASSIC_LEVELS } from './classic.ts';
export type Campaign = 'nova' | 'classic' | 'expert' | 'metal';
export const CHAPTERS = [
  {
    id: 1,
    name: '唤醒星核',
    artifact: '晨光罗盘',
    description: '找到出口，留下不必拆开的环。',
    color: '#5edaca',
  },
  {
    id: 2,
    name: '钥光接力',
    artifact: '月相仪',
    description: '循着星纹，解开指定的钥环。',
    color: '#e5b86e',
  },
  {
    id: 3,
    name: '折光回廊',
    artifact: '折光镜',
    description: '让宽口越过转角，找到更短的路。',
    color: '#d99a8e',
  },
  {
    id: 4,
    name: '重燃天穹',
    artifact: '天穹星仪',
    description: '组合钥环与回窗，唤醒整座工坊。',
    color: '#ae9cdb',
  },
  {
    id: 5,
    name: '机关挑战',
    artifact: '群星机关',
    description: '交错星环、双星核与钥光迷宫。',
    color: '#8fbddf',
  },
] as const;

type Cell = readonly [number, number];
type Blueprint = {
  name: string;
  cells: Cell[];
  goal: number | number[];
  intro?: string;
  requires?: Record<number, number[]>;
  gaps?: Record<number, number>;
  radii?: Record<number, number>;
};

/** Individually authored maps, in teaching order. No random, mirrored or generated levels. */
const BLUEPRINTS: Blueprint[] = [
  {
    name: '第一束星光',
    cells: [
      [0, 0],
      [1, 0],
    ],
    goal: 0,
    intro: '沿着环拖动，让缺口对准连接；松手释放带星核的环。',
  },
  {
    name: '中间的礼物',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    goal: 1,
    intro: '先解开一侧，再释放中间的星核。另一侧可以留下。',
  },
  {
    name: '转角微光',
    cells: [
      [0, 1],
      [0, 0],
      [1, 0],
    ],
    goal: 1,
  },
  {
    name: '近路',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ],
    goal: 1,
    intro: '不是所有环都要拆。寻找通向星核的短路。',
  },
  {
    name: '三岔灯',
    cells: [
      [1, 1],
      [0, 1],
      [2, 1],
      [1, 2],
    ],
    goal: 0,
  },
  {
    name: '晨光罗盘',
    cells: [
      [1, 1],
      [0, 1],
      [2, 1],
      [3, 1],
      [1, 0],
      [1, -1],
    ],
    goal: 0,
    intro: '释放星核，点亮第一件星仪。',
  },
  {
    name: '第一枚钥环',
    cells: [
      [1, 0],
      [0, 0],
      [2, 0],
    ],
    goal: 0,
    requires: { 0: [1] },
    intro: '锁上的星纹对应钥环。先解开相同星纹的环。',
  },
  {
    name: '远处的钥光',
    cells: [
      [1, 0],
      [0, 0],
      [2, 0],
      [3, 0],
    ],
    goal: 0,
    requires: { 0: [3] },
  },
  {
    name: '双星门',
    cells: [
      [1, 1],
      [0, 1],
      [2, 1],
      [1, 2],
      [1, 3],
    ],
    goal: 0,
    requires: { 0: [1, 4] },
    intro: '两道星纹都亮起，锁扣才会开启。',
  },
  {
    name: '钥匙接力',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 2],
    ],
    goal: 1,
    requires: { 1: [2], 2: [4] },
  },
  {
    name: '绕过长枝',
    cells: [
      [1, 1],
      [0, 1],
      [2, 1],
      [3, 1],
      [1, 0],
      [1, -1],
    ],
    goal: 0,
    requires: { 0: [1] },
  },
  {
    name: '月相仪',
    cells: [
      [1, 1],
      [0, 1],
      [2, 1],
      [3, 1],
      [1, 0],
      [1, -1],
      [0, -1],
    ],
    goal: 0,
    requires: { 0: [3, 6], 4: [6] },
  },
  {
    name: '宽口之窗',
    cells: [
      [0, 1],
      [0, 0],
      [1, 0],
    ],
    goal: 1,
    gaps: { 1: 218 },
    intro: '宽口能同时让开转角两边；不必先拆外围。',
  },
  {
    name: '折光方窗',
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    goal: 2,
    gaps: { 0: 218 },
    intro: '闭环也有出口。先找到开口最宽的那一环。',
  },
  {
    name: '两扇窗',
    cells: [
      [0, 1],
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
    ],
    goal: 2,
    gaps: { 1: 218, 3: 218 },
  },
  {
    name: '大小之间',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 2],
    ],
    goal: 1,
    radii: { 0: 60, 1: 68, 2: 60, 3: 68 },
    intro: '大小环都看两个接点；接近出口会轻轻吸附。',
  },
  {
    name: '窗后的钥匙',
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [2, 1],
    ],
    goal: 2,
    gaps: { 0: 218 },
    requires: { 2: [0] },
  },
  {
    name: '折光镜',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [0, 1],
      [1, 2],
    ],
    goal: 4,
    gaps: { 0: 218, 2: 218 },
    requires: { 4: [0] },
  },
  {
    name: '点亮天阶',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 2],
      [1, 2],
    ],
    goal: 1,
    requires: { 1: [3], 3: [5] },
  },
  {
    name: '星窗接力',
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [2, 1],
      [3, 1],
    ],
    goal: 2,
    gaps: { 0: 218 },
    requires: { 2: [0, 5] },
  },
  {
    name: '双枝归航',
    cells: [
      [1, 1],
      [0, 1],
      [2, 1],
      [3, 1],
      [1, 0],
      [1, -1],
      [2, -1],
    ],
    goal: 0,
    requires: { 0: [3] },
    gaps: { 5: 218 },
  },
  {
    name: '月影回廊',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [0, 1],
      [0, 2],
      [0, 3],
    ],
    goal: 4,
    gaps: { 0: 218, 2: 218 },
    requires: { 4: [7] },
  },
  {
    name: '最后一道星纹',
    cells: [
      [1, 1],
      [0, 1],
      [2, 1],
      [3, 1],
      [1, 0],
      [1, -1],
      [2, -1],
      [2, -2],
    ],
    goal: 0,
    requires: { 0: [1, 6], 6: [7] },
    gaps: { 5: 218 },
    radii: { 1: 60, 3: 68 },
  },
  {
    name: '天穹重燃',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [0, 1],
      [1, 2],
      [1, 3],
    ],
    goal: 4,
    gaps: { 0: 218, 2: 218 },
    requires: { 4: [0, 2, 7] },
    intro: '让三道钥光归位，重燃天穹星仪。',
  },
];

const EXPERT_BLUEPRINTS: Blueprint[] = [
  {
    name: '九环星阵',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ],
    goal: 4,
    gaps: { 0: 218, 2: 218, 6: 218, 8: 218 },
    requires: { 4: [0, 8] },
    intro: '从宽口打开闭环，找到通向中央星核的短路。',
  },
  {
    name: '双星回廊',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
      [1, 3],
    ],
    goal: [4, 7],
    gaps: { 0: 218, 2: 218, 6: 218, 8: 218 },
    requires: { 4: [0], 7: [9] },
    intro: '两枚星核都要释放；先看哪条钥光可以共用。',
  },
  {
    name: '对角钥光',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
      [3, 1],
    ],
    goal: [1, 7],
    gaps: { 0: 218, 2: 218, 6: 218, 8: 218 },
    requires: { 1: [8], 7: [0], 5: [9] },
  },
  {
    name: '三重星栓',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ],
    goal: [5, 6],
    gaps: { 0: 218, 2: 218, 3: 218, 8: 218, 10: 218 },
    requires: { 5: [1, 8], 1: [3], 6: [10] },
    intro: '钥环也有前置星栓，沿着星纹逐层拆解。',
  },
  {
    name: '双窗迷宫',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
      [0, 2],
      [1, 2],
      [2, 2],
      [3, 2],
    ],
    goal: [5, 6],
    gaps: { 0: 218, 1: 218, 3: 218, 8: 218, 10: 218, 11: 218 },
    requires: { 5: [0, 11], 6: [3, 8] },
  },
  {
    name: '群星锁阵',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
      [0, 2],
      [1, 2],
      [2, 2],
      [3, 2],
    ],
    goal: [5, 6],
    gaps: { 0: 218, 1: 218, 3: 218, 8: 218, 10: 218, 11: 218 },
    radii: { 0: 60, 2: 68, 5: 68, 7: 60, 8: 68, 10: 60 },
    requires: { 5: [1, 11], 1: [3], 6: [9, 0], 9: [8] },
    intro: '让两路钥光汇合；留下无关支路，争取最短解。',
  },
];

const COLORS = ['#54c8ba', '#e4b773', '#db8e83', '#8aa8cd', '#b7a0d7', '#a8c995'];
function buildLevel(blueprint: Blueprint, index: number, campaign: 'nova' | 'expert'): Level {
  const ringId = (n: number) => `ring-${n + 1}`;
  const xs = blueprint.cells.map((cell) => cell[0]),
    ys = blueprint.cells.map((cell) => cell[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const rings: Ring[] = blueprint.cells.map(([x, y], n) => ({
    id: ringId(n),
    x: 320 + (x - cx) * 100,
    y: 320 + (y - cy) * 100,
    r: blueprint.radii?.[n] ?? 64,
    gap: ((blueprint.gaps?.[n] ?? 140) * Math.PI) / 180,
    angle: Math.PI * (0.35 + n * 0.41),
    color: COLORS[n % COLORS.length]!,
    ...(blueprint.requires?.[n] ? { requires: blueprint.requires[n]!.map(ringId) } : {}),
  }));
  // Faces away from its contacts so the starting pose visibly interlocks.
  for (const ring of rings) {
    const neighbors = rings.filter((other) => other !== ring && circleIntersections(ring, other));
    if (neighbors.length === 1)
      ring.angle = Math.atan2(ring.y - neighbors[0]!.y, ring.x - neighbors[0]!.x);
  }
  const level: Level = {
    id: `${campaign}-${String(index + 1).padStart(2, '0')}`,
    name: blueprint.name,
    chapter: (campaign === 'expert' ? 5 : Math.floor(index / 6) + 1) as Level['chapter'],
    campaign,
    revision: 1,
    goalRingIds: (Array.isArray(blueprint.goal) ? blueprint.goal : [blueprint.goal]).map(ringId),
    rings,
    intro: blueprint.intro,
  };
  const solution = solveLevel(level);
  if (!solution) throw new Error(`Unsolvable authored star chart: ${level.id}`);
  level.parMoves = solution.length;
  return level;
}

export const NOVA_LEVELS: Level[] = BLUEPRINTS.map((blueprint, index) =>
  buildLevel(blueprint, index, 'nova'),
);
export const EXPERT_LEVELS: Level[] = EXPERT_BLUEPRINTS.map((blueprint, index) =>
  buildLevel(blueprint, index, 'expert'),
);
export const CATALOG: Level[] = [
  ...METAL_LEVELS,
  ...NOVA_LEVELS,
  ...CLASSIC_LEVELS,
  ...EXPERT_LEVELS,
];
export function getCampaignLevels(campaign: Campaign = 'nova'): Level[] {
  if (campaign === 'metal') return METAL_LEVELS;
  return campaign === 'classic'
    ? CLASSIC_LEVELS
    : campaign === 'expert'
      ? EXPERT_LEVELS
      : NOVA_LEVELS;
}
