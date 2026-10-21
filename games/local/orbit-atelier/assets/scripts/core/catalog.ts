import { circleIntersections, solveLevel, type Level, type Ring } from './rules.ts';
import { CLASSIC_LEVELS } from './classic.ts';

export { CLASSIC_LEVELS } from './classic.ts';
export type Campaign = 'nova' | 'classic';
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
] as const;

type Cell = readonly [number, number];
type Blueprint = {
  name: string;
  cells: Cell[];
  goal: number;
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

const COLORS = ['#54c8ba', '#e4b773', '#db8e83', '#8aa8cd', '#b7a0d7', '#a8c995'];
export const NOVA_LEVELS: Level[] = BLUEPRINTS.map((blueprint, index) => {
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
    id: `nova-${String(index + 1).padStart(2, '0')}`,
    name: blueprint.name,
    chapter: (Math.floor(index / 6) + 1) as Level['chapter'],
    campaign: 'nova',
    revision: 1,
    goalRingIds: [ringId(blueprint.goal)],
    rings,
    intro: blueprint.intro,
  };
  const solution = solveLevel(level);
  if (!solution) throw new Error(`Unsolvable authored star chart: ${level.id}`);
  level.parMoves = solution.length;
  return level;
});

export const CATALOG: Level[] = [...NOVA_LEVELS, ...CLASSIC_LEVELS];
export function getCampaignLevels(campaign: Campaign = 'nova'): Level[] {
  return campaign === 'classic' ? CLASSIC_LEVELS : NOVA_LEVELS;
}
