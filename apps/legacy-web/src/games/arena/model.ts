export type Trait = {
  name: string;
  icon: string;
  attack: number;
  hp: number;
  speed: number;
  desc: string;
};
export type Creature = {
  id: string;
  species: string;
  emoji: string;
  attack: number;
  hp: number;
  speed: number;
  traits: Trait[];
};
export const traitPool: Trait[] = [
  { name: '过载核心', icon: '⚡', attack: 8, hp: -4, speed: 0.3, desc: '攻击更快，但有点漏电' },
  { name: '合金饭盆', icon: '🥣', attack: 1, hp: 18, speed: -0.1, desc: '谁也不能打翻它的饭' },
  { name: '喷火腺体', icon: '🔥', attack: 11, hp: 0, speed: 0, desc: '每口气都很有杀伤力' },
  { name: '量子鸡腿', icon: '🍗', attack: 4, hp: 6, speed: 0.25, desc: '同时存在于饿与不饿之间' },
  { name: '反伤尖刺', icon: '📌', attack: 5, hp: 9, speed: -0.1, desc: '拥抱它需要一点勇气' },
  { name: '暴躁马达', icon: '💢', attack: 7, hp: 2, speed: 0.4, desc: '安静不在设计指标里' },
];
const species = [
  ['赛博鸡', '🐔'],
  ['朋克鹅', '🪿'],
  ['加班水豚', '🦫'],
  ['机械柴犬', '🐕'],
];
export function hatch(seed = Math.random()): Creature {
  const s = species[Math.floor(seed * species.length) % species.length];
  return {
    id: `${Date.now()}-${seed}`,
    species: s[0],
    emoji: s[1],
    attack: 10 + Math.floor(seed * 8),
    hp: 48 + Math.floor(seed * 20),
    speed: 1 + Math.round(seed * 4) / 10,
    traits: [],
  };
}
export function mutate(c: Creature, t: Trait): Creature {
  return {
    ...c,
    attack: Math.max(1, c.attack + t.attack),
    hp: Math.max(1, c.hp + t.hp),
    speed: Math.max(0.3, +(c.speed + t.speed).toFixed(2)),
    traits: [...c.traits, t],
  };
}
export function power(c: Creature) {
  return Math.round(c.attack * c.speed * 2 + c.hp + c.traits.length * 5);
}
const rivals = [
  ['纸箱拳王', '🐈'],
  ['食堂霸主', '🦆'],
  ['赛博保安', '🦍'],
  ['量子猛男', '🦈'],
  ['最终老板', '🐲'],
];
export function enemyFor(c: Creature, tier = 0): Creature {
  const e = hatch((c.attack * 0.137 + c.hp * 0.031 + tier * 0.11) % 1),
    r = rivals[Math.min(4, tier)];
  let rival: {
    id: string;
    species: string;
    emoji: string;
    attack: number;
    hp: number;
    speed: number;
    traits: Trait[];
  } = {
    ...e,
    species: r[0],
    emoji: r[1],
    attack: 9 + tier * 7,
    hp: 46 + tier * 16,
    speed: 1 + tier * 0.12,
    traits: [],
  };
  for (let i = 0; i < Math.min(3, tier); i++)
    rival = mutate(rival, traitPool[(tier + i + 2) % traitPool.length]);
  return rival;
}
