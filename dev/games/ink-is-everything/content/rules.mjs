import { EQUIPMENT_IDS } from './equipment.mjs';
import { SKILLS } from './skills.mjs';

/** 技能数值只定义一次；章节覆写技能后重新推导引擎所需的扁平属性。 */
export function skillRules(skills = SKILLS) {
  return {
    attackCost: skills.shot.cost,
    attackDamage: skills.shot.damage,
    attackCooldown: skills.shot.cooldown,
    novaCost: skills.nova.cost,
    novaDamage: skills.nova.damage,
    novaRadius: skills.nova.radius,
    novaCooldown: skills.nova.cooldown,
    meleeDamage: skills.melee.damage,
    meleeRange: skills.melee.range,
    meleeCooldown: skills.melee.cooldown,
    dashCooldown: skills.dash.cooldown,
    dashDuration: skills.dash.duration,
    dashInvuln: skills.dash.invulnerability,
  };
}

/** 核心数值来自共用规则；生命与墨水只由 ink/maxInk 表达。 */
export const RULES = {
  ...skillRules(),
  speed: 222,
  lifeSteal: 0.25,
  killRestore: 6,
  minInkAfterSpend: 1,
  dropReturnRatio: 0.5,
  maxDropReturnRatio: 0.8,
  dropArmTime: 0.5,
  dropLifetime: 12,
  dropDistanceMin: 80,
  dropDistanceMax: 110,
  pickupRadius: 26,
};

export const PROGRESSION = {
  baseNextXp: 12,
  xpGrowth: 8,
  maxInkPerLevel: 8,
  inkPerLevel: 8,
  choiceCount: 3,
  rewardPool: EQUIPMENT_IDS,
  fallbackInk: 6,
};
