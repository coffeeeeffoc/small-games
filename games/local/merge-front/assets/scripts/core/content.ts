export type Kind = 'hero' | 'weapon';
export type Special = 'guard' | 'pierce' | 'chain' | 'slow' | 'shield' | 'siege' | 'heal';
export interface Spec {
  id: string;
  name: string;
  kind: Kind;
  cost: number;
  parts: string[];
  atlas: number;
  unlock: number;
  role: string;
  skill: string;
  hp: number;
  damage: number;
  range: number;
  speed: number;
  interval: number;
  production: number;
  splash?: number;
  special?: Special;
}
export interface AIConfig {
  decisionTicks: number;
  warmupTicks: number;
  reserve: number;
  style: 'expand' | 'focus' | 'balanced' | 'counter';
  deck: string[];
}
export interface Chapter {
  id: number;
  title: string;
  scene: string;
}
export interface Level {
  id: string;
  number: number;
  chapter: number;
  title: string;
  previous: string | null;
  allowed: string[];
  unlocks: string[];
  ai: AIConfig;
  initialCoins: number;
  income: number;
  crystalHp: number;
  scene: string;
  medals: { health: number; seconds: number };
}
export const CONTENT_VERSION = 2;
export const TRAITS = [
  {
    id: 'flame',
    name: '烈焰',
    color: '#ed704c',
    description: '2名：攻击+12%；4名：仍+12%，溅射副伤提高至75%。',
    keys: ['nezha', 'wukong', 'fire', 'cannon'],
  },
  {
    id: 'thunder',
    name: '雷霆',
    color: '#deb95e',
    description: '2/4名：攻击速度+12%/25%。',
    keys: ['erlang', 'leizhen', 'drone', 'crossbow'],
  },
  {
    id: 'armor',
    name: '玄甲',
    color: '#77a6c2',
    description: '2/4名：生命+18%/35%。',
    keys: ['juling', 'tianwang', 'guard', 'ram'],
  },
  {
    id: 'spirit',
    name: '灵泽',
    color: '#83cfae',
    description: '2名：开战12%护盾；4名：开战距另一灵泽125以内获24%，否则12%。',
    keys: ['change', 'xuannv', 'frost', 'lantern'],
  },
];
export function getTrait(key: string) {
  const trait = TRAITS.find((t) => t.id === key || t.keys.includes(key));
  if (!trait) throw new Error('Unknown trait: ' + String(key));
  return trait;
}
export const SPELLS = [
  { id: 'sharpen', name: '磨刃', cost: 2, description: '己方场上单位永久+5攻击。' },
  { id: 'fortify', name: '锻体', cost: 2, description: '己方场上单位永久+35生命。' },
  { id: 'ward', name: '护符', cost: 2, description: '己方场上单位下一场+30%生命护盾，不叠加。' },
  { id: 'inspire', name: '鼓舞', cost: 3, description: '本场全军攻击+12%，每轮一次。' },
];
export interface Starter {
  id: string;
  name: string;
  keys: [string, string];
}
export const STARTERS: Starter[] = [
  { id: 'flame', name: '烈焰初阵', keys: ['nezha', 'fire'] },
  { id: 'thunder', name: '雷霆初阵', keys: ['erlang', 'drone'] },
  { id: 'armor', name: '玄甲初阵', keys: ['juling', 'guard'] },
  { id: 'spirit', name: '灵泽初阵', keys: ['change', 'frost'] },
  { id: 'guard-fire', name: '巨灵火铳', keys: ['juling', 'fire'] },
  { id: 'lotus-drone', name: '火莲巡天', keys: ['nezha', 'drone'] },
  { id: 'eye-guard', name: '天眼护阵', keys: ['erlang', 'guard'] },
  { id: 'moon-ram', name: '月下破城', keys: ['change', 'ram'] },
];
export function starterChoices(seed: number): Starter[] {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid seed');
  let rng = seed >>> 0;
  const pick = (n: number) => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return Math.floor((rng / 4294967296) * n);
  };
  const chosen = [STARTERS[pick(4)], STARTERS[4 + pick(4)]];
  const remaining = STARTERS.filter((s) => !chosen.includes(s));
  chosen.push(remaining[pick(remaining.length)]);
  return chosen.map((s) => ({ ...s, keys: [...s.keys] }));
}

