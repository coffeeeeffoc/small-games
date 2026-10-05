import { BOONS, SKILLS, UPGRADES, WEAPONS } from './catalog.mjs';
import { validateContentPack } from './content-schema.mjs';

export { BOONS, SKILLS, UPGRADES, WEAPONS };

/** Data-only catalogues. Runtime systems consume shared definitions, never level-specific code. */
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function catalog(definitions) {
  return Object.fromEntries(
    Object.entries(definitions).map(([key, value]) => [key, freeze(value)]),
  );
}

const ECOLOGY_ART = 'docs/design/concepts/growth-weapons-plants.png';
const MONSTER_ART = 'docs/design/concepts/monsters.png';
export const WORLD = freeze({ width: 1440, height: 900 });

export const SEEDS = catalog({
  thorn: {
    id: 'thorn',
    name: '花叶灌木',
    subtitle: '减速 · 持续伤害',
    description: '激活祝福后自动生长灌木。敌人减速 58%，每秒受到 12 点伤害。',
    color: '#81da65',
    damage: 30,
    radius: 58,
    life: 14,
    health: 1,
    capacity: 6,
    regenSeconds: 5,
    slow: 0.42,
    damagePerSecond: 12,
    unlockLevel: 1,
    weatherTags: ['leaf'],
    designReference: ECOLOGY_ART,
    effects: [
      { type: 'slowAura', range: 58, slow: 0.42 },
      { type: 'damageAura', range: 58, damagePerSecond: 12 },
    ],
  },
  ice: {
    id: 'ice',
    name: '寒冰柱',
    subtitle: '阻挡 · 改变路线',
    description: '激活祝福后自动生长冰柱。阻挡双方移动与子弹，怪物会绕行或击碎它。',
    color: '#67d4ff',
    damage: 38,
    radius: 28,
    life: 12,
    health: 105,
    capacity: 4,
    regenSeconds: 7,
    unlockLevel: 3,
    weatherTags: ['ice'],
    designReference: ECOLOGY_ART,
    effects: [{ type: 'block' }],
  },
  mushroom: {
    id: 'mushroom',
    name: '爆炸蘑菇',
    subtitle: '延迟 2.4 秒 · 范围爆炸',
    description: '自动生长后等待 2.4 秒爆炸，造成 105 点范围伤害。用灌木留住敌人！',
    color: '#ffb34b',
    damage: 42,
    radius: 23,
    life: 2.4,
    health: 1,
    capacity: 4,
    regenSeconds: 6,
    blastRadius: 124,
    blastDamage: 105,
    unlockLevel: 4,
    weatherTags: ['fungus'],
    designReference: ECOLOGY_ART,
    effects: [{ type: 'explode', range: 124, damage: 105, delay: 2.4, armorPierce: 6 }],
  },
  sunflower: {
    id: 'sunflower',
    name: '暖阳花',
    subtitle: '等级 2 · 范围治疗',
    description: '自动生长后为范围内角色每秒回复 3 生命，多株最多回复 5 生命。',
    color: '#f5d467',
    damage: 24,
    radius: 24,
    life: 12,
    health: 45,
    capacity: 3,
    regenSeconds: 9,
    unlockLevel: 2,
    weatherTags: ['flower'],
    designReference: ECOLOGY_ART,
    effects: [{ type: 'healAura', range: 85, healPerSecond: 3, maxStackHeal: 5 }],
  },
  stormreed: {
    id: 'stormreed',
    name: '引雷芦',
    subtitle: '等级 5 · 对空连锁',
    description: '每 1.1 秒释放 24 点电伤，能攻击升空怪物，并连锁一个邻近目标。',
    color: '#79dfef',
    damage: 32,
    radius: 23,
    life: 12,
    health: 55,
    capacity: 3,
    regenSeconds: 10,
    unlockLevel: 5,
    weatherTags: ['electric'],
    designReference: ECOLOGY_ART,
    effects: [
      {
        type: 'chainLightning',
        range: 190,
        damage: 24,
        interval: 1.1,
        chainRange: 90,
        chainCount: 1,
        chainMultiplier: 0.5,
        antiAir: true,
      },
    ],
  },
  bloomturret: {
    id: 'bloomturret',
    name: '花瓣炮',
    subtitle: '等级 6 · 自动射击',
    description: '每 0.9 秒射击 300 范围内的最近目标，造成 16 点伤害。',
    color: '#f193d4',
    damage: 30,
    radius: 26,
    life: 13,
    health: 65,
    capacity: 3,
    regenSeconds: 8,
    unlockLevel: 6,
    weatherTags: ['flower'],
    designReference: ECOLOGY_ART,
    effects: [
      { type: 'shoot', range: 300, damage: 16, interval: 0.9, projectileSpeed: 640, antiAir: true },
    ],
  },
});

