/** World geometry and encounters are chapter data, independent of simulation and drawing. */
export const CONTRACTS = [
  {
    id: 'fine-nib',
    name: '锋笔契约',
    price: 18,
    description: '墨弹伤害 3 → 4，干笔伤害 2 → 3。',
    effect: 'damage',
  },
  {
    id: 'binding',
    name: '护页契约',
    price: 12,
    description: '生命上限 +2，立即恢复 2 生命。',
    effect: 'health',
  },
  {
    id: 'brush-step',
    name: '流云契约',
    price: 14,
    description: '闪避冷却缩短至 0.72 秒，移动速度 +10%。',
    effect: 'mobility',
  },
];
const portal = (id, x, y, target, spawn, label, extra = {}) => ({
  id,
  kind: 'portal',
  x,
  y,
  r: 43,
  target,
  spawn,
  label,
  ...extra,
});
const wall = (x, y, w, h) => ({ x, y, w, h, kind: 'wall' });
const foe = (type, x, y, extra = {}) => ({ type, x, y, ...extra });
const base = (id, name, subtitle, mapX, mapY) => ({
  id,
  name,
  subtitle,
  width: 960,
  height: 600,
  mapX,
  mapY,
  obstacles: [],
  objects: [],
  portals: [],
  bridges: [],
  enemySpawns: [],
  waves: [],
});
const rooms = [
  {
    ...base('arrival', '落笔庭院', '沿东门前进，击败两位守印者', 0, 1),
    obstacles: [
      wall(275, 295, 80, 62),
      wall(640, 395, 85, 70),
      { x: 34, y: 108, w: 386, h: 86, kind: 'pit' },
      { x: 420, y: 108, w: 120, h: 86, kind: 'pit', bridgeId: 'archive-bridge' },
      { x: 540, y: 108, w: 386, h: 86, kind: 'pit' },
    ],
    bridges: [
      {
        id: 'archive-bridge',
        from: { x: 480, y: 236 },
        to: { x: 480, y: 79 },
        rect: { x: 420, y: 108, w: 120, h: 86 },
        cost: 8,
        drawn: false,
        label: '绘桥 · 8 墨',
        rewardText: '支路宝库：34 墨 + 2 生命',
      },
    ],
    portals: [
      portal('arrival-east', 913, 300, 'sentinel', { x: 94, y: 300 }, '守印长廊', {
        requiresClear: true,
      }),
      portal('arrival-north', 480, 48, 'archive', { x: 480, y: 498 }, '遗墨书库', {
        bridgeId: 'archive-bridge',
        requiresClear: true,
      }),
    ],
    enemySpawns: [foe('blot', 565, 350), foe('blot', 730, 340), foe('spitter', 750, 225)],
  },
  {
    ...base('archive', '遗墨书库', '击败藏书墨灵，走近墨匣领取补给', 0, 0),
    obstacles: [wall(235, 165, 80, 160), wall(640, 165, 80, 160)],
    portals: [portal('archive-south', 480, 550, 'arrival', { x: 480, y: 67 }, '返回庭院')],
    objects: [
      {
        id: 'archive-cache',
        kind: 'chest',
        x: 480,
        y: 114,
        r: 29,
        label: '藏墨匣 · +34 墨 / +2 生命',
        reward: { ink: 34, hp: 2 },
        requiresClear: true,
        autoOpen: true,
      },
    ],
    enemySpawns: [foe('blot', 430, 265), foe('blot', 565, 260), foe('spitter', 480, 170)],
  },
  {
    ...base('sentinel', '守印长廊', '两波守卫 · 清场获得第一枚钥印', 1, 1),
    obstacles: [wall(255, 160, 80, 90), wall(630, 350, 80, 90)],
    portals: [
      portal('sentinel-west', 47, 300, 'arrival', { x: 851, y: 300 }, '返回庭院'),
      portal('sentinel-east', 913, 300, 'market', { x: 97, y: 300 }, '洗笔驿站', {
        requiresClear: true,
      }),
    ],
    enemySpawns: [foe('blot', 450, 250), foe('spitter', 665, 220), foe('blot', 745, 390)],
    waves: [[foe('guard', 710, 280), foe('blot', 555, 165), foe('spitter', 560, 455)]],
    clearReward: { seals: 1, ink: 8 },
  },
  {
    ...base('market', '洗笔驿站', '北上取第二枚钥印，再从东门迎战终页', 2, 1),
    obstacles: [wall(345, 160, 50, 110), wall(560, 400, 55, 85)],
    portals: [
      portal('market-west', 47, 300, 'sentinel', { x: 851, y: 300 }, '守印长廊'),
      portal('market-north', 480, 47, 'warden', { x: 480, y: 503 }, '断笔兵营'),
      portal('market-east', 913, 300, 'gate', { x: 102, y: 300 }, '墨之门', { requiresSeals: 2 }),
    ],
    objects: [
      {
        id: 'rest-spring',
        kind: 'spring',
        x: 278,
        y: 420,
        r: 32,
        label: '洗笔泉 · 免费恢复 3 生命',
        reward: { hp: 3 },
      },
      {
        id: 'ink-merchant',
        kind: 'merchant',
        x: 700,
        y: 190,
        r: 34,
        label: '无名契约师 · 用墨换力量',
      },
    ],
  },
  {
    ...base('warden', '断笔兵营', '躲开直线冲锋，夺回第二枚钥印', 2, 0),
    obstacles: [wall(260, 195, 65, 145), wall(630, 195, 65, 145)],
    portals: [portal('warden-south', 480, 550, 'market', { x: 480, y: 101 }, '返回驿站')],
    enemySpawns: [foe('guard', 480, 180), foe('spitter', 760, 220), foe('blot', 195, 190)],
    waves: [
      [
        foe('guard', 485, 195),
        foe('blot', 195, 380),
        foe('blot', 765, 365),
        foe('spitter', 480, 95),
      ],
    ],
    clearReward: { seals: 1, ink: 10 },
  },
  {
    ...base('gate', '终页 · 墨之门', '躲过蓄力冲锋；半血后墨潮会加速', 3, 1),
    obstacles: [
      wall(280, 170, 58, 66),
      wall(280, 365, 58, 66),
      wall(660, 170, 58, 66),
      wall(660, 365, 58, 66),
    ],
    portals: [
      portal('gate-west', 47, 300, 'market', { x: 850, y: 300 }, '返回驿站', {
        requiresClear: true,
      }),
    ],
    enemySpawns: [foe('boss', 610, 300)],
  },
];
export const LEVELS = {
  'chapter-1': {
    id: 'chapter-1',
    title: '第一章 · 遗忘之庭',
    subtitle: '一滴墨，决定一切',
    start: 'arrival',
    gate: 'gate',
    requiredSeals: 2,
    spawn: { x: 155, y: 380 },
    initial: { ink: 64, maxInk: 100, hp: 6, maxHp: 6 },
    rules: {
      attackCost: 2,
      attackDamage: 3,
      attackCooldown: 0.25,
      healCost: 10,
      healAmount: 3,
      meleeDamage: 2,
      meleeRange: 65,
      meleeCooldown: 0.4,
      dashCooldown: 1.1,
      dashDuration: 0.18,
      dashInvuln: 0.22,
      speed: 222,
    },
    contracts: CONTRACTS,
    rooms,
  },
};
export const levels = LEVELS;
