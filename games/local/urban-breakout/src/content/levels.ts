import { HZ, type Level, type Reward, type SupplyConfig, type Wave } from '../core/types.ts';
export const WEAPONS = {
  rifle: { name: '步枪', damage: 5, cooldown: 15, range: 23, radius: 0 },
  shotgun: { name: '霰弹枪', damage: 10, cooldown: 25, range: 11, radius: 0 },
  grenade: { name: '榴弹', damage: 22, cooldown: 48, range: 23, radius: 2.5 },
} as const;
export const ENEMIES = {
  walker: { hp: 30, speed: 1.65, damage: 6, cooldown: 28, score: 10 },
  runner: { hp: 25, speed: 4.5, damage: 9, cooldown: 20, score: 20 },
  shield: { hp: 80, speed: 1.1, damage: 10, cooldown: 30, score: 35 },
  boss: { hp: 720, speed: 0.55, damage: 12, cooldown: 42, score: 300 },
} as const;
const sec = (s: number) => Math.round(s * HZ);
const weapon = (weapon: 'grenade' | 'shotgun', count: number): Reward => ({
  kind: 'weapon',
  weapon,
  count,
});
const box = (
  id: string,
  name: string,
  side: -1 | 1,
  start: number,
  duration: number,
  damage: number,
  label: string,
  reward: Reward,
  hint: string,
  group?: string,
): SupplyConfig => ({
  id,
  name,
  side,
  start: sec(start),
  end: sec(start + duration),
  tiers: [{ damage, label, reward }],
  hint,
  group,
});
const waves: Wave[] = [
  { id: 'welcome', tick: sec(1), kind: 'walker', count: 4, z: -13 },
  { id: 'safe-box-cover', tick: sec(7), kind: 'walker', count: 3, z: -23 },
  { id: 'reward-payoff', tick: sec(17), kind: 'walker', count: 12, z: -15 },
  { id: 'temptation', tick: sec(25), kind: 'runner', count: 7, x: 3.2, z: -5 },
  { id: 'crossing', tick: sec(31), kind: 'walker', count: 7, z: -17 },
  { id: 'choice-pressure', tick: sec(40), kind: 'walker', count: 10, z: -18 },
  { id: 'shields', tick: sec(46), kind: 'shield', count: 3, z: -14 },
  { id: 'alley-runners', tick: sec(50), kind: 'runner', count: 4, x: -2.2, z: -19 },
  { id: 'tiers-pressure', tick: sec(58), kind: 'walker', count: 9, z: -19 },
  { id: 'last-crossing', tick: sec(65), kind: 'shield', count: 2, z: -17 },
  { id: 'street-boss', tick: sec(71), kind: 'boss', count: 1, z: -8 },
  { id: 'boss-escort', tick: sec(75), kind: 'walker', count: 8, z: -19 },
];
export const OLD_STREET: Level = {
  id: 'old-street-slice',
  title: '老街突围',
  subtitle: '01 / 榕树街 · 核心实战',
  seed: 1002,
  duration: sec(90),
  bossRequired: true,
  formation: true,
  waves,
  supplies: [
    box(
      'safe-weapon',
      '便利店武器柜',
      -1,
      6,
      8,
      360,
      '2 人装备榴弹',
      weapon('grenade', 2),
      '正面暂时安全 · 爆破能处理后续密集敌群',
    ),
    box(
      'risky-weapon',
      '街角武器柜',
      1,
      25,
      8,
      360,
      '2 人装备榴弹',
      weapon('grenade', 2),
      '冲刺者同时抵达 · 先回中路清理威胁',
    ),
    box(
      'rescue-lock',
      '公交站救援锁',
      -1,
      36,
      9,
      240,
      '救援 3 名队员',
      { kind: 'rescue', amount: 3 },
      '联动电源：救援 / 武器二选一',
      'bus-power',
    ),
    box(
      'bus-weapon',
      '公交武器柜',
      1,
      36,
      9,
      240,
      '3 人装备霰弹',
      weapon('shotgun', 3),
      '联动电源：武器 / 救援二选一',
      'bus-power',
    ),
    {
      id: 'tier-box',
      name: '三档应急补给',
      side: 1,
      start: sec(56),
      end: sec(64),
      hint: '低档落袋 · 基础 60 DPS 无法拿满 660',
      tiers: [
        { damage: 180, label: '护盾 +30', reward: { kind: 'shield', amount: 30 } },
        { damage: 420, label: '全员恢复 10', reward: { kind: 'heal', amount: 10 } },
        { damage: 660, label: '12 秒急速', reward: { kind: 'haste', amount: sec(12) } },
      ],
    },
    box(
      'scaffold',
      '吊架控制器',
      -1,
      77,
      8,
      180,
      '落物破甲 · Boss 受创',
      { kind: 'mechanism', amount: 240 },
      '转火触发落物 · 对 Boss 造成伤害并破甲',
    ),
  ],
};
// These are transparent test fixtures, never variants selected according to player strategy.
export const BALANCE_LEVELS: Level[] = [
  {
    ...OLD_STREET,
    id: 'A',
    title: '低压换取关键武器',
    duration: sec(27),
    bossRequired: false,
    supplies: [{ ...OLD_STREET.supplies[0], start: sec(1), end: sec(9) }],
    waves: [{ id: 'A-cluster', tick: sec(12), kind: 'walker', count: 24, z: -8 }],
  },
  {
    ...OLD_STREET,
    id: 'B',
    title: '冲刺者惩罚贪箱',
    duration: sec(18),
    bossRequired: false,
    supplies: [{ ...OLD_STREET.supplies[1], start: sec(1), end: sec(9) }],
    waves: [{ id: 'B-rush', tick: sec(2), kind: 'runner', count: 10, x: 2.7, z: -9 }],
  },
  {
    ...OLD_STREET,
    id: 'C',
    title: '低档落袋不追高档',
    duration: sec(15),
    bossRequired: false,
    supplies: [{ ...OLD_STREET.supplies[4], start: sec(1), end: sec(9) }],
    waves: [{ id: 'C-pressure', tick: sec(5), kind: 'runner', count: 6, x: 2.5, z: -9 }],
  },
];
export function validateLevel(level: Level): void {
  const ids = new Set<string>();
  if (!Number.isInteger(level.duration) || level.duration <= 0 || !Number.isInteger(level.seed))
    throw new Error('Invalid level clock / seed');
  for (const wave of level.waves) {
    if (
      ids.has(wave.id) ||
      !ENEMIES[wave.kind] ||
      !Number.isInteger(wave.tick) ||
      wave.tick < 1 ||
      wave.tick >= level.duration ||
      !Number.isInteger(wave.count) ||
      wave.count < 1 ||
      wave.count > 80 ||
      [wave.x, wave.z, wave.hp].some((v) => v !== undefined && !Number.isFinite(v)) ||
      (wave.hp !== undefined && wave.hp <= 0)
    )
      throw new Error(`Invalid wave ${wave.id}`);
    ids.add(wave.id);
  }
  for (const supply of level.supplies) {
    if (
      ids.has(supply.id) ||
      ![-1, 1].includes(supply.side) ||
      !Number.isInteger(supply.start) ||
      !Number.isInteger(supply.end) ||
      supply.start < 1 ||
      supply.end <= supply.start ||
      supply.end > level.duration ||
      !supply.tiers.length ||
      [supply.zStart, supply.zEnd].some((v) => v !== undefined && !Number.isFinite(v))
    )
      throw new Error(`Invalid supply ${supply.id}`);
    ids.add(supply.id);
    let last = 0;
    for (const tier of supply.tiers) {
      if (!Number.isFinite(tier.damage) || tier.damage <= last || !tier.label)
        throw new Error(`Non-increasing threshold ${supply.id}`);
      const reward = tier.reward;
      if (
        reward.kind === 'weapon'
          ? !WEAPONS[reward.weapon] || !Number.isInteger(reward.count) || reward.count <= 0
          : !['rescue', 'shield', 'heal', 'haste', 'mechanism'].includes(reward.kind) ||
            !Number.isFinite(reward.amount) ||
            reward.amount <= 0
      )
        throw new Error(`Invalid reward ${supply.id}`);
      last = tier.damage;
    }
  }
  if (level.bossRequired && !level.waves.some((w) => w.kind === 'boss'))
    throw new Error('Missing required Boss');
}
validateLevel(OLD_STREET);