function enemy(id, name, hp, radius, speed, damage, coins, bite, options = {}) {
  const { visual = {}, ...extra } = options;
  return {
    id,
    name,
    hp,
    radius,
    speed,
    damage,
    coins,
    bite,
    experience: coins,
    art: MONSTER_ART,
    xp: coins,
    rank: 'normal',
    armor: 0,
    controlResistance: 0,
    shield: 0,
    unlockStage: 1,
    abilities: [],
    color: visual.color ?? '#80c85b',
    ...extra,
    visual: {
      color: '#80c85b',
      accent: '#aee47f',
      eye: '#f6dc76',
      silhouette: id,
      designReference: MONSTER_ART,
      ...visual,
    },
  };
}

export const ENEMIES = catalog({
  sprout: enemy('sprout', '芽怪', 50, 19, 61, 8, 2, 16, {
    unlockStage: 1,
    unlockLevel: 1,
    visual: { color: '#344f45', accent: '#a3cf59' },
  }),
  runner: enemy('runner', '疾行芽', 34, 14, 114, 6, 3, 11, {
    unlockStage: 2,
    unlockLevel: 2,
    visual: { color: '#4ba889', accent: '#83f2c5', eye: '#75eaff' },
  }),
  brute: enemy('brute', '岩壳巨芽', 178, 33, 43, 16, 8, 39, {
    unlockStage: 3,
    unlockLevel: 2,
    armor: 6,
    visual: { color: '#8c8972', accent: '#a5b77a' },
  }),
  sentinel: enemy('sentinel', '坚根卫', 110, 24, 60, 10, 5, 22, {
    unlockStage: 5,
    unlockLevel: 4,
    controlResistance: 0.65,
    abilities: [{ type: 'controlResist', resistance: 0.65 }],
    visual: { color: '#9853b4', accent: '#d996ff', eye: '#dfa1ff' },
  }),
  spitter: enemy('spitter', '吐籽花', 70, 21, 47, 7, 5, 15, {
    unlockStage: 6,
    unlockLevel: 5,
    abilities: [{ type: 'spitter', cooldown: 2.6, windup: 0.6, speed: 220, range: 340 }],
    visual: { color: '#85439e', accent: '#e09eff', eye: '#eaa9ff' },
  }),
  warden: enemy('warden', '岩根首领', 800, 48, 44, 20, 35, 55, {
    unlockStage: 4,
    unlockLevel: 3,
    rank: 'leader',
    armor: 8,
    controlResistance: 0.5,
    abilities: [{ type: 'charger', cooldown: 5.8, windup: 0.8, speed: 240, duration: 0.5 }],
    visual: { color: '#9b9270', accent: '#f5d66f' },
  }),
  charger: enemy('charger', '逐风芽', 90, 22, 80, 12, 6, 23, {
    unlockStage: 7,
    unlockLevel: 6,
    abilities: [{ type: 'charger', cooldown: 4.8, windup: 0.65, duration: 0.45, speed: 320 }],
    visual: { color: '#aa3849', accent: '#fa7379', eye: '#ff8d8d' },
  }),
  brood: enemy('brood', '裂荚母株', 155, 28, 45, 12, 8, 28, {
    unlockStage: 10,
    unlockLevel: 8,
    abilities: [{ type: 'brood', thresholds: [0.7, 0.35], count: 2, kind: 'minion', cap: 4 }],
    visual: { color: '#ca7f3c', accent: '#ffce67' },
  }),
  minion: enemy('minion', '荚芽小兵', 20, 10, 96, 4, 0, 6, {
    unlockStage: 9,
    unlockLevel: 7,
    summoned: true,
    visual: { color: '#a99546', accent: '#ffe46e' },
  }),
  burrower: enemy('burrower', '钻根兽', 115, 24, 72, 11, 7, 25, {
    unlockStage: 12,
    unlockLevel: 10,
    abilities: [{ type: 'burrower', groundTime: 3.5, windup: 0.55, duration: 1.8, emerge: 0.65 }],
    visual: { color: '#8b674d', accent: '#d7ad77' },
  }),
  shield: enemy('shield', '盾苔卫', 165, 27, 45, 13, 9, 30, {
    unlockStage: 13,
    unlockLevel: 11,
    shield: 70,
    abilities: [{ type: 'shield', cooldown: 6, quietTime: 3, restore: 35 }],
    visual: { color: '#487f9e', accent: '#8de1fb', eye: '#75eaff' },
  }),
  bastionlord: enemy('bastionlord', '苔堡统领', 1200, 50, 42, 22, 50, 60, {
    unlockStage: 8,
    unlockLevel: 6,
    rank: 'leader',
    shield: 150,
    controlResistance: 0.5,
    abilities: [
      {
        type: 'spitter',
        cooldown: 6,
        windup: 0.8,
        speed: 190,
        range: 440,
        pellets: 3,
        spread: 0.5,
      },
      { type: 'shieldBreakStun', duration: 1 },
    ],
    visual: { color: '#3c6b87', accent: '#f1ce74', eye: '#84e2ff' },
  }),
  glider: enemy('glider', '翼叶精', 78, 20, 80, 8, 7, 12, {
    unlockStage: 14,
    unlockLevel: 12,
    abilities: [{ type: 'glider', groundTime: 2.7, duration: 2.4, height: 32 }],
    visual: { color: '#448786', accent: '#93ebee', eye: '#75eaff' },
  }),
  overgrowth: enemy('overgrowth', '花园之心', 2000, 62, 38, 24, 90, 75, {
    unlockStage: 11,
    unlockLevel: 9,
    rank: 'boss',
    armor: 10,
    controlResistance: 0.5,
    abilities: [
      {
        type: 'spitter',
        cooldown: 3.8,
        windup: 0.75,
        speed: 200,
        range: 440,
        pellets: 3,
        spread: 0.45,
      },
      { type: 'charger', cooldown: 7, windup: 0.9, speed: 260, duration: 0.55 },
      {
        type: 'bossPhases',
        thresholds: [0.65, 0.3],
        summonInterval: 8,
        summonCount: 3,
        summonKind: 'minion',
        shield: 120,
      },
    ],
    visual: { color: '#743446', accent: '#ff6275', eye: '#ffc8ae' },
  }),
});

