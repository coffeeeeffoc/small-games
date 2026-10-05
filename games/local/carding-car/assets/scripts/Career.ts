import { vehicles, drivers, defaultSelection } from './Selection.ts';
import { routes } from './RouteCatalog.ts';

export type ItemCategory = 'vehicle' | 'driver' | 'decoration' | 'pet';
export type UpgradePart = 'engine' | 'grip' | 'nitro';
export type ShopItem = {
  id: string;
  category: ItemCategory;
  assetId: string;
  name: string;
  price: number;
  description: string;
  color?: string;
};
export const shopItems: ShopItem[] = [
  ...vehicles.map(([assetId, name], i): ShopItem => ({
    id: `vehicle:${assetId}`, category: 'vehicle', assetId, name,
    price: assetId === defaultSelection.vehicle ? 0 : 180 + (i - 1) * 80,
    description: '更换赛车外观，零部件升级适用于所有赛车。',
  })),
  ...drivers.map(([assetId, name], i): ShopItem => ({
    id: `driver:${assetId}`, category: 'driver', assetId, name,
    price: assetId === defaultSelection.driver ? 0 : 160 + i * 45,
    description: '更换车手和赛车服外观。',
  })),
  { id: 'decoration:none', category: 'decoration', assetId: 'none', name: '原厂外观',
    price: 0, description: '卸下赛车装饰。' },
  { id: 'decoration:racing-stripes', category: 'decoration', assetId: 'racing-stripes',
    name: '蓝白条纹尾翼', price: 90, description: '车尾的蓝色尾翼，配白色双条纹。', color: '#549cea' },
  { id: 'decoration:halo', category: 'decoration', assetId: 'halo', name: '金色光环',
    price: 220, description: '安装在车尾支架上的金色圆环。', color: '#ffd15a' },
  { id: 'decoration:comet', category: 'decoration', assetId: 'comet', name: '彗星尾翼',
    price: 360, description: '车尾支架上的红色彗星与金黄色尾焰。', color: '#fb6555' },
  { id: 'pet:none', category: 'pet', assetId: 'none', name: '独自出发',
    price: 0, description: '让跟随伙伴休息。' },
  { id: 'pet:cloud-cat', category: 'pet', assetId: 'cloud-cat', name: '云朵猫',
    price: 240, description: '带猫耳的奶白云朵猫，在赛车后上方轻轻漂浮。', color: '#fff7dd' },
  { id: 'pet:star-bot', category: 'pet', assetId: 'star-bot', name: '星星机器人',
    price: 420, description: '金色星翼与深蓝机身，薄荷色面罩亮着双眼。', color: '#193a53' },
  { id: 'pet:mini-dragon', category: 'pet', assetId: 'mini-dragon', name: '迷你飞龙',
    price: 650, description: '薄荷绿小飞龙带着红色翅膀、金色龙角，在车尾伴飞。', color: '#53ddb9' },
];

export type Milestone = {
  id: string;
  name: string;
  description: string;
  target: number;
  stat: 'races' | 'wins' | 'routes';
  coins: number;
  xp: number;
};
export const milestones: Milestone[] = [
  { id: 'first-finish', name: '初次冲线', description: '完成第一场比赛。',
    target: 1, stat: 'races', coins: 120, xp: 60 },
  { id: 'five-races', name: '渐入佳境', description: '累计完成 5 场比赛。',
    target: 5, stat: 'races', coins: 250, xp: 150 },
  { id: 'twenty-races', name: '赛道常客', description: '累计完成 20 场比赛。',
    target: 20, stat: 'races', coins: 600, xp: 300 },
  { id: 'first-win', name: '首座奖杯', description: '与对手竞速并获得一次冠军。',
    target: 1, stat: 'wins', coins: 180, xp: 100 },
  { id: 'five-wins', name: '冠军车手', description: '累计获得 5 次冠军。',
    target: 5, stat: 'wins', coins: 450, xp: 250 },
  { id: 'three-routes', name: '旅行车手', description: '在 3 条不同路线完赛。',
    target: 3, stat: 'routes', coins: 300, xp: 180 },
  { id: 'all-routes', name: '全域巡游', description: '在每条路线至少完赛一次。',
    target: routes.length, stat: 'routes', coins: 800, xp: 400 },
];

