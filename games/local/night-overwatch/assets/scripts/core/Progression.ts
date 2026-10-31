export const GROWTH_VERSION = 'night-growth-v1';
export type Effect = 'power' | 'rate' | 'burst' | 'twin' | 'radius' | 'cooling' | 'drone' | 'laser' | 'tracking' | 'emp';
export type Loadout = { mods: string[]; weapon: string | null; skill: string | null };
export type BattleLoadout = { version: string; level: number; effects: Effect[]; skipped: string[] };
export type Product = { id: string; effect: Effect; category: 'mod' | 'weapon' | 'skill'; term: 'match' | '24h' | 'permanent'; price: number; sell: number; rarity: number; name: string; description: string; goldOnly: boolean };
export type AssetReward = { coins:number; xp:number; packs?:number; permanent?:string };
export type AssetTask = {id:string;day:string;name:string;event:string;target:number;progress:number;reward:AssetReward;claimed:boolean;alternate?:boolean};
export type AssetMail = {id:string;title:string;body:string;createdAt:number;read:boolean;claimed:boolean;reward:AssetReward};
export type VideoOrder = {id:string;quantity:number;required:number;completed:number;delivered:boolean;version:string;createdAt:number;attempt?:{id:string;startedAt:number}};
export type OpenReceipt = {requestId:string;at:number;item:string;quantity:number;drops:Array<{item?:string;coins?:number}>};
export type AssetSnapshot = {
  playerId:string;version:number;coins:number;xp:number;level:number;current:number;required:number;revision:number;
  inventory:Record<string,number>;available:Record<string,number>;permanent:string[];active:Record<string,number>;
  loadouts:{solo:Loadout;duel:Loadout};tasks:AssetTask[];
  achievements:Array<{id:string;name:string;event:string;target:number;progress:number;claimed:boolean;reward:AssetReward}>;
  mail:AssetMail[];announcements:Array<{id:string;title:string;body:string;createdAt:number}>;
  videoOrders:VideoOrder[];signedDays:string[];signedToday:boolean;day:string;serverNow:number;
  videoDailyLimit:number;videosToday:number;catalog:Product[];packages:typeof PACKAGES;pools:typeof POOLS;
  quoteVersion:string;adVerification:string;legacyPreserved:boolean;lastReceipt?:Record<string,unknown>;
  openReceipts?:OpenReceipt[];
};
export type AssetCommand = {requestId:string}&(
  {kind:'buy';item:string;quantity?:number}|{kind:'checkin'}|{kind:'buy-packs';quantity:number;pool?:'general'|'gold'}|
  {kind:'ad-order';quantity:number}|{kind:'ad-start';orderId:string}|{kind:'ad-complete';orderId:string;attemptId:string}|
  {kind:'open'|'sell';item:string;quantity:number}|{kind:'activate';item:string}|
  {kind:'loadout';mode:'solo'|'duel';loadout:Loadout}|{kind:'claim-task'|'alternate-task';taskId:string}|
  {kind:'claim-all'}|{kind:'read-mail'|'claim-mail';mailId:string}|{kind:'claim-achievement';achievementId:string});
const effects: Array<[Effect, Product['category'], string, string, number, number, boolean]> = [
  ['power', 'mod', '威力增益', '普通武器威力提高 15%。', 160, 1, false],
  ['rate', 'mod', '高速供弹', '普通武器攻击间隔缩短 12%。', 180, 1, false],
  ['burst', 'mod', '两连发', '连续发射 2 次，每发独立消耗弹药和热量。', 1200, 3, true],
  ['twin', 'mod', '双弹道', '每次发射双弹道，可与两连发组合为 4 发。', 1500, 3, true],
  ['radius', 'mod', '范围增益', '榴弹与燃烧弹有效半径提高 15%。', 220, 2, false],
  ['cooling', 'mod', '冷却改装', '普通武器热量降低 15%，不改变技能冷却。', 180, 1, false],
  ['drone', 'weapon', '无人机机群', '有限寿命与伤害预算，自动攻击并减速合法敌人。', 600, 2, false],
  ['laser', 'weapon', '激光武器', '视线内即时命中；长冷却、有限弹药。', 800, 2, false],
  ['tracking', 'skill', '追踪资格', '普通武器追踪 60 秒，结束后冷却 90 秒。', 300, 1, false],
  ['emp', 'skill', '电磁干扰', '敌方地面单位定身 4 秒，结束后冷却 45 秒。', 400, 2, false],
];
export const CATALOG: Product[] = effects.flatMap(([effect, category, name, description, price, rarity, goldOnly]) =>
  (['match', '24h', 'permanent'] as const).map(term => ({ id: `${effect}-${term}`, effect, category, term,
    name, description, price: price * (term === 'match' ? 1 : term === '24h' ? 8 : 40),
    sell: Math.floor(price * (term === 'match' ? .08 : term === '24h' ? .64 : 0)), rarity, goldOnly })));