/** Base weather plus independent wind/thunder modifiers share the stat pipeline. */
export const WEATHER = catalog({
  sunny: {
    id: 'sunny',
    unlockLevel: 1,
    art: 'docs/design/concepts/map-ruins.png',
    name: '晴天',
    description: '花系植物伤害和治疗 +10%。',
    modifiers: { plantDamage: 1.1, healPower: 1.1 },
  },
  overcast: {
    id: 'overcast',
    unlockLevel: 2,
    art: 'docs/design/concepts/map-quarry.png',
    name: '阴天',
    description: '植物耐久和持续时间 +10%。',
    modifiers: { plantHealth: 1.1, plantDuration: 1.1 },
  },
  rain: {
    id: 'rain',
    unlockLevel: 3,
    art: 'docs/design/concepts/map-wetland.png',
    name: '雨天',
    description: '种子恢复 +10%，荆棘控制增强，苔阶更滑。',
    modifiers: { seedRegen: 1.1, slopeChance: 1.4 },
    thornControl: 1.1,
    mudSpeed: 0.95,
  },
  fog: {
    id: 'fog',
    unlockLevel: 5,
    art: 'docs/design/concepts/map-mistwood.png',
    name: '大雾',
    description: '有效射程 -15%，怪物远程攻击稍慢。',
    modifiers: { gunRange: 0.85, enemyFireRate: 1 / 1.15 },
  },
  hail: {
    id: 'hail',
    unlockLevel: 6,
    art: 'docs/design/concepts/map-hailfield.png',
    name: '冰雹',
    description: '地面怪物移速 -10%，冰柱耐久 +25%，注意落冰。',
    modifiers: { enemySpeed: 0.9, iceHealth: 1.25 },
    hazard: { kind: 'hail', interval: 8, windup: 0.9, damage: 10, plantDamage: 8, radius: 48 },
  },
});
export const WEATHER_MODIFIERS = freeze({
  wind: {
    id: 'wind',
    unlockLevel: 4,
    name: '大风',
    description: '地面敌人稍快，飞行更快，花瓣弹速提高。',
    perPower: { enemySpeed: 0.08, airSpeed: 0.18, projectileSpeed: 0.15 },
  },
  thunder: {
    id: 'thunder',
    unlockLevel: 7,
    name: '雷暴',
    description: '引雷芦电伤 +20%，注意雷击预警。',
    modifiers: { electricDamage: 1.2 },
    hazard: {
      kind: 'lightning',
      interval: 10,
      windup: 1.1,
      damage: 14,
      plantDamage: 0,
      radius: 48,
    },
  },
});

