export const MODS = {
  power: { name: ['增压装药', 'Power charge'], price: 0, tune: 900 },
  velocity: { name: ['高速弹芯', 'High-velocity core'], price: 0, tune: 600 },
  duration: { name: ['长燃配方', 'Slow-burn mix'], price: 0, tune: 600 },
  spread: { name: ['扩散喷口', 'Wide dispersal'], price: 300, tune: 750 },
  emp: { name: ['电磁脉冲', 'Electromagnetic pulse'], price: 1200, tune: 0 },
  coolant: { name: ['应急冷却剂', 'Emergency coolant'], price: 80, tune: 0 },
} as const;
export type ModId = keyof typeof MODS;
export type Loadout = readonly { readonly id: ModId; readonly tier: 1 | 2 }[];
export const STARTER_LOADOUT: Loadout = [{ id: 'power', tier: 1 }, { id: 'velocity', tier: 1 }, { id: 'duration', tier: 1 }];
export function validLoadout(value: unknown): value is Loadout {
  if (!Array.isArray(value) || value.length > 3) return false;
  const ids = new Set<ModId>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Object.keys(item).length !== 2 ||
      !Object.hasOwn(item, 'id') || !Object.hasOwn(item, 'tier') || typeof item.id !== 'string' ||
      !Object.hasOwn(MODS, item.id) || ids.has(item.id) ||
      !(item.tier === 1 || item.tier === 2 && MODS[item.id as ModId].tune > 0)) return false;
    ids.add(item.id);
  }
  return true;
}
export function duelLoadout(loadout: Loadout): Loadout {
  if (!validLoadout(loadout) || loadout.some(mod => mod.id === 'coolant')) throw Error('Invalid duel loadout');
  return loadout.map(({ id }) => ({ id, tier: 1 }));
}
export function modTier(loadout: Loadout, id: ModId): 0 | 1 | 2 {
  return loadout.find(item => item.id === id)?.tier ?? 0;
}