export type CareerProfile = {
  xp: number;
  coins: number;
  races: number;
  wins: number;
  podiums: number;
  owned: string[];
  equipped: Record<ItemCategory, string>;
  upgrades: Record<UpgradePart, number>;
  routes: string[];
  claimed: string[];
};
export type CareerFinish = {
  id: string;
  position: number;
  entrants: number;
  time: number;
  route: string;
  mode: string;
  coins: number;
  boosts: number;
  driftBoosts: number;
  practice?: boolean;
};
export type CareerReward = {
  coins: number;
  xp: number;
  position: number;
  levelBefore: number;
  levelAfter: number;
};
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
const STORAGE_KEY = 'kart-career-v1';
const MAX_VALUE = 1_000_000_000;
const parts: UpgradePart[] = ['engine', 'grip', 'nitro'];
const categories: ItemCategory[] = ['vehicle', 'driver', 'decoration', 'pet'];
const itemIds = new Set(shopItems.map((item) => item.id));
const routeIds = new Set(routes.map((route) => route.id));
const milestoneIds = new Set(milestones.map((milestone) => milestone.id));

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function bounded(value: unknown, max = MAX_VALUE) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(0, Math.floor(value))) : 0;
}
function strings(value: unknown, valid: (id: string) => boolean): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((id) => typeof id === 'string' && valid(id)))) : [];
}
function validRaceId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && id === id.trim();
}
function readProfile(raw: unknown): CareerProfile {
  const value = record(raw), equipped = record(value.equipped), upgrades = record(value.upgrades);
  const races = bounded(value.races), podiums = Math.min(races, bounded(value.podiums));
  const profile: CareerProfile = {
    xp: bounded(value.xp), coins: bounded(value.coins), races, podiums,
    wins: Math.min(podiums, bounded(value.wins)),
    owned: Array.from(new Set([
      `vehicle:${defaultSelection.vehicle}`, `driver:${defaultSelection.driver}`,
      'decoration:none', 'pet:none', ...strings(value.owned, (id) => itemIds.has(id)),
    ])),
    equipped: { vehicle: defaultSelection.vehicle, driver: defaultSelection.driver,
      decoration: 'none', pet: 'none' },
    upgrades: { engine: 0, grip: 0, nitro: 0 },
    routes: strings(value.routes, (id) => routeIds.has(id)),
    claimed: strings(value.claimed, (id) => milestoneIds.has(id)),
  };
  for (const category of categories) {
    const assetId = equipped[category];
    if (typeof assetId === 'string' && profile.owned.includes(`${category}:${assetId}`))
      profile.equipped[category] = assetId;
  }
  for (const part of parts) profile.upgrades[part] = bounded(upgrades[part], 5);
  return profile;
}

export class Career {
  profile = readProfile(null);
  lastReward: CareerReward | undefined;
  saveError = '';
  private storage: Storage;
  private readable = true;
  // ponytail: retain exact race IDs; move the ledger to an indexed store if long careers exceed storage quota.
  private rewarded: string[] = [];

  constructor(storage: Storage) {
    this.storage = storage;
    let raw: string | null;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch {
      this.readable = false;
      this.saveError = '生涯存档读取失败，请恢复存储后重新打开。';
      return;
    }
    try {
      const value = record(JSON.parse(raw || '{}'));
      this.profile = readProfile(value);
      this.rewarded = strings(value.rewarded, validRaceId);
    } catch {
      this.saveError = '生涯存档损坏，已使用初始档案。';
    }
  }