const BOUNDS = freeze({ left: 100, right: 1340, top: 150, bottom: 750 });
const PLAYER_START = freeze({ x: 720, y: 470 });
const wall = (id, x, y, radius) => ({ id, kind: 'wall', x, y, radius, blocksProjectiles: true });
const mud = (id, x, y, radius) => ({
  id,
  kind: 'mud',
  x,
  y,
  radius,
  playerSpeed: 0.8,
  enemySpeed: 0.72,
});
const slope = (id, x, y, radius) => ({
  id,
  kind: 'slope',
  x,
  y,
  radius,
  direction: { x: 0, y: -1 },
  speedMultiplier: 0.9,
  slipChance: 0.22,
  slipDistance: 35,
  slipCooldown: 1.8,
});

/** Local edits preserve the previous garden's landmarks and collision footprint. */
function evolve(previous, changes) {
  const next = previous.map((terrain) => ({ ...terrain }));
  for (const change of changes) {
    const index = next.findIndex((terrain) => terrain.id === change.id);
    if (change.remove) {
      if (index >= 0) next.splice(index, 1);
    } else if (index >= 0) next[index] = { ...next[index], ...change };
    else next.push({ ...change });
  }
  return next;
}

const layouts = {};
layouts.ruins = [
  wall('west-pillar', 400, 385, 48),
  wall('east-pillar', 1040, 385, 48),
  wall('southwest-rock', 440, 630, 40),
  wall('southeast-rock', 1000, 630, 40),
];
layouts.meadow = evolve(layouts.ruins, [
  { id: 'west-pillar', x: 365 },
  mud('west-moss', 490, 625, 80),
]);
layouts.wetland = evolve(layouts.meadow, [
  { id: 'west-moss', radius: 95 },
  mud('east-moss', 1090, 290, 72),
]);
layouts.quarry = evolve(layouts.wetland, [
  { id: 'east-pillar', x: 1075 },
  wall('north-rock', 860, 265, 36),
]);
layouts.windpass = evolve(layouts.quarry, [
  slope('west-moss', 490, 625, 85),
  { id: 'east-pillar', x: 1110 },
]);
layouts.hollow = evolve(layouts.windpass, [
  { id: 'southeast-rock', x: 1035 },
  { id: 'east-moss', radius: 62 },
]);
layouts.terraces = evolve(layouts.hollow, [
  slope('west-upper-slope', 335, 460, 74),
  { id: 'southwest-rock', x: 410 },
]);
layouts.bastion = evolve(layouts.terraces, [
  { id: 'west-upper-slope', radius: 80 },
  { id: 'north-rock', radius: 48 },
]);
layouts.mistwood = evolve(layouts.bastion, [
  { id: 'east-pillar', x: 1140 },
  { id: 'east-moss', radius: 50 },
]);
layouts.hailfield = evolve(layouts.mistwood, [
  slope('east-slope', 1125, 540, 70),
  { id: 'north-rock', x: 890 },
]);
layouts.heartgarden = evolve(layouts.hailfield, [
  { id: 'east-slope', remove: true },
  { id: 'north-rock', x: 850 },
]);

