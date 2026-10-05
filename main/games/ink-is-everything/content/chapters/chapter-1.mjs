import { portal, wall, foe, room } from '../room-helpers.mjs';

const rooms = [
  {
    ...room('arrival', '落笔庭院', '墨水就是生命：命中吸墨，走近墨滴回收', 0, 1),
    objective: '击败墨灵，拾取首件装备；红色预告出现时侧闪。',
    clearedObjective: '拾取落地装备，再走东门；北侧绘桥通往稀有装备宝库。',
    clearMessage: '第一件装备落地了！走近金色刻印，三选一强化你的笔。',
    rewardPosition: { x: 650, y: 300 },
    clearReward: {
      gear: { pool: ['fine-nib', 'backflow-amber', 'ink-sac'], title: '初笔遗物 · 选择第一件装备' },
    },
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
        rewardText: '支路宝库：24 墨汁 + 稀有装备三选一',
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
    ...room('archive', '遗墨书库', '击败藏书墨灵，开启稀有装备墨匣', 0, 0),
    objective: '清散书库墨灵；墨滴会干涸，侧闪后及时回收。',
    clearedObjective: '走近北侧藏墨匣，领取 24 墨汁与稀有装备。',
    clearMessage: '书库的墨匣已解封，靠近领取装备与墨汁。',
    obstacles: [wall(235, 165, 80, 160), wall(640, 165, 80, 160)],
    portals: [portal('archive-south', 480, 550, 'arrival', { x: 480, y: 67 }, '返回庭院')],
    objects: [
      {
        id: 'archive-cache',
        kind: 'chest',
        x: 480,
        y: 114,
        r: 29,
        label: '藏墨匣 · +24 墨汁 / 稀有装备',
        reward: {
          ink: 24,
          gear: {
            pool: ['backflow-amber', 'splash-sigil', 'gather-ring'],
            title: '遗墨藏珍 · 稀有装备三选一',
          },
        },
        requiresClear: true,
        autoOpen: true,
      },
    ],
    enemySpawns: [foe('blot', 430, 265), foe('blot', 565, 260), foe('spitter', 480, 170)],
  },
  {
    ...room('sentinel', '守印长廊', '两波守卫 · 钥印与装备奖励', 1, 1),
    objective: '清散两波守卫，夺取第一枚钥印；贴身溅墨可同时吸取多敌墨汁。',
    clearedObjective: '拾取钥印与装备，从东门进入洗笔驿站。',
    clearMessage: '第一枚钥印与守卫遗物已落地。走近中央的金色刻印。',
    rewardPosition: { x: 480, y: 300 },
    obstacles: [wall(255, 160, 80, 90), wall(630, 350, 80, 90)],
    portals: [
      portal('sentinel-west', 47, 300, 'arrival', { x: 851, y: 300 }, '返回庭院'),
      portal('sentinel-east', 913, 300, 'market', { x: 97, y: 300 }, '洗笔驿站', {
        requiresClear: true,
      }),
    ],
    enemySpawns: [foe('blot', 450, 250), foe('spitter', 665, 220), foe('blot', 745, 390)],
    waves: [[foe('guard', 710, 280), foe('blot', 555, 165), foe('spitter', 560, 455)]],
    clearReward: {
      seals: 1,
      ink: 8,
      gear: { pool: ['fine-nib', 'splash-sigil', 'swift-boots'], title: '守印战利品 · 装备进阶' },
    },
  },
  {
    ...room('market', '洗笔驿站', '补墨、升级装备，再挑战第二枚钥印', 2, 1),
    objective: '洗笔泉可补回 24 墨汁；契约师以墨汁为装备升阶。',
    clearedObjective: '北门夺取第二枚钥印；集齐两枚后，沿东门挑战守门者。',
    clearMessage: '这里没有敌人，可以整理装备并补墨。',
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
        label: '洗笔泉 · 免费补回 24 墨汁',
        reward: { ink: 24 },
      },
      {
        id: 'ink-merchant',
        kind: 'merchant',
        x: 700,
        y: 190,
        r: 34,
        label: '无名契约师 · 消耗墨汁升级装备',
      },
    ],
  },
  {
    ...room('warden', '断笔兵营', '躲开直线冲锋，夺回第二枚钥印', 2, 0),
    objective: '躲过冲锋后近身吸墨，清散两波兵营守卫。',
    clearedObjective: '拾取第二枚钥印与装备，南返驿站，再走东门。',
    clearMessage: '双钥印齐备。拾取中央金色刻印中的装备，写下最后一战。',
    rewardPosition: { x: 480, y: 300 },
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
    clearReward: {
      seals: 1,
      ink: 10,
      gear: {
        pool: ['backflow-amber', 'ink-sac', 'gather-ring'],
        title: '断笔军械 · 最终战前强化',
      },
    },
  },
  {
    ...room('gate', '终页 · 墨之门', '守门者墨量减半后，墨潮会加速', 3, 1),
    isFinal: true,
    objective: '击败两阶段守门者；受伤、施法与装备共用这瓶墨汁。',
    clearedObjective: '归途已由你亲手写成。',
    clearMessage: '墨之门开启了。你把每一滴墨，写成了归途。',
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

export const CHAPTER_ONE = {
  id: 'chapter-1',
  title: '第一章 · 遗忘之庭',
  shortTitle: '遗忘之庭',
  description:
    '六处纸墨遗迹、一条装备支路与双阶段守门者。命中夺回墨汁，回收技能墨滴，写出自己的装备组合。',
  start: 'arrival',
  spawn: { x: 155, y: 380 },
  initial: { ink: 90, maxInk: 100 },
  requiredSeals: 2,
  rooms,
};

export default CHAPTER_ONE;