  private save(profile: CareerProfile, rewarded = this.rewarded): boolean {
    if (!this.readable) return false;
    const next = readProfile(profile);
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify({ ...next, rewarded }));
      this.profile = next;
      this.rewarded = rewarded;
      this.saveError = '';
      return true;
    } catch {
      this.saveError = '生涯存档保存失败，本次操作未生效，请重试。';
      return false;
    }
  }

  buy(id: string): boolean {
    const item = shopItems.find((entry) => entry.id === id);
    if (!item || this.profile.owned.includes(id) || this.profile.coins < item.price) return false;
    return this.save({ ...this.profile, coins: this.profile.coins - item.price,
      owned: [...this.profile.owned, id] });
  }

  equip(id: string): boolean {
    const item = shopItems.find((entry) => entry.id === id);
    if (!item || !this.profile.owned.includes(id)) return false;
    if (this.profile.equipped[item.category] === item.assetId) return true;
    return this.save({ ...this.profile,
      equipped: { ...this.profile.equipped, [item.category]: item.assetId } });
  }

  upgradeCost(part: UpgradePart): number {
    if (!parts.includes(part) || this.profile.upgrades[part] >= 5) return 0;
    return 180 + this.profile.upgrades[part] * 140;
  }

  upgrade(part: UpgradePart): boolean {
    const cost = this.upgradeCost(part);
    if (!cost || this.profile.coins < cost) return false;
    return this.save({ ...this.profile, coins: this.profile.coins - cost,
      upgrades: { ...this.profile.upgrades, [part]: this.profile.upgrades[part] + 1 } });
  }

  milestoneProgress(id: string): number {
    const milestone = milestones.find((entry) => entry.id === id);
    if (!milestone) return 0;
    const progress = milestone.stat === 'routes'
      ? this.profile.routes.length : this.profile[milestone.stat];
    return Math.min(milestone.target, progress);
  }

  claim(id: string): boolean {
    const milestone = milestones.find((entry) => entry.id === id);
    if (!milestone || this.profile.claimed.includes(id) ||
        this.milestoneProgress(id) < milestone.target) return false;
    return this.save({ ...this.profile, coins: this.profile.coins + milestone.coins,
      xp: this.profile.xp + milestone.xp, claimed: [...this.profile.claimed, id] });
  }

  finish(result: CareerFinish): CareerReward | undefined {
    // The caller supplies the player's final finish time; zero means unfinished.
    if (!result || !validRaceId(result.id) || this.rewarded.includes(result.id) ||
        (result.practice !== undefined && result.practice !== false) ||
        !routeIds.has(result.route) || !['standard', 'sprint'].includes(result.mode) ||
        !Number.isInteger(result.entrants) || result.entrants < 1 || result.entrants > 8 ||
        !Number.isInteger(result.position) || result.position < 1 || result.position > result.entrants ||
        !Number.isFinite(result.time) || result.time <= 0 || result.time > 3600 ||
        [result.coins, result.boosts, result.driftBoosts].some((n) =>
          !Number.isSafeInteger(n) || n < 0 || n > 1_000_000)) return;
    const p = this.profile, competed = result.entrants > 1;
    const place = competed ? result.position : 0;
    const coins = Math.min(MAX_VALUE - p.coins,
      (result.mode === 'standard' ? 120 : 80) + ([0, 100, 60, 30][place] || 0) +
      Math.min(result.coins, 30) * 5);
    const xp = Math.min(MAX_VALUE - p.xp,
      (result.mode === 'standard' ? 70 : 40) + ([0, 40, 25, 10][place] || 0) +
      Math.min(result.boosts, 20) * 2 + Math.min(result.driftBoosts, 10) * 5);
    const levelBefore = this.level;
    if (!this.save({ ...p, coins: p.coins + coins, xp: p.xp + xp, races: p.races + 1,
      wins: p.wins + Number(place === 1), podiums: p.podiums + Number(place > 0 && place <= 3),
      routes: Array.from(new Set([...p.routes, result.route])) }, [...this.rewarded, result.id])) return;
    this.lastReward = { coins, xp, position: result.position, levelBefore, levelAfter: this.level };
    return this.lastReward;
  }

  get level(): number {
    return Math.floor(Math.sqrt(this.profile.xp / 100)) + 1;
  }

  get levelProgress(): { current: number; needed: number } {
    const level = this.level;
    return { current: this.profile.xp - (level - 1) ** 2 * 100, needed: (2 * level - 1) * 100 };
  }

  /** Integer levels; the race caller applies tuning and keeps multiplayer stock. */
  performance(): { engine: number; grip: number; nitro: number } {
    return { ...this.profile.upgrades };
  }
}
