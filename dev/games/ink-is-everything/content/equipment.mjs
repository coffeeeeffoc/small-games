/** 同一装备最多三阶；modifiers 每一阶叠加一次，不另设金币。 */
export const EQUIPMENT = {
  'fine-nib': {
    id: 'fine-nib',
    name: '锋笔',
    maxRank: 3,
    price: 18,
    description: '每阶：墨弹伤害 +2，干笔伤害 +1。',
    modifiers: { attackDamage: 2, meleeDamage: 1 },
  },
  'backflow-amber': {
    id: 'backflow-amber',
    name: '回流珀',
    maxRank: 3,
    price: 18,
    description: '每阶：命中吸墨比例 +8 个百分点。',
    modifiers: { lifeSteal: 0.08 },
  },
  'ink-sac': {
    id: 'ink-sac',
    name: '墨囊',
    maxRank: 3,
    price: 24,
    description: '每阶：墨汁上限 +16，并立即补回新增的 16 墨汁。',
    modifiers: { maxInk: 16 },
  },
  'splash-sigil': {
    id: 'splash-sigil',
    name: '溅墨印',
    maxRank: 3,
    price: 20,
    description: '每阶：溅墨伤害 +4、范围 +18，冷却减少 0.35 秒。',
    modifiers: { novaDamage: 4, novaRadius: 18, novaCooldown: -0.35 },
  },
  'swift-boots': {
    id: 'swift-boots',
    name: '疾书靴',
    maxRank: 3,
    price: 16,
    description: '每阶：移动速度 +12，闪避冷却减少 0.1 秒。',
    modifiers: { speed: 12, dashCooldown: -0.1 },
  },
  'gather-ring': {
    id: 'gather-ring',
    name: '聚墨环',
    maxRank: 3,
    price: 18,
    description: '每阶：拾取范围 +8，技能墨滴返还比例 +8 个百分点（最高 80%）。',
    modifiers: { pickupRadius: 8, dropReturnRatio: 0.08 },
  },
};

export const EQUIPMENT_IDS = Object.keys(EQUIPMENT);
export const SHOP_ITEMS = EQUIPMENT_IDS.map((id) => ({
  id,
  itemId: id,
  price: EQUIPMENT[id].price,
}));