const campaign = [
  {
    id: 'ruins',
    name: '失落庭院',
    duration: 300,
    waves: 10,
    weather: { kind: 'sunny', wind: 0, thunder: false },
    rewards: { coins: 90, xp: 115 },
    palette: { ground: '#98ab74', accent: '#efda96', sky: '#abc9c6' },
    landmark: 'sun-dial',
    lesson: '先以自动射击熟悉庭院；选择祝福后植物会自动生长。',
    composition: [
      { fromWave: 1, weights: { sprout: 1 } },
      { fromWave: 2, weights: { sprout: 0.62, runner: 0.38 } },
      { fromWave: 3, weights: { sprout: 0.55, runner: 0.27, brute: 0.18 } },
      { fromWave: 7, weights: { sprout: 0.4, runner: 0.36, brute: 0.24 } },
    ],
  },
  {
    id: 'meadow',
    name: '复苏花径',
    duration: 120,
    waves: 6,
    weather: { kind: 'sunny', wind: 0, thunder: false },
    rewards: { coins: 105, xp: 130 },
    palette: { ground: '#8ba966', accent: '#efe0a4', sky: '#c3d4c1' },
    landmark: 'flowers',
    lesson: '坚根卫能抵抗大部分控制；暖阳花在玩家等级 2 解锁。',
    composition: [
      { fromWave: 1, weights: { sprout: 0.6, runner: 0.25, sentinel: 0.15 } },
      { fromWave: 3, weights: { sprout: 0.45, runner: 0.3, sentinel: 0.25 } },
      { fromWave: 5, weights: { sprout: 0.33, runner: 0.3, brute: 0.12, sentinel: 0.25 } },
    ],
  },
  {
    id: 'wetland',
    name: '雨苔池畔',
    duration: 120,
    waves: 6,
    weather: { kind: 'rain', wind: 0, thunder: false },
    rewards: { coins: 120, xp: 150 },
    palette: { ground: '#728576', accent: '#b9c9b0', sky: '#617d86' },
    landmark: 'ponds',
    lesson: '吐籽花的蓄力弹可通过移动或已解锁的寒冰柱避开。',
    composition: [
      { fromWave: 1, weights: { sprout: 0.45, runner: 0.2, sentinel: 0.2, spitter: 0.15 } },
      {
        fromWave: 3,
        weights: { sprout: 0.35, runner: 0.2, brute: 0.1, sentinel: 0.15, spitter: 0.2 },
      },
      {
        fromWave: 5,
        weights: { sprout: 0.25, runner: 0.2, brute: 0.1, sentinel: 0.2, spitter: 0.25 },
      },
    ],
  },
  {
    id: 'quarry',
    name: '岩根隘口',
    duration: 150,
    waves: 6,
    weather: { kind: 'overcast', wind: 0, thunder: false },
    rewards: { coins: 160, xp: 185 },
    palette: { ground: '#899282', accent: '#d9d5b4', sky: '#7f909b' },
    landmark: 'stone-crown',
    lesson: '第 4 关首领：躲开定向冲撞，利用结束后的僵直。',
    encounter: { kind: 'warden', rank: 'leader', atWave: 6, required: true },
    composition: [
      { fromWave: 1, weights: { sprout: 0.35, runner: 0.25, brute: 0.2, sentinel: 0.2 } },
      { fromWave: 3, weights: { sprout: 0.3, runner: 0.22, brute: 0.28, sentinel: 0.2 } },
    ],
  },
  {
    id: 'windpass',
    name: '逐风回廊',
    duration: 120,
    waves: 6,
    weather: { kind: 'sunny', wind: 0.65, thunder: false },
    rewards: { coins: 145, xp: 175 },
    palette: { ground: '#8aab75', accent: '#e1d5a1', sky: '#a9c9d1' },
    landmark: 'wind-arch',
    lesson: '逐风芽冲刺前会锁定方向；看到预警后向侧面移动。',
    composition: [
      {
        fromWave: 1,
        weights: { sprout: 0.35, runner: 0.22, brute: 0.1, sentinel: 0.13, charger: 0.2 },
      },
      {
        fromWave: 3,
        weights: { sprout: 0.28, runner: 0.2, brute: 0.12, sentinel: 0.15, charger: 0.25 },
      },
      {
        fromWave: 5,
        weights: { sprout: 0.23, runner: 0.2, brute: 0.12, sentinel: 0.15, charger: 0.3 },
      },
    ],
  },
  {
    id: 'hollow',
    name: '裂荚温室',
    duration: 150,
    waves: 6,
    weather: { kind: 'rain', wind: 0, thunder: false },
    rewards: { coins: 160, xp: 195 },
    palette: { ground: '#707c66', accent: '#d7a95a', sky: '#6b7c89' },
    landmark: 'pods',
    lesson: '裂荚母株受伤会产小兵；范围伤害更适合清理荚群。',
    composition: [
      {
        fromWave: 1,
        weights: { sprout: 0.32, runner: 0.15, spitter: 0.15, charger: 0.18, brood: 0.2 },
      },
      {
        fromWave: 3,
        weights: { sprout: 0.28, runner: 0.13, spitter: 0.15, charger: 0.2, brood: 0.24 },
      },
      {
        fromWave: 5,
        weights: { sprout: 0.24, runner: 0.13, spitter: 0.15, charger: 0.2, brood: 0.28 },
      },
    ],
  },
  {
    id: 'terraces',
    name: '潮根苔阶',
    duration: 150,
    waves: 6,
    weather: { kind: 'rain', wind: 0.35, thunder: false },
    rewards: { coins: 175, xp: 215 },
    palette: { ground: '#6c8373', accent: '#b1ba7d', sky: '#677d89' },
    landmark: 'root-hole',
    lesson: '钻根兽下钻时有土丘轨迹，出土前有警示；冰柱拦不住地下单位。',
    composition: [
      {
        fromWave: 1,
        weights: { sprout: 0.27, runner: 0.15, sentinel: 0.15, brood: 0.25, burrower: 0.18 },
      },
      {
        fromWave: 3,
        weights: { sprout: 0.23, runner: 0.15, sentinel: 0.15, brood: 0.25, burrower: 0.22 },
      },
      {
        fromWave: 5,
        weights: { sprout: 0.2, runner: 0.15, sentinel: 0.15, brood: 0.25, burrower: 0.25 },
      },
    ],
  },
  {
    id: 'bastion',
    name: '盾苔古堡',
    duration: 180,
    waves: 6,
    weather: { kind: 'overcast', wind: 0.4, thunder: false },
    rewards: { coins: 215, xp: 250 },
    palette: { ground: '#82907b', accent: '#cbbf7f', sky: '#8498a2' },
    landmark: 'shield-gate',
    lesson: '第 8 关首领：破盾产生僵直，避开扇形远程弹。',
    encounter: { kind: 'bastionlord', rank: 'leader', atWave: 6, required: true },
    composition: [
      {
        fromWave: 1,
        weights: {
          sprout: 0.2,
          runner: 0.12,
          brute: 0.18,
          spitter: 0.15,
          burrower: 0.15,
          shield: 0.2,
        },
      },
      {
        fromWave: 3,
        weights: {
          sprout: 0.15,
          runner: 0.12,
          brute: 0.18,
          spitter: 0.15,
          burrower: 0.15,
          shield: 0.25,
        },
      },
    ],
  },
  {
    id: 'mistwood',
    name: '雾翼林庭',
    duration: 150,
    waves: 6,
    weather: { kind: 'fog', wind: 0, thunder: false },
    rewards: { coins: 205, xp: 245 },
    palette: { ground: '#6f8b81', accent: '#b6d7c8', sky: '#9eafb2' },
    landmark: 'mist-tree',
    lesson: '升空敌人忽略地表植物；普通枪与引雷芦可以对空。',
    composition: [
      {
        fromWave: 1,
        weights: {
          sprout: 0.2,
          runner: 0.15,
          spitter: 0.18,
          burrower: 0.15,
          shield: 0.12,
          glider: 0.2,
        },
      },
      {
        fromWave: 3,
        weights: {
          sprout: 0.15,
          runner: 0.15,
          spitter: 0.18,
          burrower: 0.15,
          shield: 0.12,
          glider: 0.25,
        },
      },
      {
        fromWave: 5,
        weights: {
          sprout: 0.1,
          runner: 0.15,
          spitter: 0.18,
          burrower: 0.15,
          shield: 0.12,
          glider: 0.3,
        },
      },
    ],
  },
  {
    id: 'hailfield',
    name: '冰雹花台',
    duration: 150,
    waves: 6,
    weather: { kind: 'hail', wind: 0.6, thunder: false },
    rewards: { coins: 225, xp: 275 },
    palette: { ground: '#849fa8', accent: '#d9eef0', sky: '#7899b7' },
    landmark: 'frost-garden',
    lesson: '白蓝圈预告落冰；冰雹会同时伤害地面敌人和玩家。',
    composition: [
      {
        fromWave: 1,
        weights: {
          sprout: 0.15,
          runner: 0.15,
          spitter: 0.2,
          charger: 0.15,
          shield: 0.15,
          glider: 0.2,
        },
      },
      {
        fromWave: 3,
        weights: {
          sprout: 0.1,
          runner: 0.15,
          spitter: 0.2,
          charger: 0.15,
          shield: 0.15,
          glider: 0.25,
        },
      },
    ],
  },
  {
    id: 'heartgarden',
    name: '雷鸣心圃',
    duration: 180,
    waves: 6,
    weather: { kind: 'overcast', wind: 0.25, thunder: true },
    rewards: { coins: 300, xp: 360 },
    palette: { ground: '#626d6b', accent: '#cd8794', sky: '#596b82' },
    landmark: 'core',
    lesson: '章节 BOSS：三阶段切换；雷击提前警示，引雷芦在雷暴中增强。',
    encounter: { kind: 'overgrowth', rank: 'boss', atWave: 6, required: true },
    composition: [
      {
        fromWave: 1,
        weights: { sprout: 0.2, runner: 0.2, brute: 0.2, sentinel: 0.2, spitter: 0.2 },
      },
      {
        fromWave: 3,
        weights: {
          sprout: 0.2,
          charger: 0.15,
          brood: 0.15,
          burrower: 0.15,
          shield: 0.15,
          glider: 0.2,
        },
      },
      {
        fromWave: 5,
        weights: {
          sprout: 0.1,
          runner: 0.1,
          brute: 0.1,
          sentinel: 0.1,
          spitter: 0.1,
          charger: 0.1,
          brood: 0.1,
          burrower: 0.1,
          shield: 0.1,
          glider: 0.1,
        },
      },
    ],
  },
];