export const CATALOG: Spec[] = [
  {
    id: 'nezha',
    cost: 0,
    name: '哪吒',
    kind: 'hero',
    parts: ['哪', '吒'],
    atlas: 0,
    unlock: 0,
    role: '中近程群攻',
    skill: '三昧火莲',
    hp: 230,
    damage: 27,
    range: 62,
    speed: 62,
    interval: 0.9,
    production: 8,
    splash: 36,
  },
  {
    id: 'juling',
    cost: 3,
    name: '巨灵神',
    kind: 'hero',
    parts: ['巨', '灵', '神'],
    atlas: 1,
    unlock: 3,
    role: '前排承伤',
    skill: '巨斧格挡',
    hp: 380,
    damage: 28,
    range: 30,
    speed: 46,
    interval: 1.25,
    production: 10,
    special: 'guard',
  },
  {
    id: 'erlang',
    cost: 3,
    name: '杨戬',
    kind: 'hero',
    parts: ['杨', '戬'],
    atlas: 2,
    unlock: 8,
    role: '远程单体',
    skill: '三目穿云',
    hp: 170,
    damage: 37,
    range: 165,
    speed: 52,
    interval: 1.2,
    production: 9,
    special: 'pierce',
  },
  {
    id: 'wukong',
    cost: 4,
    name: '孙悟空',
    kind: 'hero',
    parts: ['孙', '悟', '空'],
    atlas: 3,
    unlock: 13,
    role: '近战破阵',
    skill: '金箍横扫',
    hp: 390,
    damage: 46,
    range: 40,
    speed: 65,
    interval: 1.1,
    production: 10,
    splash: 65,
  },
  {
    id: 'leizhen',
    cost: 3,
    name: '雷震子',
    kind: 'hero',
    parts: ['雷', '震', '子'],
    atlas: 4,
    unlock: 17,
    role: '快速支援',
    skill: '连锁雷击',
    hp: 260,
    damage: 32,
    range: 100,
    speed: 88,
    interval: 1,
    production: 9,
    special: 'chain',
  },
  {
    id: 'change',
    cost: 3,
    name: '嫦娥',
    kind: 'hero',
    parts: ['嫦', '娥'],
    atlas: 5,
    unlock: 20,
    role: '减速控制',
    skill: '月轮霜域',
    hp: 280,
    damage: 34,
    range: 155,
    speed: 53,
    interval: 1.1,
    production: 9,
    splash: 42,
    special: 'slow',
  },
  {
    id: 'tianwang',
    cost: 4,
    name: '托塔天王',
    kind: 'hero',
    parts: ['托', '塔', '天', '王'],
    atlas: 6,
    unlock: 22,
    role: '稳定推进',
    skill: '宝塔护持',
    hp: 540,
    damage: 44,
    range: 72,
    speed: 43,
    interval: 1.35,
    production: 11,
    splash: 45,
    special: 'shield',
  },
  {
    id: 'xuannv',
    cost: 4,
    name: '九天玄女',
    kind: 'hero',
    parts: ['九', '天', '玄', '女'],
    atlas: 7,
    unlock: 27,
    role: '阵容辅助',
    skill: '玄符护阵',
    hp: 320,
    damage: 38,
    range: 160,
    speed: 54,
    interval: 1.1,
    production: 10,
    special: 'shield',
  },
  {
    id: 'fire',
    cost: 3,
    name: '离火铳',
    kind: 'weapon',
    parts: ['离', '火', '铳'],
    atlas: 8,
    unlock: 0,
    role: '近程群伤',
    skill: '流焰喷射',
    hp: 240,
    damage: 23,
    range: 110,
    speed: 49,
    interval: 0.8,
    production: 9,
    splash: 46,
  },
  {
    id: 'drone',
    cost: 3,
    name: '巡天机',
    kind: 'weapon',
    parts: ['巡', '天', '机'],
    atlas: 9,
    unlock: 5,
    role: '灵活点射',
    skill: '飞羽连射',
    hp: 180,
    damage: 23,
    range: 175,
    speed: 76,
    interval: 0.65,
    production: 8,
  },
  {
    id: 'cannon',
    cost: 4,
    name: '震雷炮',
    kind: 'weapon',
    parts: ['震', '雷', '炮'],
    atlas: 10,
    unlock: 10,
    role: '范围打击',
    skill: '震雷爆破',
    hp: 270,
    damage: 76,
    range: 195,
    speed: 38,
    interval: 2.1,
    production: 11,
    splash: 76,
  },
  {
    id: 'frost',
    cost: 3,
    name: '寒霜轮',
    kind: 'weapon',
    parts: ['寒', '霜', '轮'],
    atlas: 11,
    unlock: 15,
    role: '减速压制',
    skill: '冰轮凝霜',
    hp: 350,
    damage: 34,
    range: 98,
    speed: 60,
    interval: 1,
    production: 9,
    splash: 48,
    special: 'slow',
  },
  {
    id: 'crossbow',
    cost: 3,
    name: '雷鸣弩',
    kind: 'weapon',
    parts: ['雷', '鸣', '弩'],
    atlas: 12,
    unlock: 19,
    role: '直线穿透',
    skill: '贯阵雷矢',
    hp: 220,
    damage: 43,
    range: 185,
    speed: 44,
    interval: 1.15,
    production: 10,
    special: 'pierce',
  },
  {
    id: 'guard',
    cost: 3,
    name: '护阵车',
    kind: 'weapon',
    parts: ['护', '阵', '车'],
    atlas: 13,
    unlock: 24,
    role: '机关前排',
    skill: '铜甲反击',
    hp: 420,
    damage: 24,
    range: 38,
    speed: 40,
    interval: 1.25,
    production: 11,
    special: 'guard',
  },
  {
    id: 'ram',
    cost: 3,
    name: '破城锤',
    kind: 'weapon',
    parts: ['破', '城', '锤'],
    atlas: 14,
    unlock: 25,
    role: '抗压攻晶',
    skill: '破城重击',
    hp: 500,
    damage: 38,
    range: 36,
    speed: 42,
    interval: 1.3,
    production: 11,
    special: 'siege',
  },
  {
    id: 'lantern',
    cost: 3,
    name: '回春灯',
    kind: 'weapon',
    parts: ['回', '春', '灯'],
    atlas: 15,
    unlock: 29,
    role: '辅助续航',
    skill: '春辉回生',
    hp: 230,
    damage: 20,
    range: 140,
    speed: 50,
    interval: 1,
    production: 10,
    special: 'heal',
  },
];
export const CHAPTERS: Chapter[] = [
  { id: 1, title: '云台初阵', scene: 'cloud' },
  { id: 2, title: '山海交锋', scene: 'mountain' },
  { id: 3, title: '天门破阵', scene: 'gate' },
  { id: 4, title: '雷泽争锋', scene: 'thunder' },
  { id: 5, title: '灵城攻守', scene: 'city' },
  { id: 6, title: '神机会战', scene: 'heaven' },
];
function level(
  number: number,
  title: string,
  decisionTicks: number,
  warmupTicks: number,
  style: AIConfig['style'],
  deck: string[],
  health: number,
  seconds: number,
): Level {
  const chapter = Math.ceil(number / 5);
  return {
    id: `level-${String(number).padStart(2, '0')}`,
    number,
    chapter,
    title,
    previous: number === 1 ? null : `level-${String(number - 1).padStart(2, '0')}`,
    allowed: CATALOG.map((s) => s.id),
    unlocks: CATALOG.filter((s) => s.unlock === number).map((s) => s.id),
    ai: { decisionTicks, warmupTicks, style, deck, reserve: style === 'counter' ? 30 : 0 },
    initialCoins: 6,
    income: 6,
    crystalHp: 30,
    scene: CHAPTERS[chapter - 1].scene,
    medals: { health, seconds },
  };
}
export const LEVELS: Level[] = [
  level(1, '合字攻晶', 100, 600, 'expand', ['nezha', 'fire'], 0.5, 240),
  level(2, '升级选择', 80, 300, 'focus', ['nezha', 'fire'], 0.55, 230),
  level(3, '前排试炼', 70, 220, 'expand', ['nezha', 'fire'], 0.6, 220),
  level(4, '前后协作', 60, 200, 'balanced', ['juling', 'nezha', 'fire'], 0.5, 240),
  level(5, '云台守将', 55, 180, 'expand', ['juling', 'nezha', 'fire'], 0.6, 240),
  level(6, '飞机关隘', 52, 160, 'expand', ['nezha', 'fire', 'drone'], 0.5, 240),
  level(7, '双阵取舍', 50, 160, 'focus', ['juling', 'fire', 'drone'], 0.5, 250),
  level(8, '山海先锋', 48, 140, 'balanced', ['nezha', 'juling', 'drone'], 0.55, 240),
  level(9, '天眼瞭望', 46, 140, 'counter', ['erlang', 'juling', 'fire'], 0.5, 250),
  level(10, '重关合围', 44, 140, 'balanced', ['erlang', 'juling', 'fire', 'drone'], 0.55, 250),
  level(11, '炮火初鸣', 42, 120, 'expand', ['juling', 'nezha', 'cannon'], 0.5, 260),
  level(12, '分散阵势', 40, 120, 'counter', ['erlang', 'nezha', 'drone', 'cannon'], 0.55, 250),
  level(13, '破阵石门', 40, 120, 'focus', ['juling', 'erlang', 'cannon'], 0.5, 260),
  level(14, '金箍横扫', 38, 120, 'expand', ['wukong', 'nezha', 'drone'], 0.5, 250),
  level(
    15,
    '天门总攻',
    38,
    100,
    'balanced',
    ['wukong', 'juling', 'erlang', 'fire', 'cannon'],
    0.6,
    260,
  ),
  level(16, '霜轮缓进', 36, 100, 'counter', ['wukong', 'erlang', 'frost'], 0.5, 260),
  level(17, '疾雷前夜', 36, 100, 'expand', ['nezha', 'erlang', 'drone', 'frost'], 0.55, 250),
  level(18, '雷翼增援', 34, 100, 'expand', ['leizhen', 'juling', 'frost', 'drone'], 0.5, 260),
  level(19, '贯阵试锋', 34, 100, 'focus', ['leizhen', 'wukong', 'cannon'], 0.5, 260),
  level(
    20,
    '雷泽会师',
    32,
    100,
    'counter',
    ['leizhen', 'erlang', 'juling', 'crossbow', 'frost'],
    0.6,
    270,
  ),
  level(21, '月轮守城', 32, 100, 'counter', ['change', 'wukong', 'crossbow', 'fire'], 0.5, 260),
  level(
    22,
    '灵城突破',
    30,
    100,
    'balanced',
    ['change', 'leizhen', 'juling', 'cannon', 'frost'],
    0.5,
    270,
  ),
  level(23, '宝塔护持', 30, 100, 'expand', ['tianwang', 'erlang', 'crossbow', 'fire'], 0.55, 270),
  level(24, '铜甲重围', 30, 100, 'focus', ['tianwang', 'wukong', 'cannon', 'drone'], 0.5, 280),
  level(
    25,
    '灵城决战',
    28,
    100,
    'counter',
    ['tianwang', 'change', 'leizhen', 'guard', 'crossbow'],
    0.6,
    280,
  ),
  level(26, '破城窗口', 28, 100, 'expand', ['juling', 'erlang', 'ram', 'fire'], 0.5, 280),
  level(
    27,
    '玄符试炼',
    28,
    100,
    'balanced',
    ['tianwang', 'wukong', 'change', 'ram', 'frost'],
    0.55,
    280,
  ),
  level(
    28,
    '护盾连阵',
    26,
    100,
    'counter',
    ['xuannv', 'leizhen', 'juling', 'guard', 'crossbow'],
    0.5,
    290,
  ),
  level(
    29,
    '春灯前哨',
    26,
    100,
    'focus',
    ['xuannv', 'tianwang', 'wukong', 'ram', 'drone'],
    0.5,
    290,
  ),
  level(
    30,
    '神机会战',
    24,
    100,
    'counter',
    ['xuannv', 'tianwang', 'erlang', 'lantern', 'ram'],
    0.6,
    300,
  ),
];

