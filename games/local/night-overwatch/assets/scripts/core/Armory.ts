export const MODS = {
  hePower: { name: ['榴弹威力', 'HE damage'], price: 300, tune: 600, prices: [300,600,1200], kind: 'passive' },
  heVelocity: { name: ['榴弹速度', 'HE velocity'], price: 300, tune: 600, prices: [300,600,1200], kind: 'passive' },
  heavyPower: { name: ['重炮威力', 'Heavy damage'], price: 300, tune: 600, prices: [300,600,1200], kind: 'passive' },
  heavyVelocity: { name: ['重炮速度', 'Heavy velocity'], price: 300, tune: 600, prices: [300,600,1200], kind: 'passive' },
  spread: { name: ['燃烧弹面积', 'Fire area'], price: 300, tune: 600, prices: [300,600,1200], kind: 'passive' },
  emp: { name: ['电磁打击', 'EMP strike'], price: 7900, tune: 10000, prices: [7900,10000,14000], kind: 'weapon' },
  duration: { name: ['长燃配方', 'Slow-burn mix'], price: 0, tune: 600, prices: [], kind: 'legacy' },
  coolant: { name: ['应急冷却剂', 'Emergency coolant'], price: 0, tune: 0, prices: [], kind: 'legacy' },
  // Legacy checkpoints remain readable; saved ownership migrates to separate weapon upgrades.
  power: { name: ['增压装药', 'Power charge'], price: 0, tune: 900, prices: [], kind: 'legacy' },
  velocity: { name: ['高速弹芯', 'High-velocity core'], price: 0, tune: 600, prices: [], kind: 'legacy' },
} as const;
export type ModId = keyof typeof MODS;
export type Tier = 1 | 2 | 3;
export type Loadout = readonly { readonly id: ModId; readonly tier: Tier; readonly trial?: true }[];
export type Owned = Partial<Record<ModId, Tier>>;
export type TrialStock = Partial<Record<string, number>>;
export const SHOP_IDS = ['hePower','heVelocity','heavyPower','heavyVelocity','spread','emp'] as const;
export const STARTER_OWNED: Owned = {hePower:1,heVelocity:1,heavyPower:1};
export const STARTER_LOADOUT: Loadout = [{id:'hePower',tier:1},{id:'heVelocity',tier:1},{id:'heavyPower',tier:1}];
export const LOTTERY: Loadout = SHOP_IDS.flatMap(id => MODS[id].prices.map((_,index)=>({id,tier:index+1 as Tier,trial:true as const})));
export const trialKey = (id:ModId,tier:Tier) => id+':'+tier;
export const empDuration = (tier:Tier) => [0,2.5,3.5,4.5][tier];
export const priceFor = (id:ModId,tier:number) => MODS[id].prices[tier-1] ?? 0;
export function maxTier(id:ModId):Tier {return (MODS[id].prices.length || (id==='coolant'?1:2)) as Tier;}
export function validLoadout(value: unknown): value is Loadout {
  if (!Array.isArray(value) || value.length > Object.keys(MODS).length) return false;
  const ids = new Set<ModId>();let weapons=0;
  for (const item of value) {
    if (!item || typeof item !== 'object' ||
      Object.keys(item).some(k=>!['id','tier','trial'].includes(k)) ||
      !Object.hasOwn(item, 'id') || !Object.hasOwn(item, 'tier') || typeof item.id !== 'string' ||
      !Object.hasOwn(MODS, item.id) || ids.has(item.id) ||
      !Number.isInteger(item.tier)||item.tier<1||item.tier>maxTier(item.id) ||
      (Object.hasOwn(item,'trial')&&(item.trial!==true||!SHOP_IDS.includes(item.id as typeof SHOP_IDS[number])))) return false;
    ids.add(item.id);if(MODS[item.id as ModId].kind==='weapon'&&++weapons>3)return false;
  }
  return true;
}
export function duelLoadout(loadout: Loadout): Loadout {
  if (!validLoadout(loadout) || loadout.some(mod => mod.id === 'coolant')) throw Error('Invalid duel loadout');
  return loadout.map(item => ({...item}));
}
export function modTier(loadout: Loadout, id: ModId): 0 | Tier {return loadout.find(item => item.id === id)?.tier ?? 0;}
export function migrateOwned(value: unknown):Owned {
  const result:Owned={};
  if(!value||typeof value!=='object')return result;
  for(const [id,tier] of Object.entries(value)){
    if(!Object.hasOwn(MODS,id)||!Number.isInteger(tier)||tier<1||tier>maxTier(id as ModId))continue;
    const targets:ModId[]=id==='power'?['hePower','heavyPower']:id==='velocity'?['heVelocity','heavyVelocity']:[id as ModId];
    for(const target of targets)result[target]=Math.max(result[target]||0,tier) as Tier;
  }return result;
}
export function resolvedLoadout(owned:Owned,coolant:number,extraWeapons:readonly ModId[],choices:Owned,stock:TrialStock):Loadout {
  const result:Loadout[number][]=[];
  for(const id of Object.keys(MODS) as ModId[]){
    if(id==='power'||id==='velocity')continue;
    if(id==='coolant'){if(coolant>0)result.push({id,tier:1});continue;}
    const permanent=owned[id]||0, chosen=choices[id]||0;
    if(MODS[id].kind==='weapon'&&!extraWeapons.includes(id))continue;
    const trial=chosen>permanent&&(stock[trialKey(id,chosen as Tier)]||0)>0;
    const tier=trial?chosen:permanent;
    if(tier)result.push({id,tier:tier as Tier,...(trial?{trial:true}: {})});
  }return result;
}