// Keep every original encounter and ecology; late chapters give each remaining
// species its own introduction instead of introducing several at once.
for (const [id, name, lesson, introduced, xp] of [
  ['deepsoil', '深根秘境', '新增钻根兽：观察土丘轨迹，躲开出土预警。', 'burrower', 430],
  ['stonebloom', '坚盾花环', '新增盾苔卫：集中火力破盾，再用范围伤害清场。', 'shield', 465],
  ['skyreach', '云上花庭', '新增翼叶精：升空时用枪械、技能或引雷芦对空。', 'glider', 510],
]) {
  const previous = campaign.at(-1);
  layouts[id] = evolve(layouts[previous.id], []);
  campaign.push({
    id,
    name,
    lesson,
    duration: id === 'skyreach' ? 240 : 210,
    waves: 6,
    weather: { kind: 'sunny', wind: 0.25, thunder: false },
    rewards: { coins: xp - 100, xp },
    palette: { ...previous.palette },
    landmark: previous.landmark,
    art: 'docs/design/concepts/map-heartgarden.png',
    composition: [{ fromWave: 1, weights: { sprout: 0.4, runner: 0.2, [introduced]: 0.4 } }],
  });
}

export const ENEMY_INTRODUCTIONS = freeze([
  'sprout',
  'runner',
  'brute',
  'warden',
  'sentinel',
  'spitter',
  'charger',
  'bastionlord',
  'minion',
  'brood',
  'overgrowth',
  'burrower',
  'shield',
  'glider',
]);
export const LEVEL_ORDER = freeze(campaign.map((entry) => entry.id));
const chapterDurations = [60, 90, 120, 150, 150, 150, 150, 180, 180, 180, 210, 210, 210, 240];
const chapterUnlocks = [1, 2, 2, 3, 4, 5, 6, 6, 7, 8, 9, 10, 11, 12];
const chapterLessons = [
  '先学习移动与自动射击；第一关只会出现芽怪，升级后可激活灌木祝福。',
  '新增疾行芽；留出转向空间，Lv.2 开始随机携带能量技能。',
  '新增岩壳巨芽；慢速厚甲敌人适合边移动边集中射击。',
  '新增岩根首领；避开定向冲撞，抓住结束后的僵直。',
  '新增坚根卫；它能抵抗大部分控制，要保持移动。',
  '新增吐籽花；观察蓄力预警，横向避开远程弹。',
  '新增逐风芽；冲刺锁定方向后，及时向侧面移动。',
  '新增苔堡统领；破盾产生僵直，避开扇形远程弹。',
  '新增荚芽小兵；熟悉快速小目标，为下一关母株召唤做准备。',
  '新增裂荚母株；受伤会召唤已见过的荚芽小兵，用范围攻击清理。',
  '新增花园之心；三阶段切换，利用之前掌握的能力挑战章节首领。',
];