export function getSpec(id: string): Spec {
  const spec = CATALOG.find((s) => s.id === id);
  if (!spec) throw new Error(`Unknown recipe: ${String(id)}`);
  return spec;
}
export function validateContent(): string[] {
  const errors: string[] = [];
  if (
    CATALOG.length !== 16 ||
    CATALOG.filter((s) => s.kind === 'hero').length !== 8 ||
    CATALOG.filter((s) => s.kind === 'weapon').length !== 8 ||
    CHAPTERS.length !== 6 ||
    LEVELS.length !== 30
  )
    errors.push('content counts');
  if (new Set(CHAPTERS.map((c) => c.id)).size !== CHAPTERS.length) errors.push('duplicate chapter');
  const ids = new Set<string>();
  const atlases = new Set<number>();
  const rewards = new Set<string>();
  for (const s of CATALOG) {
    if (
      s.cost !==
      (s.id === 'nezha' ? 0 : ['wukong', 'tianwang', 'xuannv', 'cannon'].includes(s.id) ? 4 : 3)
    )
      errors.push(`cost: ${s.id}`);
    if (TRAITS.filter((t) => t.keys.includes(s.id)).length !== 1) errors.push(`trait: ${s.id}`);
    if (ids.has(s.id) || !/^[a-z]+$/.test(s.id)) errors.push(`recipe id: ${s.id}`);
    ids.add(s.id);
    if (atlases.has(s.atlas) || !Number.isInteger(s.atlas) || s.atlas < 0 || s.atlas >= 16)
      errors.push(`atlas: ${s.id}`);
    atlases.add(s.atlas);
    if (
      !s.parts.length ||
      s.parts.join('') !== s.name ||
      s.parts.some((p) => typeof p !== 'string' || !p)
    )
      errors.push(`parts: ${s.id}`);
    if (
      !['hero', 'weapon'].includes(s.kind) ||
      !Number.isInteger(s.unlock) ||
      s.unlock < 0 ||
      s.unlock >= LEVELS.length
    )
      errors.push(`unlock/kind: ${s.id}`);
    if (
      [s.hp, s.damage, s.range, s.speed, s.interval, s.production].some(
        (n) => !Number.isFinite(n) || n <= 0,
      )
    )
      errors.push(`stats: ${s.id}`);
  }
  const levelIds = new Set<string>();
  for (const [i, l] of LEVELS.entries()) {
    if (l.number !== i + 1 || levelIds.has(l.id) || l.previous !== (i ? LEVELS[i - 1].id : null))
      errors.push(`level graph: ${l.id}`);
    levelIds.add(l.id);
    if (
      !CHAPTERS.some((c) => c.id === l.chapter && c.scene === l.scene) ||
      l.chapter !== Math.ceil(l.number / 5)
    )
      errors.push(`chapter: ${l.id}`);
    if (
      l.allowed.length !== CATALOG.length ||
      l.allowed.some((id) => !ids.has(id)) ||
      !['nezha', 'fire'].every((id) => l.allowed.includes(id))
    )
      errors.push(`allowed: ${l.id}`);
    if (
      new Set(l.ai.deck).size !== l.ai.deck.length ||
      l.ai.deck.some((id) => !l.allowed.includes(id)) ||
      ['hero', 'weapon'].some((kind) => {
        const n = l.ai.deck.filter((id) => ids.has(id) && getSpec(id).kind === kind).length;
        return n < 1 || n > (kind === 'hero' ? 3 : 2);
      })
    )
      errors.push(`AI deck: ${l.id}`);
    if (
      ![l.ai.decisionTicks, l.ai.warmupTicks, l.initialCoins, l.income, l.crystalHp].every(
        (n) => Number.isSafeInteger(n) && n > 0,
      ) ||
      !['expand', 'focus', 'balanced', 'counter'].includes(l.ai.style)
    )
      errors.push(`economy/AI: ${l.id}`);
    if (!(l.medals.health >= 0 && l.medals.health <= 1 && l.medals.seconds > 0))
      errors.push(`medals: ${l.id}`);
    for (const id of l.unlocks) {
      if (!ids.has(id) || rewards.has(id) || getSpec(id).unlock !== l.number)
        errors.push(`reward: ${l.id}:${id}`);
      rewards.add(id);
    }
  }
  for (const s of CATALOG)
    if (s.unlock > 0 && !rewards.has(s.id)) errors.push(`missing reward: ${s.id}`);
  return errors;
}
