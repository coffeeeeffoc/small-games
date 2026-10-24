import { LEVELS } from './levels.js';
import { DUEL_MAP, nodePoint } from './duel-map.js';
import { operatorPoint } from './duel-actions.js';
import { createDuel } from './duel-simulation.js';
import type { BotProfile } from './duel-bot.js';
import type { Duel } from './duel-types.js';

export interface CampaignLevel {
  id: string;
  name: string;
  chapter: number;
  hint: string;
  reward: number;
  enemyHp: number;
  medicines: [number, number];
  stations: ['ground' | 'wall' | 'bunker', 'ground' | 'wall' | 'bunker'];
  defenses: 'intact' | 'breach' | 'thin' | 'towers';
  armor: number;
  bot: BotProfile;
}
const tactics = [
  ['门前初战', '观察落点，修正角度和蓄力'],
  ['高台守军', '敌炮在城墙上，适当抬高落点'],
  ['城墙缺口', '利用缺口攻击敌方炮手'],
  ['薄墙突破', '实心弹先打开城墙'],
  ['坚固城楼', '避免只轰厚塔，观察炮手位置'],
  ['地堡守军', '敌城已毁，瞄准地堡射孔'],
  ['高台出击', '我方在高台，近远落点需要重调'],
  ['地堡反击', '我方只剩地堡炮，射界较窄'],
  ['换位追击', '敌人会换炮位，先观察再发射'],
  ['炮弹交锋', '趴下躲避来弹，冷却结束起身反击'],
] as const;

export const CAMPAIGN: CampaignLevel[] = Array.from({ length: 120 }, (_, index) => {
  const chapter = Math.floor(index / 10),
    tactic = index % 10,
    topic = tactics[tactic]!;
  return {
    id: LEVELS[index]?.id ?? `duel-campaign-${String(index + 1).padStart(3, '0')}-v1`,
    name: LEVELS[index]?.name ?? `${topic[0]} ${chapter + 1}`,
    chapter: chapter + 1,
    hint: topic[1],
    reward: LEVELS[index]?.reward ?? 4 + Math.floor(chapter / 3),
    enemyHp: 55 + chapter * 3 + tactic,
    medicines: [3, Math.floor(chapter / 4)],
    stations: [
      tactic === 6 ? 'wall' : tactic === 7 ? 'bunker' : 'ground',
      tactic === 1 || tactic === 4 ? 'wall' : tactic === 5 ? 'bunker' : 'ground',
    ],
    defenses: tactic === 2 ? 'breach' : tactic === 3 ? 'thin' : tactic === 4 ? 'towers' : 'intact',
    armor: 0.65 + chapter * 0.035,
    bot: {
      initialDelay: 8 - chapter * 0.25,
      reaction: 4.5 - chapter * 0.2,
      error: 8 - chapter * 0.4,
      correction: 0.15,
      structureEvery: tactic === 4 ? 3 : 5,
      relocateEvery: tactic === 8 ? 22 + chapter : 0,
      ammo: tactic === 9 ? 'solid' : 'mixed',
    },
  };
});

export function validateCampaign(levels: readonly CampaignLevel[]) {
  const ids = new Set<string>();
  for (const level of levels) {
    if (
      !level.id ||
      ids.has(level.id) ||
      !level.name ||
      !level.hint ||
      !Number.isInteger(level.chapter) ||
      level.chapter < 1 ||
      !Number.isInteger(level.reward) ||
      level.reward < 0 ||
      !Number.isFinite(level.enemyHp) ||
      level.enemyHp < 1 ||
      level.enemyHp > 100 ||
      !Number.isFinite(level.armor) ||
      level.armor <= 0 ||
      !['intact', 'breach', 'thin', 'towers'].includes(level.defenses)
    )
      throw new Error('Invalid campaign level');
    ids.add(level.id);
    if (
      level.stations.length !== 2 ||
      level.stations.some((id) => !DUEL_MAP.guns.some((gun) => gun.id === id)) ||
      level.medicines.length !== 2 ||
      level.medicines.some((n) => !Number.isInteger(n) || n < 0 || n > 3)
    )
      throw new Error('Invalid campaign resources');
    const b = level.bot;
    if (
      ![b.initialDelay, b.reaction, b.error, b.correction, b.structureEvery, b.relocateEvery].every(
        Number.isFinite,
      ) ||
      b.initialDelay < 0 ||
      b.reaction < 0.7 ||
      b.error < 0 ||
      b.correction < 0 ||
      !Number.isInteger(b.structureEvery) ||
      b.structureEvery < 1 ||
      b.relocateEvery < 0 ||
      !['solid', 'blast', 'mixed'].includes(b.ammo)
    )
      throw new Error('Invalid campaign bot');
  }
  return levels;
}

export function createCampaignDuel(level: CampaignLevel): Duel {
  const duel = createDuel();
  for (const side of [0, 1] as const) {
    const fighter = duel.fighters[side],
      station = level.stations[side];
    fighter.medicines = level.medicines[side];
    if (side === 1) fighter.hp = level.enemyHp;
    fighter.node = fighter.destination = fighter.station = station;
    const gun = fighter.guns.find((g) => g.id === station)!;
    fighter.position = operatorPoint(fighter, gun);
    if (station === 'bunker') {
      fighter.destroyed = true;
      for (const structure of duel.structures) if (structure.side === side) structure.hp = 0;
      for (const g of fighter.guns) if (!g.bunker) g.hp = 0;
    }
  }
  for (const structure of duel.structures.filter((s) => s.side === 1)) {
    structure.maxHp *=
      level.armor *
      (level.defenses === 'thin' && structure.kind === 'wall'
        ? 0.5
        : level.defenses === 'towers' && structure.kind === 'tower'
          ? 1.45
          : 1);
    if (structure.hp > 0) structure.hp = structure.maxHp;
    if (level.defenses === 'breach' && structure.kind === 'wall' && structure.position.z < 0)
      structure.hp = 0;
  }
  // Keep initial stations on their registered route, with ordinary gun rules unchanged.
  for (const fighter of duel.fighters)
    if (!fighter.station) fighter.position = nodePoint(fighter.side, 'ground');
  return duel;
}
validateCampaign(CAMPAIGN);