export const PACKAGES = [
  { quantity: 1, coins: 200, videos: 1 }, { quantity: 3, coins: 570, videos: 2 },
  { quantity: 5, coins: 900, videos: 3 }, { quantity: 10, coins: 1700, videos: 6 },
  { quantity: 20, coins: 3200, videos: 12 },
];
export const SKILLS = { tracking: { duration: 60, cooldown: 90, level: 6 }, emp: { duration: 4, cooldown: 45, immunity: 8, level: 10 } };
export const POOLS = {
  general: { name: '通用补给箱', packSell:40, weights: [60, 25, 12, 3], coinDrops:[10,20,40,80], minimumRecycle:[10,12,17,80], effects: ['power','rate','radius','cooling','drone','laser','tracking','emp'] },
  gold: { name: '金币军需箱', packSell:40, weights: [60, 25, 12, 3], coinDrops:[10,20,40,80], minimumRecycle:[10,12,17,80], effects: ['power','rate','radius','cooling','drone','laser','tracking','emp','burst','twin'] },
};
export function levelProgress(xp: number) {
  const total = Math.max(0, Math.floor(xp)); let level = 1, floor = 0;
  while (level < 50 && total >= floor + level * 200) { floor += level * 200; level++; }
  return { level, current: total - floor, required: level * 200 };
}
export const emptyLoadout = (): Loadout => ({ mods: [], weapon: null, skill: null });
export function validLoadout(value: unknown): value is Loadout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Loadout;
  if (Object.keys(v).sort().join(',') !== 'mods,skill,weapon' || !Array.isArray(v.mods) || v.mods.length > 2) return false;
  const ids = [...v.mods, ...[v.weapon, v.skill].filter((id): id is string => id !== null)];
  if (ids.some(id => typeof id !== 'string')) return false;
  const products = ids.map(id => CATALOG.find(p => p.id === id));
  return products.every(Boolean) && new Set(products.map(p => p!.effect)).size === ids.length &&
    v.mods.every(id => CATALOG.some(p => p.id === id && p.category === 'mod')) &&
    (v.weapon === null || CATALOG.some(p => p.id === v.weapon && p.category === 'weapon')) &&
    (v.skill === null || CATALOG.some(p => p.id === v.skill && p.category === 'skill'));
}
export function validBattleLoadout(value: unknown): value is BattleLoadout {
  const v = value as BattleLoadout;
  if (!v || v.version !== GROWTH_VERSION || !Number.isInteger(v.level) || v.level < 1 || v.level > 50 || !Array.isArray(v.effects)) return false;
  return v.effects.every(e => effects.some(([id]) => id === e)) && new Set(v.effects).size === v.effects.length &&
    v.effects.filter(e => effects.find(([id]) => id === e)?.[1] === 'mod').length <= 2 &&
    v.effects.filter(e => effects.find(([id]) => id === e)?.[1] === 'weapon').length <= 1 &&
    v.effects.filter(e => effects.find(([id]) => id === e)?.[1] === 'skill').length <= 1;
}
export const trainingLoadout = (effect: Effect): BattleLoadout => ({ version: GROWTH_VERSION, level: 1, effects: [effect], skipped: [] });
export const attackPreview = (effects: readonly string[]) => ({ shots: (effects.includes('burst') ? 2 : 1) * (effects.includes('twin') ? 2 : 1), heatMultiplier: effects.includes('cooling') ? .85 : 1 });
export const PROGRESSION = { version: GROWTH_VERSION, catalog: CATALOG, packages: PACKAGES, pools: POOLS, skills: SKILLS, levelProgress, validLoadout };
