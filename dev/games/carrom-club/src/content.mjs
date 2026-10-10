export const SCHEMA_VERSION = 1;
export const LEVELS = [
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

export function validateLevels(levels = LEVELS) {
  const ids = new Set();
  for (const level of levels) {
    if (
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
    if (!Array.isArray(level.coins) || !level.coins.some(([kind]) => kind === 'white'))
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
