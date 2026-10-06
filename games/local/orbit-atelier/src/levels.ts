import type { Level, Ring } from './core.ts';

export const BOARD_WIDTH = 640;
export const BOARD_HEIGHT = 640;

export const CHAPTERS = [
  { id: 1, name: '初光', description: '转动缺口，让交织的星环自由离开。' },
  { id: 2, name: '星栓', description: '先释放其他星环，点亮星栓。' },
  { id: 3, name: '星图', description: '在大小不同的星环之间，寻找拆解顺序。' },
] as const;

type Cell = readonly [number, number];

interface Blueprint {
  name: string;
  cells: Cell[];
  locks?: Record<number, number>;
  intro?: string;
}

const PALETTE = ['#c99845', '#27766e', '#de7b63', '#4f858f', '#887b9c', '#a18a55'];

/** Original hand-authored lattice trees; cardinal neighbours interweave, diagonals do not. */
const BLUEPRINTS: Blueprint[] = [
  {
    name: '第一缕光',
    cells: [
      [0, 0],
      [1, 0],
    ],
    intro: '拖动金色星环，让缺口包住与蓝绿色星环的两个交点；松手解开。',
  },
  {
    name: '光的阶梯',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
  },
  {
    name: '拐角来信',
    cells: [
      [0, 1],
      [0, 0],
      [1, 0],
    ],
  },
  {
    name: '长长的午后',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ],
  },
  {
    name: '微风折线',
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ],
  },
  {
    name: '三叶星',
    cells: [
      [1, 1],
      [0, 1],
      [2, 1],
      [1, 2],
    ],
  },
  {
    name: '四方窗',
    cells: [
      [1, 1],
      [0, 1],
      [2, 1],
      [1, 0],
      [1, 2],
    ],
  },
  {
    name: '初光花束',
    cells: [
      [1, 1],
      [0, 1],
      [2, 1],
      [3, 1],
      [1, 0],
      [1, 2],
    ],
  },
  {
    name: '第一枚星栓',
    cells: [
      [1, 0],
      [0, 0],
      [2, 0],
    ],
    locks: { 0: 1 },
    intro: '带星栓的环暂时不能转动。每解开一个星环，星栓上的数字就少一。',
  },
  {
    name: '转角的约定',
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ],
    locks: { 1: 1 },
  },
  {
    name: '双星点灯',
    cells: [
      [1, 1],
      [0, 1],
      [2, 1],
      [1, 2],
      [1, 3],
    ],
    locks: { 0: 2 },
  },
  {
    name: '接力星火',
    cells: [
      [1, 0],
      [0, 0],
      [2, 0],
      [1, 1],
      [1, 2],
      [2, 2],
    ],
    locks: { 0: 2, 4: 3 },
  },
  {
    name: '深枝小灯',
    cells: [
      [1, 1],
      [0, 1],
      [2, 1],
      [3, 1],
      [1, 0],
      [1, 2],
      [1, 3],
    ],
    locks: { 0: 3, 5: 2 },
  },
  {
    name: '四盏归灯',
    cells: [
      [2, 1],
      [1, 1],
      [0, 1],
      [3, 1],
      [4, 1],
      [2, 0],
      [2, 2],
      [2, 3],
    ],
    locks: { 0: 4 },
  },
  {
    name: '枝上的回声',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [0, 1],
      [2, 1],
      [4, 1],
      [2, 2],
    ],
    locks: { 2: 4 },
  },
  {
    name: '星栓工坊',
    cells: [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
      [0, 0],
      [0, 2],
      [2, 0],
      [4, 0],
      [4, 2],
    ],
    locks: { 2: 5 },
  },
  {
    name: '大小星河',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 2],
      [3, 2],
    ],
    intro: '星环的大小和缺口各不相同，先观察交点，再决定顺序。',
  },
  {
    name: '偏心罗盘',
    cells: [
      [2, 1],
      [1, 1],
      [0, 1],
      [3, 1],
      [2, 0],
      [2, 2],
      [2, 3],
    ],
    locks: { 0: 2 },
  },
  {
    name: '曲折航线',
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
      [2, 2],
      [3, 2],
      [3, 3],
      [4, 3],
    ],
  },
  {
    name: '双树相望',
    cells: [
      [1, 1],
      [0, 1],
      [1, 0],
      [1, 2],
      [2, 2],
      [3, 2],
      [3, 1],
      [4, 2],
      [3, 3],
    ],
    locks: { 0: 2, 5: 3 },
  },
  {
    name: '星光梳',
    cells: [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
      [0, 0],
      [1, 2],
      [2, 0],
      [3, 2],
      [4, 0],
    ],
    locks: { 2: 4 },
  },
  {
    name: '远端灯塔',
    cells: [
      [2, 2],
      [1, 2],
      [0, 2],
      [3, 2],
      [4, 2],
      [2, 1],
      [2, 0],
      [2, 3],
      [2, 4],
      [0, 1],
      [4, 3],
    ],
    locks: { 0: 5 },
  },
  {
    name: '归航枝路',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 2],
      [3, 2],
      [4, 2],
      [4, 3],
      [4, 4],
      [3, 4],
      [1, 2],
      [1, 3],
    ],
    locks: { 4: 4, 6: 3 },
  },
  {
    name: '完整星图',
    cells: [
      [2, 2],
      [1, 2],
      [0, 2],
      [3, 2],
      [4, 2],
      [2, 1],
      [2, 0],
      [2, 3],
      [2, 4],
      [0, 1],
      [0, 0],
      [4, 3],
      [4, 4],
      [1, 4],
    ],
    locks: { 0: 7, 1: 2, 3: 3, 5: 1, 7: 4 },
  },
];

function makeLevel(blueprint: Blueprint, index: number): Level {
  const chapter = (Math.floor(index / 8) + 1) as 1 | 2 | 3;
  const xs = blueprint.cells.map(([x]) => x);
  const ys = blueprint.cells.map(([, y]) => y);
  const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const rings: Ring[] = blueprint.cells.map(([x, y], ringIndex) => {
    const ring: Ring = {
      id: `ring-${ringIndex + 1}`,
      x: BOARD_WIDTH / 2 + (x - midX) * 100,
      y: BOARD_HEIGHT / 2 + (y - midY) * 100,
      r: chapter === 3 ? [52, 56, 60][(ringIndex + index) % 3]! : 54,
      gap:
        ((chapter === 3 ? [82, 90, 102][(ringIndex * 2 + index) % 3]! : chapter === 2 ? 96 : 100) *
          Math.PI) /
        180,
      angle:
        index === 0
          ? ringIndex === 0
            ? -Math.PI / 2
            : Math.PI / 2
          : ringIndex * 1.731 + index * 0.87 + Math.PI / 4,
      color: PALETTE[ringIndex % PALETTE.length]!,
    };
    const unlockAfter = blueprint.locks?.[ringIndex];
    if (unlockAfter !== undefined) ring.unlockAfter = unlockAfter;
    return ring;
  });
  return {
    id: `orbit-${String(index + 1).padStart(2, '0')}`,
    name: blueprint.name,
    chapter,
    ...(blueprint.intro ? { intro: blueprint.intro } : {}),
    rings,
  };
}

export const LEVELS: Level[] = BLUEPRINTS.map(makeLevel);