export const LEVELS = catalog(
  Object.fromEntries(
    campaign.map((entry, index) => {
      const { palette, landmark, composition, ...definition } = entry;
      const order = index + 1;
      const duration = chapterDurations[index];
      const waves = order === 1 ? 3 : entry.waves;
      const enemyKinds = ENEMY_INTRODUCTIONS.slice(0, order);
      const introduced = ENEMY_INTRODUCTIONS[index];
      const ordinary = enemyKinds.filter((kind) => ENEMIES[kind].rank === 'normal');
      const spawnComposition = composition
        .map((tier) => ({
          fromWave: Math.min(waves, tier.fromWave),
          weights: Object.fromEntries(
            ordinary.map((kind) => [
              kind,
              tier.weights[kind] ?? (kind === introduced ? 0.24 : kind === 'sprout' ? 0.4 : 0.055),
            ]),
          ),
        }))
        .filter(
          (tier, tierIndex, all) =>
            all.findIndex((other) => other.fromWave === tier.fromWave) === tierIndex,
        );
      if (order === 1)
        spawnComposition.splice(0, spawnComposition.length, {
          fromWave: 1,
          weights: { sprout: 1 },
        });
      const art = entry.art ?? `docs/design/concepts/map-${entry.id}.png`;
      return [
        entry.id,
        {
          ...definition,
          order,
          unlockLevel: chapterUnlocks[index],
          enemyKinds,
          introducedEnemy: introduced,
          duration,
          waves,
          lesson: chapterLessons[index] ?? entry.lesson,
          chapter: 'garden-awakening',
          subtitle: `花园远征 · 第 ${order} 关 / ${campaign.length}`,
          world: WORLD,
          bounds: BOUNDS,
          playerStart: PLAYER_START,
          waveDuration: duration / waves,
          plantCap: 18,
          progression: { firstXp: 12, xpStep: 10, fourChoicesAt: 5 },
          difficulty: {
            healthScale: order === 1 ? 0.8 : 1 + index * 0.045,
            damageScale: order === 1 ? 0.75 : 1 + index * 0.018,
            speedScale: order === 1 ? 0.85 : 1 + index * 0.009,
          },
          terrain: layouts[entry.id],
          art,
          visual: {
            palette,
            landmark,
            variation: order - 1,
            designReference: art,
          },
          spawn: {
            initialDelay: order === 1 ? 2.5 : 1.5,
            interval: order === 1 ? 3.2 : Math.max(1.4, 2.4 - index * 0.08),
            acceleration: order === 1 ? 0.15 : 0.13,
            minimumInterval: order === 1 ? 2.7 : 0.68,
            maxEnemies: order === 1 ? 12 : order >= 11 ? 40 : 32,
            composition: spawnComposition,
          },
        },
      ];
    }),
  ),
);

