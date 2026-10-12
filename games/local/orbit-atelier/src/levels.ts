import { angleDistance, circleIntersections, type Level, type Ring } from './core.ts';

export const BOARD_WIDTH = 640;
export const BOARD_HEIGHT = 640;

export const CHAPTERS = [
  { id: 1, name: '初光', description: '转动缺口，让交织的星环自由离开。' },
  { id: 2, name: '星栓', description: '先释放其他星环，点亮星栓。' },
  { id: 3, name: '星图', description: '在大小不同的星环之间，寻找拆解顺序。' },
  { id: 4, name: '穿针', description: '看清上下穿扣，沿着弯链寻找出口。' },
  { id: 5, name: '枝路', description: '宽口能绕过转角，窄口要先拆支路。' },
  { id: 6, name: '接力', description: '让支路接力点灯，逐层打开星栓。' },
  { id: 7, name: '微隙', description: '大小不同的环，留给缺口不同的余量。' },
  { id: 8, name: '织星', description: '将宽口、微隙与星栓织成完整星图。' },
] as const;

type Cell = readonly [number, number];

interface Blueprint {
  name: string;
  cells: Cell[];
  locks?: Record<number, number>;
  intro?: string;
  gaps?: Record<number, number>;
  radii?: Record<number, number>;
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

/** Each diagram is authored independently; # is a ring, dots are empty space. */
function cells(rows: string[]): Cell[] {
  return rows.flatMap((row, y) => [...row].flatMap((cell, x): Cell[] => cell === '#' ? [[x, y]] : []));
}

const EXPANSION: Blueprint[] = [
  // 25–34: exposed ends, bends and asymmetrical branches.
  { name: '回廊穿针', cells: cells(['###', '..#']) },
  { name: '曲尺星光', cells: cells(['##.', '.##', '..#']) },
  { name: '长短两端', cells: cells(['.#..', '####']) },
  { name: '垂帘一线', cells: cells(['##.', '.#.', '.##', '..#']) },
  { name: '侧枝春风', cells: cells(['#...', '####', '..#.']) },
  { name: '折返邮路', cells: cells(['###', '..#', '.##']) },
  { name: '三叉来信', cells: cells(['.#.', '###', '.#.', '.##']) },
  { name: '两端接近', cells: cells(['####', '#...', '##..']) },
  { name: '错落双枝', cells: cells(['#.#.', '####', '.#..']) },
  { name: '穿针花束', cells: cells(['.#..', '####', '#.#.']) },
  // 35–44: wide mouths open a corner; ordinary mouths must peel the branches.
  { name: '转角之门', cells: cells(['##', '##', '.#']), gaps: { 0: 216 }, intro: '宽缺口能同时让开转角两侧；不必总从末端开始。' },
  { name: '方窗钥匙', cells: cells(['.##', '.##', '##.']), gaps: { 1: 216 } },
  { name: '方窗长尾', cells: cells(['##..', '####', '...#']), gaps: { 0: 216 } },
  { name: '双向回廊', cells: cells(['###', '#.#', '###']), gaps: { 0: 216, 2: 216 } },
  { name: '枝间小窗', cells: cells(['###.', '.###', '..#.']), gaps: { 2: 216 } },
  { name: '长枝短枝', cells: cells(['.#..', '####', '#...', '##..']) },
  { name: '偏心回窗', cells: cells(['###', '#.#', '###', '.#.']), gaps: { 0: 216, 2: 216 } },
  { name: '梳齿小径', cells: cells(['#.#.', '####', '.#.#']) },
  { name: '两个出口', cells: cells(['###.', '#.##', '###.']), gaps: { 0: 216, 6: 216 } },
  { name: '枝路会合', cells: cells(['.##.', '####', '.#.#']), gaps: { 0: 216, 1: 216 } },
  // 45–54: reachable count locks on different branches and centres.
  { name: '一盏先行', cells: cells(['.##', '###', '.#.']), gaps: { 1: 216 }, locks: { 3: 2 }, intro: '先解开短枝，星栓亮起后再拆长枝。' },
  { name: '接力双灯', cells: cells(['##..', '.###', '.#.#']), locks: { 2: 2, 4: 3 } },
  { name: '转角点灯', cells: cells(['##..', '####', '...#']), gaps: { 0: 216 }, locks: { 3: 2 } },
  { name: '两翼等灯', cells: cells(['#..#', '####', '.#..', '.##.']), locks: { 3: 3, 4: 2 } },
  { name: '晚到钥匙', cells: cells(['###.', '#.##', '###.']), gaps: { 0: 216, 6: 216 }, locks: { 5: 2 } },
  { name: '三枝接力', cells: cells(['.#..', '####', '.#.#', '##..']), locks: { 2: 4, 5: 2 } },
  { name: '窗后双栓', cells: cells(['###', '#.#', '###', '#..']), gaps: { 2: 216, 5: 216 }, locks: { 0: 2, 7: 4 } },
  { name: '深巷灯火', cells: cells(['###.', '..#.', '####', '#..#']), locks: { 4: 3, 6: 5 } },
  { name: '轮流开门', cells: cells(['##..', '.###', '.#.#', '##..']), locks: { 2: 3, 5: 4 } },
  { name: '接力星塔', cells: cells(['.#..', '####', '.#.#', '####']), locks: { 2: 4, 5: 5 }, gaps: { 10: 216 } },
  // 55–64: tighter usable angular windows, mixed sizes, no timer.
  { name: '细缝初见', cells: cells(['###', '..#', '.##']), radii: { 0: 60, 1: 68, 2: 60, 3: 68, 4: 60, 5: 64 }, gaps: { 0: 124, 2: 124, 4: 124 }, intro: '圆环大小影响净空；两处都出现勾号再松手。' },
  { name: '大小回声', cells: cells(['.#.', '###', '#.#', '..#']), radii: { 0: 60, 1: 68, 2: 60, 3: 68, 4: 60 }, locks: { 2: 2 } },
  { name: '窄口花枝', cells: cells(['#.#.', '####', '.#..']), gaps: { 0: 124, 1: 124, 6: 124 } },
  { name: '偏心窗沿', cells: cells(['##..', '####', '...#']), gaps: { 0: 216, 6: 124 }, radii: { 0: 60, 1: 68, 6: 60 } },
  { name: '细光梳齿', cells: cells(['#.#.', '####', '.#.#']), gaps: { 0: 124, 1: 124, 6: 124, 7: 124 }, locks: { 3: 3 } },
  { name: '微隙长廊', cells: cells(['###.', '..#.', '.###', '.#..', '##..']), radii: { 0: 60, 2: 68, 4: 60, 6: 68, 8: 60 }, gaps: { 0: 110, 7: 124 }, locks: { 5: 3 } },
  { name: '环径密语', cells: cells(['.##.', '####', '#..#', '##..']), radii: { 0: 68, 1: 60, 2: 60, 3: 68, 4: 60, 5: 68 }, gaps: { 0: 216 }, locks: { 4: 3 } },
  { name: '双窗量隙', cells: cells(['####', '#..#', '####']), gaps: { 0: 216, 3: 216, 6: 216, 9: 216 }, radii: { 1: 60, 2: 68, 7: 68, 8: 60 } },
  { name: '层层留白', cells: cells(['###.', '#.#.', '#.##', '###.']), gaps: { 0: 216, 2: 216, 8: 216, 10: 216 }, locks: { 6: 4 } },
  { name: '微隙罗盘', cells: cells(['#.#.', '####', '.#.#', '##.#']), gaps: { 0: 124, 1: 124, 8: 112, 10: 124 }, locks: { 3: 4, 5: 3, 6: 5 } },
  // 65–74: combine branching, corner exits, radius and staged latches.
  { name: '织星起笔', cells: cells(['###.', '#.##', '###.']), gaps: { 0: 216, 6: 216 }, locks: { 4: 3, 7: 4 }, intro: '先找能让开两处的环，再规划星栓接力。' },
  { name: '窗外回枝', cells: cells(['##..', '####', '.#.#', '##..']), gaps: { 0: 216 }, locks: { 3: 3, 6: 5 } },
  { name: '交错归灯', cells: cells(['#.#.', '####', '.#.#', '.###']), gaps: { 7: 216, 10: 216 }, locks: { 3: 4, 5: 3 } },
  { name: '长夜方舟', cells: cells(['####', '#..#', '####', '.#..']), gaps: { 0: 216, 3: 216, 6: 216, 9: 216 }, locks: { 2: 3, 7: 5 } },
  { name: '双翼星桥', cells: cells(['##.##', '.###.', '.#.#.', '##.#.']), locks: { 4: 4, 6: 3, 7: 5 } },
  { name: '旋窗接力', cells: cells(['###.', '#.##', '####', '.#..']), gaps: { 0: 216, 2: 216, 9: 216 }, locks: { 6: 3, 7: 5, 4: 4 } },
  { name: '星河回针', cells: cells(['####', '#..#', '####', '#..#']), gaps: { 0: 216, 3: 216 }, locks: { 7: 5, 8: 4, 4: 3 } },
  { name: '织光双梳', cells: cells(['#.#.#', '#####', '.#.#.', '.#.#.']), locks: { 4: 4, 6: 5, 8: 3 }, gaps: { 0: 124, 2: 124, 10: 124, 11: 124 } },
  { name: '多重回廊', cells: cells(['###..', '#.###', '###..', '#.#..']), gaps: { 0: 216, 2: 216 }, locks: { 6: 3, 8: 5, 4: 4 } },
  { name: '满天织星', cells: cells(['####', '#..#', '####', '.##.']), gaps: { 0: 216, 3: 216, 10: 216, 11: 216 }, locks: { 1: 3, 4: 4, 7: 6, 8: 5 } },
];

function makeLevel(blueprint: Blueprint, index: number): Level {
  const chapter = (index < 24 ? Math.floor(index / 8) + 1 : Math.floor((index - 24) / 10) + 4) as Level['chapter'];
  const xs = blueprint.cells.map(([x]) => x);
  const ys = blueprint.cells.map(([, y]) => y);
  const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const rings: Ring[] = blueprint.cells.map(([x, y], ringIndex) => {
    const ring: Ring = {
      id: `ring-${ringIndex + 1}`,
      x: BOARD_WIDTH / 2 + (x - midX) * 100,
      y: BOARD_HEIGHT / 2 + (y - midY) * 100,
      r: blueprint.radii?.[ringIndex] ?? (chapter === 3 || chapter >= 7 ? [60, 64, 68][(ringIndex + index) % 3]! : 64),
      gap:
        ((blueprint.gaps?.[ringIndex] ?? (chapter >= 7 ? 124 : chapter === 3 ? 128 : chapter === 2 ? 126 : 128)) *
          Math.PI) /
        180,
      angle:
        index === 0
          ? ringIndex === 0
            ? Math.PI
            : 0
          : ringIndex * 1.731 + index * 0.87 + Math.PI / 4,
      color: PALETTE[ringIndex % PALETTE.length]!,
    };
    const unlockAfter = blueprint.locks?.[ringIndex];
    if (unlockAfter !== undefined) ring.unlockAfter = unlockAfter;
    return ring;
  });
  for (const ring of rings) {
    const neighbors = rings.filter(other => other !== ring && circleIntersections(ring, other));
    // Start end rings facing away from their contact, so the player sees both crossings.
    if (neighbors.length === 1) ring.angle = Math.atan2(ring.y - neighbors[0]!.y, ring.x - neighbors[0]!.x);
    else {
      const contacts = neighbors.flatMap(other => circleIntersections(ring, other)!).map(point => Math.atan2(point.y - ring.y, point.x - ring.x));
      const original = ring.angle;
      let best = -1;
      for (let step = 0; step < 72; step++) {
        const angle = step * Math.PI / 36;
        const solid = contacts.filter(contact => angleDistance(contact, angle) > ring.gap / 2 + 0.14).length;
        if (solid > best || (solid === best && angleDistance(angle, original) < angleDistance(ring.angle, original))) {
          best = solid;
          ring.angle = angle;
        }
      }
    }
  }
  return {
    id: `orbit-${String(index + 1).padStart(2, '0')}`,
    name: blueprint.name,
    chapter,
    ...(blueprint.intro ? { intro: blueprint.intro } : {}),
    rings,
  };
}

export const LEVELS: Level[] = [...BLUEPRINTS, ...EXPANSION].map(makeLevel);
