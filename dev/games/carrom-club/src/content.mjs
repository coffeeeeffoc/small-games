export const SCHEMA_VERSION = 1;
const INTRO_LEVELS = [
  {
    id: 'first-touch',
    title: '轻轻一击',
    subtitle: '感受一杆的分量',
    shots: 5,
    par: 1,
    coins: [['white', 250, 280]],
    tip: '滑轨移到右侧，瞄向左上袋口，再往后拉。',
  },
  {
    id: 'diagonal',
    title: '斜线入袋',
    subtitle: '让角度替你说话',
    shots: 6,
    par: 2,
    coins: [
      ['white', 710, 300],
      ['white', 330, 390],
    ],
    tip: '瞄准棋子背向袋口的一侧。',
  },
  {
    id: 'two-wings',
    title: '左右开弓',
    subtitle: '换个位置，豁然开朗',
    shots: 7,
    par: 3,
    coins: [
      ['white', 270, 300],
      ['white', 750, 330],
      ['white', 550, 480],
    ],
    tip: '每杆结束后，都可以重新摆位。',
  },
  {
    id: 'cushion',
    title: '借库一弹',
    subtitle: '沿着木边寻找机会',
    shots: 9,
    par: 3,
    coins: [
      ['white', 310, 580],
      ['white', 760, 260],
    ],
    tip: '尝试擦边或借库；直击也能完成练习。',
  },
  {
    id: 'queen',
    title: '红后之约',
    subtitle: '进红后，再补一子',
    shots: 10,
    par: 3,
    queen: true,
    coins: [
      ['queen', 270, 280],
      ['white', 740, 300],
      ['white', 400, 450],
    ],
    tip: '红后入袋后，同杆或下一杆补进白子。',
  },
  {
    id: 'finish',
    title: '清台时刻',
    subtitle: '把每一杆串成一局',
    shots: 14,
    par: 5,
    queen: true,
    coins: [
      ['queen', 500, 400],
      ['white', 240, 260],
      ['white', 760, 290],
      ['white', 320, 460],
      ['white', 680, 520],
      ['white', 480, 610],
    ],
    tip: '红后尚未补进时，最后一枚白子会返场。',
  },
];

// The six published lessons stay byte-for-byte compatible with v1 saves. Later
// chapters compose the same physical rules with different targets and spacing.
export const CHAPTER_SIZE = 12;
const CHAPTER_PROFILES = [
  ['初识手感', 1, 2, false, 0, '瞄准背向袋口的一侧，轻拉也能落袋。'],
  ['斜线进阶', 2, 3, false, 0, '移到另一侧摆位，让击球线正对袋口。'],
  ['长台分量', 3, 3, false, 0, '长距离需要更足的力度，先观察首碰虚线。'],
  ['沿边寻路', 3, 4, false, 0, '靠边的白子也可以换袋口或借库处理。'],
  ['红后补进', 2, 3, true, 0, '先留下补进的白子，再规划红后的下一杆。'],
  ['让路取巧', 3, 4, false, 1, '黑子只作挡路子，不用清空；换摆位绕开它。'],
  ['散台连杆', 4, 5, true, 0, '红后和散落白子一起规划，逐杆调整摆位。'],
  ['密阵拆解', 5, 5, true, 1, '先清外侧白子，给中央红后留出路线。'],
  ['清台挑战', 5, 6, true, 2, '避开黑子，留一枚容易补进的白子。'],
  ['棋社终章', 6, 7, true, 2, '安排红后补进与收尾，让每一杆都有目标。'],
];
export const CHAPTERS = CHAPTER_PROFILES.map(([title], index) => ({
  id: `chapter-${index + 1}`,
  title,
  start: index * CHAPTER_SIZE,
  end: (index + 1) * CHAPTER_SIZE,
}));

// Widely spaced slots allow several valid opening lines. Chapter-dependent
// depth/edge adjustments and seeded offsets make every layout reproducible.
const SLOTS = [
  [260, 260],
  [740, 285],
  [345, 400],
  [655, 440],
  [260, 550],
  [735, 585],
  [465, 605],
];
function advancedLesson(number) {
  const chapter = Math.floor((number - 1) / CHAPTER_SIZE),
    lesson = (number - 1) % CHAPTER_SIZE,
    [, minCoins, maxCoins, queen, blockers, tip] = CHAPTER_PROFILES[chapter];
  let seed = number * 7919 + 1;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const count = minCoins + (lesson % (maxCoins - minCoins + 1));
  const coins = [];
  const mirror = number % 2 === 0;
  const offset = lesson % SLOTS.length;
  for (let i = 0; i < count; i++) {
    const [sx, sy] = SLOTS[(i + offset) % SLOTS.length];
    let x = sx + Math.round((random() - 0.5) * 34),
      y = sy + Math.round((random() - 0.5) * 30);
    if (chapter === 2) y = Math.max(195, y - 65);
    if (chapter === 3) x = x < 500 ? x - 65 : x + 65;
    coins.push(['white', mirror ? 1000 - x : x, y]);
  }
  if (queen) {
    const x = 195 + Math.round(random() * 15);
    coins.unshift(['queen', mirror ? 1000 - x : x, 195 + lesson * 8]);
  }
  for (let i = 0; i < blockers; i++)
    coins.push(['black', i ? 565 + lesson * 3 : 430 - lesson * 3, i ? 650 : 510]);
  return {
    id: `practice-${String(number).padStart(3, '0')}`,
    title: ['借位入袋', '分线轻击', '转角寻袋', '稳杆收尾'][lesson % 4],
    subtitle: `${CHAPTERS[chapter].title} · 第 ${lesson + 1} 练`,
    shots: count * 3 + (queen ? 5 : 3) + blockers,
    par: count + (queen ? 2 : 1),
    ...(queen ? { queen: true } : {}),
    coins,
    tip,
  };
}
export const LEVELS = [
  ...INTRO_LEVELS,
  ...Array.from({ length: 114 }, (_, index) => advancedLesson(index + 7)),
];

export function validateLevels(levels = LEVELS) {
  const ids = new Set();
  for (const level of levels) {
    if (
      typeof level.id !== 'string' ||
      !level.id ||
      ids.has(level.id) ||
      !level.title ||
      !Number.isInteger(level.shots) ||
      level.shots < 1 ||
      !Number.isInteger(level.par) ||
      level.par < 1 ||
      level.par > level.shots
    )
      throw new Error('Invalid carrom level');
    ids.add(level.id);
    if (
      !Array.isArray(level.coins) ||
      !level.coins.every((coin) => Array.isArray(coin) && coin.length === 3) ||
      !level.coins.some(([kind]) => kind === 'white')
    )
      throw new Error('Missing target coins');
    if (level.coins.filter(([kind]) => kind === 'queen').length !== (level.queen ? 1 : 0))
      throw new Error('Invalid queen count');
    level.coins.forEach(([kind, x, y], index) => {
      if (
        !['white', 'black', 'queen'].includes(kind) ||
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < 140 ||
        x > 860 ||
        y < 140 ||
        y > 740
      )
        throw new Error('Invalid coin');
      if (level.coins.slice(0, index).some(([, a, b]) => Math.hypot(a - x, b - y) < 36))
        throw new Error('Overlapping coins');
    });
  }
  return true;
}
