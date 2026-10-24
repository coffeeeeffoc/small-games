import { CATALOG, CONTENT_VERSION, LEVELS, SPELLS, TRAITS, getSpec, getTrait } from './content.ts';
import type { Kind, Level, Spec } from './content.ts';

export const TICK_RATE = 20;
export const POPULATION_CAP = 6;
export const RULE_VERSION = 3;
export const INVENTORY_CAP = 12;
export const ROUND_SECONDS = 30;
export const MAX_ROUNDS = 12;
export function incomeForRound(round: number): number {
  if (!Number.isSafeInteger(round) || round < 1) throw new Error('Invalid round');
  return Math.min(16, 5 + round);
}
export function crystalStyle(seed: number, round: number): number {
  let hash = (seed ^ Math.imul(round, 0x9e3779b9)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b) >>> 0;
  return ((hash ^ (hash >>> 13)) >>> 0) % 6;
}
export type SideId = 0 | 1;
export interface Card {
  id: number;
  key: string;
  level: number;
  bonusHp: number;
  bonusDamage: number;
  entered: boolean;
  ward: boolean;
}
export interface Formation extends Card {
  x: number;
  y: number;
}
export interface Offer {
  id: number;
  kind: 'unit' | 'part' | 'spell';
  key: string;
  cost: number;
  part?: string;
}
export interface SpellCard {
  id: number;
  key: string;
}
export interface Side {
  coins: number;
  crystalHp: number;
  maxCrystalHp: number;
  bag: Record<string, number>;
  hand: Card[];
  formation: Formation[];
  deck: string[];
  shop: Offer[];
  spells: SpellCard[];
  freeRefresh: boolean;
  inspired: boolean;
  boostUsed: boolean;
  kills: Record<Kind, number>;
}
export interface Unit {
  id: number;
  key: string;
  side: SideId;
  level: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  range: number;
  speed: number;
  attackTimer: number;
  targetId: number | null;
  anim: 'spawn' | 'move' | 'attack' | 'idle' | 'hit' | 'skill';
  skillTimer: number;
  slowTicks: number;
  shield: number;
  ward: boolean;
  inspired: boolean;
}

export type Action = (
  | { type: 'buy'; offer: number }
  | { type: 'refresh' }
  | { type: 'sell'; card: number }
  | { type: 'discard'; part: string }
  | { type: 'cast'; spell: number; target?: number }
  | { type: 'deploy'; card: number; x: number; y: number }
  | { type: 'move'; card: number; x: number; y: number }
  | { type: 'recall'; card: number }
  | { type: 'merge'; from: number; to: number }
  | { type: 'startRound' }
  | { type: 'pause'; paused: boolean }
  | { type: 'skipTutorial' }
) & { matchId?: string; seq?: number; version?: number };
export interface CommandResult {
  ok: boolean;
  message: string;
}
export interface MatchEvent {
  id: number;
  tick: number;
  type: string;
  side: SideId;
  x: number;
  y: number;
  key?: string;
  unitId?: number;
  targetId?: number;
  value?: number;
}
export interface RecordedCommand {
  tick: number;
  side: SideId;
  seq: number;
  action: Action;
}

