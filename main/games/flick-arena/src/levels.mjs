import { physics, outsideArena } from './core.mjs';
import { routeChapters, routeLevels } from './routes.mjs';

const foundationChapters = [
  { id: 'rookie', name: '初出茅庐', subtitle: '控力 · 侧击 · 保位' },
  { id: 'rivals', name: '三足鼎立', subtitle: '择敌 · 借力 · 破围' },
  { id: 'terrain', name: '借力破阵', subtitle: '石柱 · 冰面 · 反弹' },
  { id: 'summit', name: '巅峰擂台', subtitle: '缺口 · 收圈 · 决胜' },
];
export const chapters = Object.freeze([
  ...foundationChapters,
  ...routeChapters(foundationChapters),
]);
const shots = (target) => ({ id: 'swift', type: 'shots', target, label: `${target} 手内获胜` });
const hit = (target = 2) => ({
  id: 'contact',
  type: 'hits',
  target,
  label: `完成 ${target} 次有效碰撞`,
});
const center = () => ({ id: 'steady', type: 'center', target: 75, label: '在中央区域站稳获胜' });
const pillar = () => ({ id: 'bank', type: 'pillar', target: 1, label: '完成一次石柱反弹' });
const combo = () => ({ id: 'double', type: 'combo', target: 2, label: '一弹击落两名对手' });
const bot = (style, skill) => ({ style, skill });
const duel = (skill, style = 'balanced') => [null, bot(style, skill)];
const trio = (skill, style = 'balanced') => [
  null,
  bot(style, skill),
  bot('striker', Math.max(0, skill - 0.07)),
];
const make = (index, id, name, hint, points, extra = {}) => ({
  id,
  index,
  chapter: chapters[Math.floor((index - 1) / 5)].id,
  name,
  hint,
  points,
  requires: index === 1 ? null : undefined,
  bots: duel(Math.min(0.95, 0.12 + index * 0.04)),
  rules: { safeRounds: 5, shrinkPerRound: 18, minRadius: 18 },
  obstacles: [],
  ice: [],
  gaps: [],
  challenges: [shots(8), hit()],
  ...extra,
});
export const levels = [
  make(
    1,
    'rookie-approach',
    '第一步',
    '先靠近，再把对手逼向边缘',
    [
      [0, 80],
      [0, -70],
    ],
    { challenges: [shots(7), hit(1)] },
  ),
  make(
    2,
    'rookie-angle',
    '侧身一弹',
    '从内侧撞击，让对手向外滑',
    [
      [-60, 76],
      [62, -35],
    ],
    { challenges: [shots(7), center()] },
  ),
  make(
    3,
    'rookie-brake',
    '留有余力',
    '轻弹推位，满力要留退路',
    [
      [0, 105],
      [45, -20],
    ],
    { challenges: [shots(7), hit(2)] },
  ),
  make(
    4,
    'rookie-edge',
    '临边脱险',
    '先离开危险边缘，再找机会',
    [
      [-109, 30],
      [24, -55],
    ],
    { bots: duel(0.3, 'striker'), challenges: [shots(8), center()] },
  ),
  make(
    5,
    'rookie-master',
    '守关·猛攻',
    '对手擅长逼近，侧移后反击',
    [
      [-28, 94],
      [34, -87],
    ],
    { boss: true, bots: duel(0.45, 'striker'), challenges: [shots(8), hit(3)] },
  ),
  make(
    6,
    'rivals-triangle',
    '三足鼎立',
    '两名对手也会互相攻击',
    [
      [0, 96],
      [87, -46],
      [-82, -53],
    ],
    { bots: trio(0.35), challenges: [shots(9), hit(3)] },
  ),
  make(
    7,
    'rivals-chain',
    '借刀制敌',
    '从两名对手之间寻找连锁角度',
    [
      [0, 35],
      [-18, -106],
      [18, -106],
    ],
    { bots: trio(0.38), challenges: [shots(8), combo()] },
  ),
  make(
    8,
    'rivals-escape',
    '左右破围',
    '抢到内侧，别让两面同时受敌',
    [
      [0, 82],
      [-83, 4],
      [79, -35],
    ],
    { bots: trio(0.43, 'guard'), challenges: [shots(9), center()] },
  ),
  make(
    9,
    'rivals-choice',
    '先打谁',
    '观察边缘距离，选最有价值的一击',
    [
      [-36, 91],
      [99, -8],
      [-65, -79],
    ],
    { bots: trio(0.48), challenges: [shots(8), hit(4)] },
  ),
  make(
    10,
    'rivals-master',
    '守关·侧击',
    '守住中央，提防对手绕到侧面',
    [
      [22, 92],
      [76, -66],
      [-99, -15],
    ],
    { boss: true, bots: trio(0.58, 'guard'), challenges: [shots(9), center()] },
  ),
  make(
    11,
    'terrain-pillar',
    '一柱翻盘',
    '石柱会反弹，绕位也能进攻',
    [
      [-65, 74],
      [67, -69],
    ],
    {
      obstacles: [{ x: 0, y: -20, radius: 23 }],
      bots: duel(0.52, 'trickster'),
      challenges: [shots(9), pillar()],
    },
  ),
  make(
    12,
    'terrain-bank',
    '绕柱出击',
    '石柱保护退路，也会改变落点',
    [
      [0, 95],
      [-79, -49],
      [88, -40],
    ],
    {
      obstacles: [{ x: 17, y: 10, radius: 19 }],
      bots: trio(0.57, 'trickster'),
      challenges: [shots(10), pillar()],
    },
  ),
  make(
    13,
    'terrain-ice',
    '冰上留步',
    '冰面滑得更远，轻弹试探距离',
    [
      [-47, 84],
      [57, -73],
    ],
    {
      ice: [{ x: 0, y: 0, radius: 71, friction: 0.38 }],
      bots: duel(0.61),
      challenges: [shots(8), center()],
    },
  ),
  make(
    14,
    'terrain-mixed',
    '冰柱之间',
    '预判冰面加程，借石柱停稳',
    [
      [-16, 98],
      [91, -32],
      [-74, -64],
    ],
    {
      obstacles: [{ x: -32, y: -2, radius: 20 }],
      ice: [{ x: 52, y: 21, radius: 47, friction: 0.38 }],
      bots: trio(0.65),
      challenges: [shots(10), pillar()],
    },
  ),
  make(
    15,
    'terrain-master',
    '守关·借力',
    '对手擅长反弹，把地形也算进落点',
    [
      [0, 110],
      [0, -107],
    ],
    {
      boss: true,
      obstacles: [
        { x: -48, y: 0, radius: 20 },
        { x: 48, y: 0, radius: 20 },
      ],
      ice: [{ x: 0, y: 0, radius: 38, friction: 0.38 }],
      bots: duel(0.77, 'trickster'),
      challenges: [shots(9), pillar()],
    },
  ),
  make(
    16,
    'summit-gap',
    '缺口争位',
    '暗色切边同样会出界，朝完整区域转移',
    [
      [-32, 90],
      [52, -70],
    ],
    {
      gaps: [{ angle: 0, depth: 57 }],
      bots: duel(0.73, 'guard'),
      rules: { safeRounds: 4, shrinkPerRound: 20, minRadius: 18 },
      challenges: [shots(8), center()],
    },
  ),
  make(
    17,
    'summit-ring',
    '绝境争心',
    '第三轮后收圈，提前抢安全位置',
    [
      [0, 96],
      [83, -53],
      [-88, -47],
    ],
    {
      bots: trio(0.75),
      rules: { safeRounds: 3, shrinkPerRound: 22, minRadius: 18 },
      challenges: [shots(7), hit(3)],
    },
  ),
  make(
    18,
    'summit-bridge',
    '险边借力',
    '石柱挡住直线，缺口限制退路',
    [
      [-21, 94],
      [69, -59],
      [-76, -62],
    ],
    {
      gaps: [{ angle: Math.PI, depth: 52 }],
      obstacles: [{ x: -17, y: 7, radius: 22 }],
      bots: trio(0.8, 'trickster'),
      rules: { safeRounds: 3, shrinkPerRound: 20, minRadius: 18 },
      challenges: [shots(8), pillar()],
    },
  ),
  make(
    19,
    'summit-ice-edge',
    '冰锋对决',
    '越过冰面容易过头，给自己留退路',
    [
      [0, 93],
      [91, -28],
      [-80, -46],
    ],
    {
      gaps: [{ angle: -Math.PI / 2, depth: 58 }],
      ice: [{ x: 0, y: -16, radius: 66, friction: 0.38 }],
      bots: trio(0.86, 'guard'),
      rules: { safeRounds: 3, shrinkPerRound: 22, minRadius: 18 },
      challenges: [shots(8), center()],
    },
  ),
  make(
    20,
    'summit-master',
    '守关·巅峰',
    '把角度、借力和收圈时机一起算好',
    [
      [0, 101],
      [81, -48],
      [-81, -48],
    ],
    {
      boss: true,
      gaps: [
        { angle: 0, depth: 40 },
        { angle: Math.PI, depth: 40 },
      ],
      obstacles: [{ x: 0, y: -20, radius: 20 }],
      ice: [{ x: 0, y: 54, radius: 34, friction: 0.38 }],
      bots: trio(0.96, 'trickster'),
      rules: { safeRounds: 3, shrinkPerRound: 22, minRadius: 18 },
      challenges: [shots(8), pillar()],
    },
  ),
];
levels.push(...routeLevels(levels.slice()));
for (let i = 1; i < levels.length; i++) levels[i].requires = levels[i - 1].id;