/** Validate the whole data pack, then atomically append immutable definitions. */
export function registerContentPack(pack) {
  const result = validateContentPack(pack, {
    levels: LEVELS,
    enemies: ENEMIES,
    plants: SEEDS,
    weather: WEATHER,
    buffs: UPGRADES,
  });
  if (!result.ok) return result;
  const upgradeIds = new Set(
    [...UPGRADES, ...result.additions.buffs].map((definition) => definition.id),
  );
  const errors = [];
  for (const plant of result.additions.plants) {
    if (Object.hasOwn(BOONS, plant.id) || upgradeIds.has(`boon-${plant.id}`))
      errors.push(`plants.${plant.id}: automatic boon ID already exists`);
    if (
      !Number.isFinite(plant.autoInterval ?? plant.regenSeconds) ||
      (plant.autoInterval ?? plant.regenSeconds) <= 0
    )
      errors.push(`plants.${plant.id}.autoInterval: positive generation interval required`);
  }
  if (errors.length) return { ok: false, errors };
  const prepared = Object.fromEntries(
    Object.entries(result.additions).map(([category, definitions]) => [
      category,
      definitions.map((definition) =>
        freeze(
          category === 'buffs'
            ? {
                ...definition,
                unlockPlayerLevel: definition.unlockPlayerLevel ?? definition.unlockLevel ?? 1,
                maxRank: definition.maxRank ?? definition.maxStacks ?? definition.maxStack,
              }
            : definition,
        ),
      ),
    ]),
  );
  const automaticBoons = prepared.plants.map((plant) =>
    freeze({
      id: plant.id,
      kind: plant.id,
      name: plant.name,
      color: plant.color ?? '#92cb87',
      description: plant.description ?? `${plant.name}会在激活祝福后自动生长。`,
      interval: plant.autoInterval ?? plant.regenSeconds,
      radius: plant.radius,
      life: plant.life,
      health: plant.health,
      unlockPlayerLevel: plant.unlockLevel ?? 1,
      art: plant.art ?? plant.designReference ?? plant.visual?.designReference,
    }),
  );
  const automaticUpgrades = automaticBoons.map((boon) =>
    freeze({
      id: `boon-${boon.id}`,
      name: `解锁 · ${boon.name}`,
      description: `解锁 · ${boon.description}`,
      category: 'terrain',
      maxRank: 1,
      maxStacks: 1,
      weight: 1,
      kind: boon.kind,
      icon: boon.kind,
      unlockPlayerLevel: boon.unlockPlayerLevel,
      effects: [],
      art: boon.art,
    }),
  );
  for (const [category, target] of Object.entries({
    levels: LEVELS,
    enemies: ENEMIES,
    plants: SEEDS,
    weather: WEATHER,
  })) {
    Object.assign(
      target,
      Object.fromEntries(prepared[category].map((definition) => [definition.id, definition])),
    );
  }
  Object.assign(
    BOONS,
    Object.fromEntries(automaticBoons.map((definition) => [definition.id, definition])),
  );
  UPGRADES.push(...prepared.buffs, ...automaticUpgrades);
  WEAPONS.push(...prepared.buffs.filter((definition) => definition.category === 'weapon'));
  return {
    ok: true,
    added: Object.fromEntries(
      Object.entries(prepared).map(([category, definitions]) => [category, definitions.length]),
    ),
    generated: { boons: automaticBoons.length, buffs: automaticUpgrades.length },
  };
}