export interface Match {
  version: number;
  contentVersion: number;
  id: string;
  levelId: string;
  seed: number;
  tick: number;
  phase: 'running' | 'won' | 'lost' | 'draw';
  paused: boolean;
  winner: SideId | null;
  endReason: 'crystal' | 'round-limit' | null;
  roundStage: 'planning' | 'battle' | 'resolution';
  roundNumber: number;
  roundTicks: number;
  roundWinner: SideId | null;
  roundDamage: number;
  sides: [Side, Side];
  units: Unit[];
  events: MatchEvent[];
  nextId: number;
  assisted: boolean;
  rng: [number, number];
  sequences: [number, number];
  commandStart: [number, number];
  commands: RecordedCommand[];
  tutorial: boolean;
  tutorialStep: number;
  practice: boolean;
  maxLevels: Record<string, number>;
}
const dt = 1 / TICK_RATE;
let matchSerial = 0;
const round = (n: number): number => Math.round(n * 1000) / 1000;
const integer = (n: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= min && n <= max;
const finite = (n: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);
const crystal = (side: SideId) => ({ x: side === 0 ? 50 : 950, y: 180 });
const other = (side: SideId): SideId => (side === 0 ? 1 : 0);
const scaled = (base: number, level: number): number => Math.round(base * (1 + (level - 1) * 0.45));
function safeLevel(spec: Spec, level: number): boolean {
  const ceiling = Math.floor(Number.MAX_SAFE_INTEGER / (POPULATION_CAP * 4));
  return (
    integer(level, 1) &&
    integer(scaled(spec.hp, level), 1, ceiling) &&
    integer(scaled(spec.damage, level), 1, ceiling)
  );
}
function getLevel(id: string): Level {
  const level = LEVELS.find((l) => l.id === id);
  if (!level) throw new Error('Unknown level: ' + String(id));
  return level;
}
function deckValid(deck: unknown): deck is string[] {
  return (
    Array.isArray(deck) &&
    deck.length === 2 &&
    deck.every((id) => typeof id === 'string' && CATALOG.some((s) => s.id === id)) &&
    getSpec(deck[0]).kind === 'hero' &&
    getSpec(deck[1]).kind === 'weapon'
  );
}
function partInfo(part: string): boolean {
  return part === 'nezha:0' || part === 'nezha:1';
}
export function inventoryCount(side: Side): number {
  return (
    side.hand.length + side.spells.length + Object.values(side.bag).reduce((sum, n) => sum + n, 0)
  );
}
export function traitCounts(formation: readonly Card[]): Record<string, number> {
  return Object.fromEntries(
    TRAITS.map((t) => [
      t.id,
      new Set(formation.filter((c) => t.keys.includes(c.key)).map((c) => c.key)).size,
    ]),
  );
}
function cardValid(c: Card): boolean {
  const ceiling = Math.floor(Number.MAX_SAFE_INTEGER / (POPULATION_CAP * 4));
  return (
    CATALOG.some((s) => s.id === c.key) &&
    safeLevel(getSpec(c.key), c.level) &&
    integer(c.bonusHp, 0, ceiling) &&
    integer(c.bonusDamage, 0, ceiling) &&
    integer(scaled(getSpec(c.key).hp, c.level) + c.bonusHp, 1, ceiling) &&
    integer(scaled(getSpec(c.key).damage, c.level) + c.bonusDamage, 1, ceiling) &&
    typeof c.entered === 'boolean' &&
    typeof c.ward === 'boolean'
  );
}
function makeCard(state: Match, key: string): Card {
  return {
    id: state.nextId++,
    key,
    level: 1,
    bonusHp: 0,
    bonusDamage: 0,
    entered: false,
    ward: false,
  };
}
function random(state: Match, side: SideId): number {
  state.rng[side] = (Math.imul(state.rng[side], 1664525) + 1013904223) >>> 0;
  return state.rng[side] / 4294967296;
}
function emit(state: Match, type: string, side: SideId, data: Partial<MatchEvent> = {}): void {
  state.events.push({
    id: state.nextId++,
    tick: state.tick,
    type,
    side,
    ...crystal(side),
    ...data,
  });
  if (state.events.length > 64) state.events.shift();
}
function assemble(state: Match, sideId: SideId): void {
  const side = state.sides[sideId];
  while (side.bag['nezha:0'] > 0 && side.bag['nezha:1'] > 0) {
    for (const p of ['nezha:0', 'nezha:1']) if (--side.bag[p] === 0) delete side.bag[p];
    side.hand.push(makeCard(state, 'nezha'));
    emit(state, 'assemble', sideId, { key: 'nezha', value: 1 });
  }
}
function fillShop(state: Match, sideId: SideId): void {
  const side = state.sides[sideId];
  const pool: Omit<Offer, 'id'>[] = [
    ...CATALOG.filter((s) => s.cost > 0).map((s) => ({
      kind: 'unit' as const,
      key: s.id,
      cost: s.cost,
    })),
    ...['nezha:0', 'nezha:1'].map((part) => ({
      kind: 'part' as const,
      key: 'nezha',
      cost: 1,
      part,
    })),
  ];
  const missing = side.bag['nezha:0'] ? 'nezha:1' : side.bag['nezha:1'] ? 'nezha:0' : undefined;
  const offers: Offer[] = [];
  for (let slot = 0; slot < 3; slot++) {
    if (slot === 2 && random(state, sideId) < 0.5) {
      const spell = SPELLS[Math.floor(random(state, sideId) * SPELLS.length)];
      offers.push({ id: state.nextId++, kind: 'spell', key: spell.id, cost: spell.cost });
    } else {
      const index =
        slot === 0 && missing
          ? pool.findIndex((o) => o.part === missing)
          : Math.floor(random(state, sideId) * pool.length);
      offers.push({ id: state.nextId++, ...pool.splice(index, 1)[0] });
    }
  }
  side.shop = offers;
}
function makeSide(deck: string[]): Side {
  return {
    coins: incomeForRound(1),
    crystalHp: 30,
    maxCrystalHp: 30,
    bag: {},
    hand: [],
    formation: [],
    deck: [...deck],
    shop: [],
    spells: [],
    freeRefresh: false,
    inspired: false,
    boostUsed: false,
    kills: { hero: 0, weapon: 0 },
  };
}
export function createMatch(
  levelId: string,
  seed: number,
  deck?: string[],
  options: { tutorial?: boolean; practice?: boolean } = {},
): Match {
  const level = getLevel(levelId),
    playerDeck = deck ?? ['nezha', 'fire'];
  if (!integer(seed, 0, 0xffffffff) || !deckValid(playerDeck))
    throw new Error('Invalid match configuration');
  if (
    (options.tutorial !== undefined && typeof options.tutorial !== 'boolean') ||
    (options.practice !== undefined && typeof options.practice !== 'boolean')
  )
    throw new Error('Invalid options');
  const state: Match = {
    version: RULE_VERSION,
    contentVersion: CONTENT_VERSION,
    id:
      'mf-' +
      Date.now().toString(36) +
      '-' +
      ++matchSerial +
      '-' +
      Math.random().toString(36).slice(2, 10),
    levelId,
    seed,
    tick: 0,
    phase: 'running',
    paused: false,
    winner: null,
    endReason: null,
    roundStage: 'planning',
    roundNumber: 1,
    roundTicks: 0,
    roundWinner: null,
    roundDamage: 0,
    sides: [
      makeSide(playerDeck),
      makeSide(
        ['hero', 'weapon'].map((kind) => level.ai.deck.find((key) => getSpec(key).kind === kind)!),
      ),
    ],
    units: [],
    events: [],
    nextId: 1,
    assisted: false,
    rng: [seed, (seed ^ 0x6d2b79f5) >>> 0],
    sequences: [0, 0],
    commandStart: [0, 0],
    commands: [],
    tutorial: options.tutorial === true,
    tutorialStep: options.tutorial ? 0 : 6,
    practice: options.practice === true,
    maxLevels: {},
  };
  for (const sideId of [0, 1] as const) {
    const side = state.sides[sideId];
    side.hand = side.deck.map((key) => makeCard(state, key));
    fillShop(state, sideId);
  }
  planAI(state);
  return state;
}
const fields: Record<string, string[]> = {
  buy: ['offer'],
  refresh: [],
  sell: ['card'],
  discard: ['part'],
  cast: ['spell', 'target'],
  deploy: ['card', 'x', 'y'],
  move: ['card', 'x', 'y'],
  recall: ['card'],
  merge: ['from', 'to'],
  startRound: [],
  pause: ['paused'],
  skipTutorial: [],
};
function actionValid(a: unknown): a is Action {
  if (
    !object(a) ||
    typeof a.type !== 'string' ||
    !Object.hasOwn(fields, a.type) ||
    Object.keys(a).some(
      (k) => !['type', 'matchId', 'seq', 'version', ...fields[a.type as string]].includes(k),
    )
  )
    return false;
  if (
    (a.matchId !== undefined && typeof a.matchId !== 'string') ||
    (a.seq !== undefined && !integer(a.seq, 1)) ||
    (a.version !== undefined && a.version !== RULE_VERSION)
  )
    return false;
  switch (a.type) {
    case 'buy':
      return integer(a.offer, 1);
    case 'discard':
      return typeof a.part === 'string' && partInfo(a.part);
    case 'cast':
      return integer(a.spell, 1) && (a.target === undefined || integer(a.target, 1));
    case 'sell':
      return integer(a.card, 1);
    case 'deploy':
    case 'move':
      return integer(a.card, 1) && finite(a.x, 0, 1000) && finite(a.y, 0, 360);
    case 'recall':
      return integer(a.card, 1);
    case 'merge':
      return integer(a.from, 1) && integer(a.to, 1) && a.from !== a.to;
    case 'pause':
      return typeof a.paused === 'boolean';
    default:
      return true;
  }
}
export function legalPosition(sideId: SideId, x: number, y: number): boolean {
  const localX = sideId === 0 ? x : 1000 - x;
  return finite(localX, 120, 440) && finite(y, 30, 330);
}
export function command(state: Match, sideId: SideId, action: Action): CommandResult {
  const fail = (message: string): CommandResult => ({ ok: false, message });
  if ((sideId !== 0 && sideId !== 1) || !actionValid(action)) return fail('无效操作');
  if (
    (action.matchId !== undefined && action.matchId !== state.id) ||
    (action.seq !== undefined && action.seq !== state.sequences[sideId] + 1)
  )
    return fail('重复、乱序或对局不符');
  if (state.phase !== 'running') return fail('对局已结束');
  if (state.paused && action.type !== 'pause') return fail('请先继续');
  if (state.roundStage !== 'planning' && !['pause', 'skipTutorial'].includes(action.type))
    return fail('战斗中阵容已锁定');
  const side = state.sides[sideId];
  let message = '操作成功';
  switch (action.type) {
    case 'pause':
      if (sideId !== 0 || state.paused === action.paused) return fail('无效暂停操作');
      state.paused = action.paused;
      break;
    case 'skipTutorial':
      if (sideId !== 0 || !state.tutorial || state.tutorialStep === 6) return fail('当前没有引导');
      state.tutorialStep = 6;
      break;
    case 'buy': {
      const offer = side.shop.find((o) => o.id === action.offer);
      if (!offer) return fail('商品已售出或不存在');
      if (side.coins < offer.cost) return fail('灵石不足');
      const pairs =
        offer.kind === 'part' && side.bag[offer.part === 'nezha:0' ? 'nezha:1' : 'nezha:0'] > 0;
      if (inventoryCount(side) + (pairs ? 0 : 1) > INVENTORY_CAP) return fail('手牌已满');
      side.coins -= offer.cost;
      side.shop = side.shop.filter((o) => o.id !== offer.id);
      if (offer.kind === 'unit') side.hand.push(makeCard(state, offer.key));
      else if (offer.kind === 'spell') side.spells.push({ id: state.nextId++, key: offer.key });
      else {
        side.bag[offer.part!] = (side.bag[offer.part!] || 0) + 1;
        assemble(state, sideId);
      }
      break;
    }
    case 'refresh':
      if (!side.freeRefresh && side.coins < 1) return fail('灵石不足');
      if (side.freeRefresh) side.freeRefresh = false;
      else side.coins--;
      fillShop(state, sideId);
      break;
    case 'discard':
      if (!side.bag[action.part]) return fail('没有这枚残字');
      if (--side.bag[action.part] === 0) delete side.bag[action.part];
      break;
    case 'sell': {
      const card = [...side.hand, ...side.formation].find((c) => c.id === action.card);
      if (!card) return fail('找不到卡牌');
      side.hand = side.hand.filter((c) => c.id !== card.id);
      side.formation = side.formation.filter((c) => c.id !== card.id);
      const gift = card.key === 'fire' ? 'sharpen' : card.key === 'lantern' ? 'ward' : undefined;
      if (gift) {
        if (inventoryCount(side) < INVENTORY_CAP)
          side.spells.push({ id: state.nextId++, key: gift });
        else message = '已出售，手牌已满，赠送法术消失';
      } else side.coins++;
      if (card.key === 'drone') side.freeRefresh = true;
      break;
    }
    case 'cast': {
      const spell = side.spells.find((s) => s.id === action.spell);
      if (!spell) return fail('找不到法术');
      if (spell.key === 'inspire') {
        if (action.target !== undefined || side.inspired)
          return fail('鼓舞每轮限一次，请选择己方场地');
        side.inspired = true;
      } else {
        const card = side.formation.find((c) => c.id === action.target);
        if (!card) return fail('请选择己方场上单位');
        if (spell.key === 'ward' && card.ward) return fail('护符不能叠加');
        const next = {
          ...card,
          bonusDamage: card.bonusDamage + (spell.key === 'sharpen' ? 5 : 0),
          bonusHp: card.bonusHp + (spell.key === 'fortify' ? 35 : 0),
        };
        if (!cardValid(next)) return fail('数值超出安全范围');
        Object.assign(card, next);
        if (spell.key === 'ward') card.ward = true;
      }
      side.spells = side.spells.filter((s) => s.id !== spell.id);
      break;
    }
    case 'deploy':
    case 'move': {
      const source = action.type === 'deploy' ? side.hand : side.formation;
      const card = source.find((c) => c.id === action.card);
      if (!card) return fail('只有完整卡牌可以上阵');
      if (action.type === 'deploy' && side.formation.length >= POPULATION_CAP)
        return fail('上阵已满，拖到同名单位可升级');
      if (!legalPosition(sideId, action.x, action.y)) return fail('请放到我方场地');
      if (side.formation.some((c) => c.id !== card.id && distance(c, action) < 46))
        return fail('这里太拥挤，换一块空地');
      if (action.type === 'deploy') {
        side.hand = side.hand.filter((c) => c.id !== card.id);
        side.formation.push({ ...card, x: round(action.x), y: round(action.y) });
      } else Object.assign(card, { x: round(action.x), y: round(action.y) });
      emit(state, 'deploy', sideId, { key: card.key, x: action.x, y: action.y });
      break;
    }
    case 'recall': {
      const card = side.formation.find((c) => c.id === action.card);
      if (!card) return fail('找不到上阵单位');
      if (inventoryCount(side) >= INVENTORY_CAP) return fail('手牌已满，无法回收');
      side.formation = side.formation.filter((c) => c.id !== card.id);
      const { x, y, ...recalled } = card;
      side.hand.push(recalled);
      break;
    }
    case 'merge': {
      const from = [...side.hand, ...side.formation].find((c) => c.id === action.from),
        to = side.formation.find((c) => c.id === action.to);
      if (!from || !to || from.key !== to.key) return fail('只能合并同名单位');
      const merged = {
        ...to,
        level: to.level + from.level,
        bonusHp: to.bonusHp + from.bonusHp,
        bonusDamage: to.bonusDamage + from.bonusDamage,
        entered: to.entered || from.entered,
        ward: to.ward || from.ward,
      };
      if (!cardValid(merged)) return fail('数值超出安全范围');
      side.hand = side.hand.filter((c) => c.id !== from.id);
      side.formation = side.formation.filter((c) => c.id !== from.id);
      Object.assign(to, merged);
      emit(state, 'merge', sideId, { key: to.key, value: to.level, x: to.x, y: to.y });
      break;
    }
    case 'startRound': {
      if (sideId !== 0 || !side.formation.length) return fail('先拖一张完整卡上阵');
      const formations = state.sides.map((s) => enterBattle(s.formation));
      if (formations.some((f) => f.some((c) => !cardValid(c)))) return fail('数值超出安全范围');
      state.sides.forEach((s, i) => {
        s.formation = formations[i];
      });
      state.roundStage = 'battle';
      state.roundTicks = 0;
      state.roundWinner = null;
      state.roundDamage = 0;
      state.units = state.sides.flatMap((s, i) =>
        s.formation.map((c) => makeUnit(c, i as SideId, s)),
      );
      emit(state, 'round-start', 0);
      break;
    }
  }
  if (sideId === 0) {
    for (const c of side.formation)
      state.maxLevels[c.key] = Math.max(state.maxLevels[c.key] || 0, c.level);
    if (state.tutorial && state.tutorialStep < 6) {
      if (action.type === 'deploy') state.tutorialStep = Math.max(1, state.tutorialStep);
      if (action.type === 'merge') state.tutorialStep = Math.max(2, state.tutorialStep);
      if (action.type === 'startRound') state.tutorialStep = 6;
    }
  }
  const seq = ++state.sequences[sideId];
  state.commands.push({ tick: state.tick, side: sideId, seq, action: copy(action) });
  if (state.commands.length > 4096) {
    const removed = state.commands.shift()!;
    state.commandStart[removed.side] = removed.seq;
  }
  return { ok: true, message };
}
function enterBattle(formation: Formation[]): Formation[] {
  // Lock every target before applying any permanent bonus; deployment order cannot alter selection.
  const next = formation.map((c) => ({ ...c, entered: true }));
  for (const source of formation) {
    if (source.entered) continue;
    const friends = formation.filter((c) => c.id !== source.id);
    const targets =
      source.key === 'xuannv'
        ? friends.filter((c) => getTrait(c.key).id === 'spirit')
        : source.key === 'juling' || source.key === 'leizhen'
          ? friends
              .filter((c) => source.key === 'juling' || getTrait(c.key).id === 'thunder')
              .sort((a, b) => distance(a, source) - distance(b, source) || a.id - b.id)
              .slice(0, 1)
          : [];
    for (const target of targets) {
      const c = next.find((c) => c.id === target.id)!;
      if (source.key === 'leizhen') c.bonusDamage += 4;
      else c.bonusHp += source.key === 'juling' ? 20 : 6;
    }
  }
  return next;
}
function makeUnit(c: Formation, side: SideId, army: Side): Unit {
  const s = getSpec(c.key),
    trait = getTrait(c.key).id,
    count = traitCounts(army.formation)[trait];
  const hp = Math.round(
    (scaled(s.hp, c.level) + c.bonusHp) *
      (trait === 'armor' && count >= 2 ? (count >= 4 ? 1.35 : 1.18) : 1),
  );
  const damage = Math.round(
    (scaled(s.damage, c.level) + c.bonusDamage) *
      (trait === 'flame' && count >= 2 ? 1.12 : 1) *
      (army.inspired ? 1.12 : 1),
  );
  const nearby = army.formation.some(
    (f) => f.id !== c.id && getTrait(f.key).id === 'spirit' && distance(f, c) <= 125,
  );
  const shield =
    (c.ward ? 0.3 : 0) +
    (trait === 'spirit' && count >= 2 ? (count >= 4 && nearby ? 0.24 : 0.12) : 0);
  return {
    id: c.id,
    key: c.key,
    level: c.level,
    x: c.x,
    y: c.y,
    side,
    hp,
    maxHp: hp,
    damage,
    range: s.range,
    speed: s.speed,
    attackTimer: 0,
    targetId: null,
    anim: 'spawn',
    skillTimer: 0,
    slowTicks: 0,
    shield: Math.round(hp * shield),
    ward: c.ward,
    inspired: army.inspired,
  };
}
export function runAI(state: Match, sideId: SideId): CommandResult | null {
  if (
    (sideId !== 0 && sideId !== 1) ||
    state.paused ||
    state.phase !== 'running' ||
    state.roundStage !== 'planning'
  )
    return null;
  const side = state.sides[sideId],
    level = getLevel(state.levelId),
    style = level.ai.style;
  const counts = traitCounts(side.formation);
  const preference = (key: string): number => {
    const count = counts[getTrait(key).id];
    return (
      count * 3 +
      (count === 1 || count === 3 ? 3 : 0) +
      (level.ai.deck.includes(key) ? 2 : 0) +
      getSpec(key).cost
    );
  };
  for (const spell of side.spells) {
    if (spell.key === 'inspire') {
      if (!side.inspired && side.formation.length)
        return command(state, sideId, { type: 'cast', spell: spell.id });
    } else {
      const target = side.formation
        .filter((c) => spell.key !== 'ward' || !c.ward)
        .sort(
          (a, b) => b.level - a.level || preference(b.key) - preference(a.key) || a.id - b.id,
        )[0];
      if (target)
        return command(state, sideId, { type: 'cast', spell: spell.id, target: target.id });
    }
  }
  for (const card of [...side.hand].sort(
    (a, b) => preference(b.key) - preference(a.key) || a.id - b.id,
  )) {
    const target = side.formation.find((c) => c.key === card.key);
    if (target) return command(state, sideId, { type: 'merge', from: card.id, to: target.id });
    if (side.formation.length < POPULATION_CAP) {
      const front = getSpec(card.key).range < 100 ? 390 : 200;
      for (const x of [front, front === 390 ? 200 : 390])
        for (const y of [70, 180, 290]) {
          const pos = { x: sideId === 0 ? x : 1000 - x, y };
          if (!side.formation.some((c) => distance(c, pos) < 46))
            return command(state, sideId, { type: 'deploy', card: card.id, ...pos });
        }
    } else {
      const weakest = [...side.formation].sort(
        (a, b) =>
          preference(a.key) + a.level * 3 - (preference(b.key) + b.level * 3) || b.id - a.id,
      )[0];
      if (preference(card.key) > preference(weakest.key) + (weakest.level - 1) * 3)
        return command(state, sideId, { type: 'sell', card: weakest.id });
      return command(state, sideId, { type: 'sell', card: card.id });
    }
  }
  const offers = side.shop.filter(
    (o) =>
      o.cost <= side.coins &&
      (inventoryCount(side) < INVENTORY_CAP ||
        (o.kind === 'part' && side.bag[o.part === 'nezha:0' ? 'nezha:1' : 'nezha:0'] > 0)),
  );
  const score = (o: Offer): number => {
    if (o.kind === 'spell')
      return (o.key === 'inspire' && side.inspired) || !side.formation.length ? -1 : 5;
    if (o.kind === 'part')
      return side.bag[o.part === 'nezha:0' ? 'nezha:1' : 'nezha:0'] ? 30 : preference('nezha') / 2;
    const target = side.formation.find((c) => c.key === o.key);
    if (target) return 18 + preference(o.key) + (style === 'focus' ? 4 : 0);
    if (side.formation.length < POPULATION_CAP) return 10 + preference(o.key);
    const worst = Math.min(...side.formation.map((c) => preference(c.key) + (c.level - 1) * 3));
    return preference(o.key) > worst ? 6 + preference(o.key) : -1;
  };
  const offer = offers.sort((a, b) => score(b) - score(a) || a.id - b.id)[0];
  if (offer && score(offer) >= 0) return command(state, sideId, { type: 'buy', offer: offer.id });
  if (side.freeRefresh || side.coins >= 2) return command(state, sideId, { type: 'refresh' });
  return null;
}
function planAI(state: Match): void {
  for (let n = 0; n < 128; n++) {
    const result = runAI(state, 1);
    if (!result?.ok) break;
  }
}
function fight(state: Match): void {
  const units = state.units;
  const traits = state.sides.map((s) => traitCounts(s.formation));
  const damage = new Map<number, number>();
  const credit = new Map<number, Unit>();
  const slow = new Set<number>();
  const healing = new Map<number, number>();
  const shielding = new Map<number, number>();
  const moves = new Map<number, { x: number; y: number }>();
  const hurt = (target: Unit, source: Unit, value: number): void => {
    damage.set(target.id, (damage.get(target.id) || 0) + value);
    if (!credit.has(target.id)) credit.set(target.id, source);
  };
  for (const unit of units) {
    const spec = getSpec(unit.key);
    unit.attackTimer = Math.max(0, round(unit.attackTimer - dt));
    unit.skillTimer = Math.max(0, round(unit.skillTimer - dt));
    if (unit.slowTicks > 0) unit.slowTicks--;
    const enemies = units.filter((e) => e.side !== unit.side);
    let target: Unit | undefined;
    let nearest = Infinity;
    for (const enemy of enemies) {
      const d = distance(unit, enemy);
      if (d < nearest || (d === nearest && enemy.id < (target?.id ?? Infinity))) {
        target = enemy;
        nearest = d;
      }
    }
    const old = enemies.find((e) => e.id === unit.targetId);
    if (old && distance(unit, old) <= nearest + 12) target = old;
    unit.targetId = target?.id ?? null;
    const goal = target ?? crystal(other(unit.side));
    const d = distance(unit, goal);
    // Coordinates are rounded to 0.001; tolerate one diagonal rounding step.
    const inRange = d <= unit.range + 0.002;
    unit.anim = inRange ? 'idle' : 'move';
    if (!inRange) {
      const amount = Math.min(d - unit.range, unit.speed * dt * (unit.slowTicks > 0 ? 0.6 : 1));
      let dx = ((goal.x - unit.x) / d) * amount,
        dy = ((goal.y - unit.y) / d) * amount;
      // Soft separation has no blocking collision, so a crowded melee unit can always advance.
      for (const friend of units) {
        if (friend.side !== unit.side || friend.id === unit.id) continue;
        const gap = distance(unit, friend);
        if (gap < 22) {
          const push = (22 - gap) * 0.07;
          dx += gap ? ((unit.x - friend.x) / gap) * push : 0;
          dy += gap ? ((unit.y - friend.y) / gap) * push : unit.id < friend.id ? -push : push;
        }
      }
      moves.set(unit.id, {
        x: round(Math.max(20, Math.min(980, unit.x + dx))),
        y: round(Math.max(18, Math.min(342, unit.y + dy))),
      });
    } else if (unit.attackTimer === 0) {
      const thunder = getTrait(unit.key).id === 'thunder' ? traits[unit.side].thunder : 0;
      unit.attackTimer = round(spec.interval / (thunder >= 4 ? 1.25 : thunder >= 2 ? 1.12 : 1));
      unit.anim = 'attack';
      if (target) {
        hurt(target, unit, unit.damage);
        if (spec.special === 'slow') slow.add(target.id);
        for (const enemy of enemies) {
          if (enemy.id === target.id) continue;
          const area = spec.splash && distance(enemy, target) <= spec.splash;
          const vx = target.x - unit.x,
            vy = target.y - unit.y;
          const ex = enemy.x - unit.x,
            ey = enemy.y - unit.y;
          const projection = (ex * vx + ey * vy) / (d || 1);
          const piercing =
            spec.special === 'pierce' &&
            projection >= d &&
            projection <= unit.range + 65 &&
            Math.abs(ex * vy - ey * vx) / (d || 1) <= 20;
          if (area || piercing) {
            hurt(
              enemy,
              unit,
              Math.round(
                unit.damage *
                  (area && getTrait(unit.key).id === 'flame' && traits[unit.side].flame >= 4
                    ? 0.75
                    : 0.55),
              ),
            );
            if (spec.special === 'slow') slow.add(enemy.id);
          }
        }
        if (spec.special === 'chain') {
          const chain = enemies
            .filter((e) => e.id !== target.id && distance(e, target!) <= 85)
            .sort((a, b) => distance(a, target!) - distance(b, target!) || a.id - b.id)
            .slice(0, 2);
          for (const enemy of chain) hurt(enemy, unit, Math.round(unit.damage * 0.55));
        }
      }
      emit(state, 'attack', unit.side, {
        unitId: unit.id,
        key: unit.key,
        x: goal.x,
        y: goal.y,
        ...(target ? { targetId: target.id } : {}),
      });
    }
    if ((spec.special === 'heal' || spec.special === 'shield') && unit.skillTimer === 0) {
      unit.skillTimer = 6;
      unit.anim = 'skill';
      for (const friend of units)
        if (friend.side === unit.side && distance(friend, unit) <= 125) {
          if (spec.special === 'heal')
            healing.set(friend.id, (healing.get(friend.id) || 0) + Math.round(unit.maxHp * 0.12));
          else
            shielding.set(
              friend.id,
              Math.max(shielding.get(friend.id) || 0, Math.round(friend.maxHp * 0.18)),
            );
        }
      emit(state, 'skill', unit.side, { unitId: unit.id, key: unit.key, x: unit.x, y: unit.y });
    }
  }
  for (const unit of units) {
    const move = moves.get(unit.id);
    if (move) Object.assign(unit, move);
    unit.shield = Math.max(unit.shield, shielding.get(unit.id) || 0);
    const hit = Math.round(
      (damage.get(unit.id) || 0) * (getSpec(unit.key).special === 'guard' ? 0.8 : 1),
    );
    const absorbed = Math.min(unit.shield, hit);
    unit.shield -= absorbed;
    unit.hp = Math.max(
      0,
      Math.min(unit.maxHp, unit.hp - (hit - absorbed) + (healing.get(unit.id) || 0)),
    );
    if (slow.has(unit.id)) unit.slowTicks = 30;
    if (hit && unit.hp > 0)
      emit(state, 'hit', unit.side, {
        unitId: unit.id,
        x: unit.x,
        y: unit.y,
        value: hit - absorbed,
      });
    if (unit.hp <= 0) {
      const killer = credit.get(unit.id);
      if (killer) {
        const side = state.sides[killer.side];

        side.kills[getSpec(killer.key).kind]++;
      }
      emit(state, 'death', unit.side, { unitId: unit.id, key: unit.key, x: unit.x, y: unit.y });
    }
  }
  state.units = units.filter((u) => u.hp > 0);
}

function crystalDamage(units: Unit[], winner: SideId | null): number {
  if (winner === null) return 0;
  const survivors = units.filter((u) => u.side === winner);
  return (
    Math.min(5, 2 + survivors.reduce((sum, u) => sum + u.level, 0)) +
    Number(survivors.some((u) => u.key === 'ram'))
  );
}
function resolveRound(state: Match): void {
  const alive = [
    state.units.filter((u) => u.side === 0).length,
    state.units.filter((u) => u.side === 1).length,
  ];
  state.roundWinner = alive[0] && !alive[1] ? 0 : alive[1] && !alive[0] ? 1 : null;
  state.roundDamage = crystalDamage(state.units, state.roundWinner);
  state.roundStage = 'resolution';
  state.roundTicks = 0;
  emit(state, 'round-result', state.roundWinner ?? 0, { value: state.roundDamage });
}
function finishRound(state: Match): void {
  if (state.roundWinner !== null) {
    const loser = other(state.roundWinner);
    state.sides[loser].crystalHp = Math.max(0, state.sides[loser].crystalHp - state.roundDamage);
    emit(state, 'crystal-hit', loser, { value: state.roundDamage });
    state.sides[loser].coins++;
  }
  for (const side of state.sides) {
    side.inspired = false;
    for (const c of [...side.hand, ...side.formation]) c.ward = false;
  }
  const [a, b] = state.sides;
  if (!a.crystalHp || !b.crystalHp || state.roundNumber === MAX_ROUNDS) {
    state.endReason = !a.crystalHp || !b.crystalHp ? 'crystal' : 'round-limit';
    state.winner = a.crystalHp === b.crystalHp ? null : a.crystalHp > b.crystalHp ? 0 : 1;
    state.phase = state.winner === null ? 'draw' : state.winner === 0 ? 'won' : 'lost';
    emit(state, 'result', state.winner ?? 0);
    return;
  }
  state.roundNumber++;
  state.roundTicks = 0;
  state.roundStage = 'planning';
  state.units = [];
  state.roundWinner = null;
  state.roundDamage = 0;
  for (const sideId of [0, 1] as const) {
    state.sides[sideId].coins += incomeForRound(state.roundNumber);
    fillShop(state, sideId);
  }
  planAI(state);
}
export function step(state: Match, ticks = 1): Match {
  if (!integer(ticks, 0, 100000)) throw new Error('Ticks must be a bounded nonnegative integer');
  for (
    let i = 0;
    i < ticks && state.phase === 'running' && !state.paused && state.roundStage !== 'planning';
    i++
  ) {
    state.tick++;
    state.roundTicks++;
    if (state.roundStage === 'battle') {
      fight(state);
      if (
        !state.units.some((u) => u.side === 0) ||
        !state.units.some((u) => u.side === 1) ||
        state.roundTicks >= ROUND_SECONDS * TICK_RATE
      )
        resolveRound(state);
    } else if (state.roundTicks >= 2 * TICK_RATE) finishRound(state);
  }
  return state;
}
export function snapshot(state: Match): Match {
  return copy(state);
}
export function restore(input: unknown): Match {
  const d: unknown = typeof input === 'string' ? JSON.parse(input) : input;
  const check: (value: unknown) => asserts value = (value) => {
    if (!value) throw new Error('Invalid match snapshot');
  };
  check(object(d));
  check(
    Object.keys(d).every((k) =>
      [
        'version',
        'contentVersion',
        'id',
        'levelId',
        'seed',
        'tick',
        'phase',
        'paused',
        'winner',
        'endReason',
        'roundStage',
        'roundNumber',
        'roundTicks',
        'roundWinner',
        'roundDamage',
        'sides',
        'units',
        'events',
        'nextId',
        'assisted',
        'rng',
        'sequences',
        'commandStart',
        'commands',
        'tutorial',
        'tutorialStep',
        'practice',
        'maxLevels',
      ].includes(k),
    ),
  );
  check(
    d.version === RULE_VERSION &&
      d.contentVersion === CONTENT_VERSION &&
      typeof d.id === 'string' &&
      /^mf-[a-z0-9-]+$/.test(d.id),
  );
  check(typeof d.levelId === 'string');
  getLevel(d.levelId);
  check(
    integer(d.seed, 0, 0xffffffff) &&
      integer(d.tick, 0, MAX_ROUNDS * (ROUND_SECONDS + 2) * TICK_RATE) &&
      integer(d.nextId, 1),
  );
  check(
    ['running', 'won', 'lost', 'draw'].includes(String(d.phase)) && typeof d.paused === 'boolean',
  );
  check(d.winner === null || d.winner === 0 || d.winner === 1);
  check(d.endReason === null || d.endReason === 'crystal' || d.endReason === 'round-limit');
  check(
    ['planning', 'battle', 'resolution'].includes(String(d.roundStage)) &&
      integer(d.roundNumber, 1, MAX_ROUNDS),
  );
  check(
    integer(
      d.roundTicks,
      0,
      d.roundStage === 'resolution' ? 2 * TICK_RATE : ROUND_SECONDS * TICK_RATE,
    ),
  );
  check(d.roundWinner === null || d.roundWinner === 0 || d.roundWinner === 1);
  check(
    integer(d.roundDamage, 0, 6) &&
      (d.roundWinner === null ? d.roundDamage === 0 : d.roundDamage >= 3),
  );
  for (const key of ['assisted', 'tutorial', 'practice']) check(typeof d[key] === 'boolean');
  check(integer(d.tutorialStep, 0, 6));
  check(
    Array.isArray(d.rng) && d.rng.length === 2 && d.rng.every((v) => integer(v, 0, 0xffffffff)),
  );
  check(
    Array.isArray(d.sequences) && d.sequences.length === 2 && d.sequences.every((v) => integer(v)),
  );
  check(
    Array.isArray(d.commandStart) &&
      d.commandStart.length === 2 &&
      d.commandStart.every((v, i) => integer(v, 0, (d.sequences as number[])[i])),
  );
  check(Array.isArray(d.sides) && d.sides.length === 2);
  const cardIds = new Set<number>();
  for (const [sideId, s] of d.sides.entries()) {
    check(object(s) && deckValid(s.deck));
    check(
      Object.keys(s).every((k) =>
        [
          'coins',
          'crystalHp',
          'maxCrystalHp',
          'bag',
          'hand',
          'formation',
          'deck',
          'shop',
          'spells',
          'freeRefresh',
          'inspired',
          'boostUsed',
          'kills',
        ].includes(k),
      ),
    );
    check(
      integer(s.coins, 0, 100000) &&
        s.maxCrystalHp === 30 &&
        integer(s.crystalHp, 0, 30) &&
        typeof s.boostUsed === 'boolean' &&
        typeof s.freeRefresh === 'boolean' &&
        typeof s.inspired === 'boolean',
    );
    check(object(s.bag));
    for (const [p, n] of Object.entries(s.bag)) check(partInfo(p) && integer(n, 1, INVENTORY_CAP));
    check(!(s.bag['nezha:0'] && s.bag['nezha:1']));
    check(Array.isArray(s.spells) && s.spells.length <= INVENTORY_CAP);
    for (const spell of s.spells) {
      check(
        object(spell) &&
          integer(spell.id, 1, d.nextId - 1) &&
          !cardIds.has(spell.id) &&
          SPELLS.some((v) => v.id === spell.key) &&
          Object.keys(spell).every((k) => ['id', 'key'].includes(k)),
      );
      cardIds.add(spell.id);
    }
    check(Array.isArray(s.shop) && s.shop.length <= 3);
    const products = new Set<string>();
    let spellOffers = 0;
    for (const offer of s.shop) {
      check(
        object(offer) &&
          integer(offer.id, 1, d.nextId - 1) &&
          !cardIds.has(offer.id) &&
          Object.keys(offer).every((k) => ['id', 'kind', 'key', 'cost', 'part'].includes(k)),
      );
      cardIds.add(offer.id);
      if (offer.kind === 'unit')
        check(
          CATALOG.some((c) => c.id === offer.key && c.cost > 0 && c.cost === offer.cost) &&
            offer.part === undefined,
        );
      else if (offer.kind === 'part')
        check(
          offer.key === 'nezha' &&
            typeof offer.part === 'string' &&
            partInfo(offer.part) &&
            offer.cost === 1,
        );
      else {
        check(
          offer.kind === 'spell' &&
            SPELLS.some((v) => v.id === offer.key && v.cost === offer.cost) &&
            offer.part === undefined,
        );
        spellOffers++;
      }
      const product = String(offer.part ?? offer.key);
      check(!products.has(product));
      products.add(product);
    }
    check(spellOffers <= 1);
    check(
      Array.isArray(s.hand) &&
        s.hand.length <= INVENTORY_CAP &&
        Array.isArray(s.formation) &&
        s.formation.length <= POPULATION_CAP,
    );
    const formation = s.formation;
    for (const c of [...s.hand, ...formation]) {
      check(
        object(c) &&
          integer(c.id, 1, d.nextId - 1) &&
          !cardIds.has(c.id) &&
          typeof c.key === 'string' &&
          cardValid(c as unknown as Card) &&
          Object.keys(c).every((k) =>
            [
              'id',
              'key',
              'level',
              'bonusHp',
              'bonusDamage',
              'entered',
              'ward',
              ...(formation.includes(c) ? ['x', 'y'] : []),
            ].includes(k),
          ),
      );
      cardIds.add(c.id);
    }
    check(inventoryCount(s as unknown as Side) <= INVENTORY_CAP);
    for (const c of s.formation)
      check(
        object(c) &&
          typeof c.x === 'number' &&
          typeof c.y === 'number' &&
          legalPosition(sideId as SideId, c.x, c.y) &&
          !s.formation.some(
            (f) =>
              f !== c && distance(f as unknown as Formation, c as unknown as Formation) < 45.998,
          ),
      );
    check(
      object(s.kills) &&
        Object.keys(s.kills).every((k) => ['hero', 'weapon'].includes(k)) &&
        integer(s.kills.hero) &&
        integer(s.kills.weapon),
    );
  }
  const sides = d.sides as unknown as [Side, Side];
  check(d.assisted === sides[0].boostUsed && !sides[1].boostUsed);
  if (d.phase === 'running')
    check(d.winner === null && d.endReason === null && sides.every((s) => s.crystalHp > 0));
  else {
    check(d.roundStage === 'resolution' && d.roundTicks === 2 * TICK_RATE && d.endReason !== null);
    check(
      d.endReason === 'round-limit'
        ? d.roundNumber === MAX_ROUNDS && sides.every((s) => s.crystalHp > 0)
        : sides.some((s) => s.crystalHp === 0),
    );
    const winner =
      sides[0].crystalHp === sides[1].crystalHp
        ? null
        : sides[0].crystalHp > sides[1].crystalHp
          ? 0
          : 1;
    check(
      d.winner === winner && d.phase === (winner === null ? 'draw' : winner === 0 ? 'won' : 'lost'),
    );
  }
  if (d.roundStage !== 'planning') check(sides.every((s) => s.formation.every((c) => c.entered)));
  if (d.phase !== 'running')
    check(sides.every((s) => !s.inspired && [...s.hand, ...s.formation].every((c) => !c.ward)));
  if (d.roundStage === 'battle')
    check(
      d.roundWinner === null && d.roundDamage === 0 && d.roundTicks < ROUND_SECONDS * TICK_RATE,
    );
  check(Array.isArray(d.units) && d.units.length <= POPULATION_CAP * 2);
  if (d.roundStage === 'planning')
    check(
      d.units.length === 0 && d.roundTicks === 0 && d.roundWinner === null && d.roundDamage === 0,
    );
  const unitIds = new Set<number>();
  for (const u of d.units) {
    check(object(u) && (u.side === 0 || u.side === 1));
    check(
      Object.keys(u).every((k) =>
        [
          'id',
          'key',
          'side',
          'level',
          'x',
          'y',
          'hp',
          'maxHp',
          'damage',
          'range',
          'speed',
          'attackTimer',
          'targetId',
          'anim',
          'skillTimer',
          'slowTicks',
          'shield',
          'ward',
          'inspired',
        ].includes(k),
      ),
    );
    const c = sides[u.side].formation.find((c) => c.id === u.id);
    check(c && u.key === c.key && u.level === c.level && integer(u.id, 1) && !unitIds.has(u.id));
    unitIds.add(u.id);
    const spec = getSpec(c.key);
    check(typeof u.ward === 'boolean' && typeof u.inspired === 'boolean');
    if (d.phase === 'running') check(u.ward === c.ward && u.inspired === sides[u.side].inspired);
    const expected = makeUnit({ ...c, ward: u.ward }, u.side, {
      ...sides[u.side],
      inspired: u.inspired,
    });
    check(
      u.maxHp === expected.maxHp &&
        u.damage === expected.damage &&
        u.range === spec.range &&
        u.speed === spec.speed,
    );
    check(
      integer(u.hp, 1, u.maxHp as number) &&
        finite(u.x, 20, 980) &&
        finite(u.y, 18, 342) &&
        finite(u.attackTimer, 0, spec.interval) &&
        finite(u.skillTimer, 0, 6) &&
        integer(u.slowTicks, 0, 30) &&
        integer(u.shield, 0, Math.max(expected.shield, Math.round(expected.maxHp * 0.18))),
    );
    check(u.targetId === null || integer(u.targetId, 1, d.nextId - 1));
    check(['spawn', 'move', 'attack', 'idle', 'hit', 'skill'].includes(String(u.anim)));
  }
  if (d.roundStage === 'resolution') {
    const units = d.units as unknown as Unit[];
    const alive = [
      units.filter((u) => u.side === 0).length,
      units.filter((u) => u.side === 1).length,
    ];
    const winner = alive[0] && !alive[1] ? 0 : alive[1] && !alive[0] ? 1 : null;
    check(d.roundWinner === winner && d.roundDamage === crystalDamage(units, winner));
    if (d.phase === 'running') check(d.roundTicks < 2 * TICK_RATE);
  }
  check(Array.isArray(d.events) && d.events.length <= 64);
  const eventIds = new Set<number>();
  for (const e of d.events) {
    check(object(e) && integer(e.id, 1, d.nextId - 1) && !eventIds.has(e.id) && !cardIds.has(e.id));
    check(
      Object.keys(e).every((k) =>
        ['id', 'tick', 'type', 'side', 'x', 'y', 'key', 'unitId', 'targetId', 'value'].includes(k),
      ),
    );
    eventIds.add(e.id);
    check(
      integer(e.tick, 0, d.tick) &&
        [
          'assemble',
          'deploy',
          'merge',
          'round-start',
          'attack',
          'skill',
          'hit',
          'death',
          'round-result',
          'crystal-hit',
          'result',
        ].includes(String(e.type)) &&
        (e.side === 0 || e.side === 1) &&
        finite(e.x, 0, 1000) &&
        finite(e.y, 0, 360),
    );
    if (e.key !== undefined)
      check(typeof e.key === 'string' && CATALOG.some((s) => s.id === e.key));
    for (const key of ['unitId', 'targetId'])
      if (e[key] !== undefined) check(integer(e[key], 1, d.nextId - 1));
    if (e.value !== undefined) check(finite(e.value));
  }
  check(Array.isArray(d.commands) && d.commands.length <= 4096);
  const seq = [...d.commandStart];
  let lastTick = 0;
  for (const c of d.commands) {
    check(
      object(c) &&
        Object.keys(c).every((k) => ['tick', 'side', 'seq', 'action'].includes(k)) &&
        (c.side === 0 || c.side === 1) &&
        integer(c.tick, lastTick, d.tick) &&
        c.seq === ++seq[c.side] &&
        actionValid(c.action),
    );
    check(
      (c.action.matchId === undefined || c.action.matchId === d.id) &&
        (c.action.seq === undefined || c.action.seq === c.seq),
    );
    lastTick = c.tick;
  }
  check(seq.every((n, i) => n === (d.sequences as number[])[i]));
  check(object(d.maxLevels));
  for (const [key, n] of Object.entries(d.maxLevels))
    check(CATALOG.some((s) => s.id === key) && typeof n === 'number' && safeLevel(getSpec(key), n));
  return copy(d) as unknown as Match;
}