export function getLevel(idOrIndex) {
  return typeof idOrIndex === 'number'
    ? (levels[idOrIndex] ?? null)
    : (levels.find((level) => level.id === idOrIndex) ?? null);
}
export function validateLevels(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('关卡目录不能为空');
  const ids = new Set();
  for (const [i, level] of items.entries()) {
    if (
      typeof level.id !== 'string' ||
      !level.id ||
      ids.has(level.id) ||
      !level.name ||
      !level.hint ||
      !chapters.some((chapter) => chapter.id === level.chapter) ||
      level.index !== i + 1 ||
      (i === 0 ? level.requires !== null : level.requires !== items[i - 1].id)
    )
      throw new Error('关卡 ID、章节或解锁链无效');
    ids.add(level.id);
    if (!Array.isArray(level.points) || level.points.length < 2 || level.points.length > 4)
      throw new Error('出生点数量无效');
    const state = { radius: physics.radius, gaps: level.gaps };
    for (const [j, point] of level.points.entries()) {
      if (
        !Array.isArray(point) ||
        point.length !== 2 ||
        !point.every(Number.isFinite) ||
        outsideArena(state, ...point, -physics.puck)
      )
        throw new Error('出生点必须完整位于擂台内');
      for (const other of level.points.slice(0, j))
        if (Math.hypot(point[0] - other[0], point[1] - other[1]) < physics.puck * 2)
          throw new Error('出生圆盘不能重叠');
    }
    if (
      !level.rules ||
      !Number.isInteger(level.rules.safeRounds) ||
      level.rules.safeRounds < 1 ||
      !Number.isFinite(level.rules.shrinkPerRound) ||
      level.rules.shrinkPerRound <= 0 ||
      !Number.isFinite(level.rules.minRadius) ||
      level.rules.minRadius <= 0
    )
      throw new Error('关卡收圈规则无效');
    for (const key of ['obstacles', 'ice', 'gaps'])
      if (!Array.isArray(level[key])) throw new Error('地形目录无效');
    for (const terrain of [...level.obstacles, ...level.ice])
      if (
        ![terrain.x, terrain.y, terrain.radius].every(Number.isFinite) ||
        terrain.radius <= 0 ||
        Math.hypot(terrain.x, terrain.y) + terrain.radius > physics.radius
      )
        throw new Error('地形范围无效');
    for (const zone of level.ice)
      if (!Number.isFinite(zone.friction) || zone.friction < 0.2 || zone.friction > 1)
        throw new Error('冰面摩擦无效');
    for (const gap of level.gaps)
      if (
        ![gap.angle, gap.depth].every(Number.isFinite) ||
        gap.depth <= 0 ||
        gap.depth >= physics.radius
      )
        throw new Error('缺口无效');
    for (const [x, y] of level.points)
      for (const obstacle of level.obstacles)
        if (Math.hypot(x - obstacle.x, y - obstacle.y) < physics.puck + obstacle.radius)
          throw new Error('出生点不能位于石柱内');
    if (
      !Array.isArray(level.bots) ||
      level.bots.length !== level.points.length ||
      level.bots[0] !== null ||
      level.bots
        .slice(1)
        .some(
          (profile) =>
            !profile ||
            !['balanced', 'guard', 'striker', 'trickster'].includes(profile.style) ||
            !Number.isFinite(profile.skill) ||
            profile.skill < 0 ||
            profile.skill > 1,
        )
    )
      throw new Error('对手配置无效');
    if (
      !Array.isArray(level.challenges) ||
      level.challenges.length !== 2 ||
      new Set(level.challenges.map((goal) => goal.id)).size !== 2 ||
      level.challenges.some(
        (goal) =>
          !goal.id ||
          !goal.label ||
          !['shots', 'hits', 'center', 'pillar', 'combo'].includes(goal.type) ||
          !Number.isFinite(goal.target) ||
          goal.target <= 0,
      )
    )
      throw new Error('挑战目标无效');
  }
  return items;
}
export function evaluateChallenges(level, state) {
  const won = state.phase === 'over' && state.winner === 0;
  const goals = level.challenges.map((goal) => {
    let complete = false;
    if (won) {
      if (goal.type === 'shots') complete = state.playerShots <= goal.target;
      else if (goal.type === 'center')
        complete = Math.hypot(state.discs[0].x, state.discs[0].y) <= goal.target;
      else
        complete =
          (state.stats?.[goal.type === 'combo' ? 'combo' : goal.type]?.[0] ?? 0) >= goal.target;
    }
    return { id: goal.id, label: goal.label, complete };
  });
  return { won, stars: Number(won) + goals.filter((goal) => goal.complete).length, goals };
}
validateLevels(levels);
