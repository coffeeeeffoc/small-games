import { CATALOG, CONTENT_VERSION, LEVELS, getSpec } from './content.ts';
import type { Kind, Level, Spec } from './content.ts';

export const TICK_RATE = 20;
export const POPULATION_CAP = 40;
export const RULE_VERSION = 1;
export const DRAW_COST = 30;
export type SideId = 0 | 1;
export interface Slot {
  key: string;
  level: number;
  parts: boolean[];
  progress: number;
}
export interface Side {
  coins: number;
  crystalHp: number;
  maxCrystalHp: number;
  bag: Record<string, number>;
  slots: Slot[];
  deck: string[];
  draws: Record<Kind, number>;
  buffTicks: number;
  boostUsed: boolean;
  nextAITick: number;
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
}
export type Action = (
  | { type: 'draw'; kind: Kind }
  | { type: 'fill'; slot: number; part: string }
  | { type: 'fillAll'; slot: number }
  | { type: 'merge'; from: number; to: number }
  | { type: 'recipe'; slot: number; key: string }
  | { type: 'exchange'; key: string; index: number }
  | { type: 'withdraw'; slot: number; index?: number }
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
  sides: [Side, Side];
  units: Unit[];
  events: MatchEvent[];
  nextId: number;
  assisted: boolean;
  rng: [number, number];
  spawnRng: [number, number];
  sequences: [number, number];
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
const crystal = (side: SideId): { x: number; y: number } => ({ x: side === 0 ? 50 : 950, y: 180 });
const other = (side: SideId): SideId => (side === 0 ? 1 : 0);
const slotKind = (index: number): Kind => (index < 3 ? 'hero' : 'weapon');
const scaled = (base: number, level: number): number => Math.round(base * (1 + (level - 1) * 0.45));
function safeLevel(spec: Spec, level: number): boolean {
  // Reserve arithmetic headroom for simultaneous attacks and support from the full population.
  const ceiling = Math.floor(Number.MAX_SAFE_INTEGER / (POPULATION_CAP * 4));
  return (
    integer(level) &&
    integer(scaled(spec.hp, level), 0, ceiling) &&
    integer(scaled(spec.damage, level), 0, ceiling)
  );
}
function getLevel(id: string): Level {
  const level = LEVELS.find((l) => l.id === id);
  if (!level) throw new Error(`Unknown level: ${String(id)}`);
  return level;
}
function deckValid(deck: unknown, level: Level): deck is string[] {
  return (
    Array.isArray(deck) &&
    new Set(deck).size === deck.length &&
    deck.every((id) => typeof id === 'string' && level.allowed.includes(id)) &&
    (['hero', 'weapon'] as const).every((kind) => {
      const n = deck.filter((id) => getSpec(id).kind === kind).length;
      return n > 0 && n <= (kind === 'hero' ? 3 : 2);
    })
  );
}
function partInfo(part: string): { spec: Spec; index: number } | null {
  if (typeof part !== 'string') return null;
  const found = /^([a-z]+):(0|[1-9]\d*)$/.exec(part);
  const spec = found && CATALOG.find((s) => s.id === found[1]);
  if (!found || !spec || !integer(Number(found[2]), 0, spec.parts.length - 1)) return null;
  return { spec, index: Number(found[2]) };
}
function random(stream: [number, number], side: SideId): number {
  stream[side] = (Math.imul(stream[side], 1664525) + 1013904223) >>> 0;
  return stream[side] / 4294967296;
}
function addPart(side: Side, key: string, index: number, amount = 1): void {
  const part = `${key}:${index}`;
  side.bag[part] = (side.bag[part] || 0) + amount;
}
function refund(side: Side, slot: Slot): void {
  slot.parts.forEach((filled, i) => {
    if (filled) addPart(side, slot.key, i);
  });
  slot.parts.fill(false);
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
function makeSide(level: Level, deck: string[], tutorial: boolean): Side {
  const heroes = deck.filter((id) => getSpec(id).kind === 'hero');
  const weapons = deck.filter((id) => getSpec(id).kind === 'weapon');
  const slots = Array.from({ length: 5 }, (_, index) => {
    const keys = index < 3 ? heroes : weapons;
    const key = keys[(index < 3 ? index : index - 3) % keys.length];
    return { key, level: 0, parts: getSpec(key).parts.map(() => false), progress: 0 };
  });
  const side: Side = {
    coins: level.initialCoins,
    crystalHp: level.crystalHp,
    maxCrystalHp: level.crystalHp,
    bag: {},
    slots,
    deck: [...deck],
    draws: { hero: 0, weapon: 0 },
    buffTicks: 0,
    boostUsed: false,
    nextAITick: level.ai.warmupTicks,
    kills: { hero: 0, weapon: 0 },
  };
  for (const key of [heroes[0], weapons[0]])
    getSpec(key).parts.forEach((_, i) => addPart(side, key, i));
  if (tutorial) getSpec(heroes[0]).parts.forEach((_, i) => addPart(side, heroes[0], i));
  return side;
}
export function createMatch(
  levelId: string,
  seed: number,
  deck?: string[],
  options: { tutorial?: boolean; practice?: boolean } = {},
): Match {
  const level = getLevel(levelId);
  if (!integer(seed, 0, 0xffffffff)) throw new Error('Seed must be a uint32');
  const playerDeck = deck ?? ['nezha', 'fire'];
  if (!deckValid(playerDeck, level)) throw new Error('Invalid deck');
  if (
    (options.tutorial !== undefined && typeof options.tutorial !== 'boolean') ||
    (options.practice !== undefined && typeof options.practice !== 'boolean')
  )
    throw new Error('Invalid options');
  const tutorial = options.tutorial === true;
  return {
    version: RULE_VERSION,
    contentVersion: CONTENT_VERSION,
    id: `mf-${Date.now().toString(36)}-${++matchSerial}-${Math.random().toString(36).slice(2, 10)}`,
    levelId,
    seed,
    tick: 0,
    phase: 'running',
    paused: false,
    winner: null,
    sides: [makeSide(level, playerDeck, tutorial), makeSide(level, level.ai.deck, tutorial)],
    units: [],
    events: [],
    nextId: 1,
    assisted: false,
    rng: [seed, (seed ^ 0x6d2b79f5) >>> 0],
    spawnRng: [(seed ^ 0xa341316c) >>> 0, (seed ^ 0xa341316c) >>> 0],
    sequences: [0, 0],
    commands: [],
    tutorial,
    tutorialStep: tutorial ? 0 : 6,
    practice: options.practice === true,
    maxLevels: {},
  };
}

function updateTutorial(state: Match): void {
  if (!state.tutorial || state.tutorialStep === 6) return;
  const side = state.sides[0];
  if (state.tutorialStep === 0 && side.draws.hero > 0) state.tutorialStep = 1;
  if (state.tutorialStep === 1 && side.slots.slice(0, 3).some((s) => s.level > 0))
    state.tutorialStep = 2;
  if (
    state.tutorialStep === 2 &&
    state.units.some((u) => u.side === 0 && getSpec(u.key).kind === 'hero')
  )
    state.tutorialStep = 3;
  if (state.tutorialStep === 3 && side.slots.slice(3).some((s) => s.level > 0))
    state.tutorialStep = 4;
  if (state.tutorialStep === 4 && side.slots.slice(0, 3).some((s) => s.level >= 2))
    state.tutorialStep = 5;
}
function surplus(side: Side, kind: Kind, excluded: string): Array<[string, number]> {
  const needed: Record<string, number> = {};
  for (const slot of side.slots)
    slot.parts.forEach((filled, i) => {
      const part = `${slot.key}:${i}`;
      if (!filled) needed[part] = (needed[part] || 0) + 1;
    });
  return Object.keys(side.bag)
    .sort()
    .filter((p) => p !== excluded && partInfo(p)?.spec.kind === kind)
    .map((p) => [p, Math.max(0, side.bag[p] - (needed[p] || 0))]);
}
export function command(state: Match, sideId: SideId, action: Action): CommandResult {
  const fail = (message: string): CommandResult => ({ ok: false, message });
  if (sideId !== 0 && sideId !== 1) return fail('无效阵营');
  if (
    !action ||
    typeof action !== 'object' ||
    (action.matchId !== undefined && action.matchId !== state.id) ||
    (action.version !== undefined && action.version !== RULE_VERSION)
  )
    return fail('命令版本或对局不符');
  const fields: Record<string, string[]> = {
    draw: ['kind'],
    fill: ['slot', 'part'],
    fillAll: ['slot'],
    merge: ['from', 'to'],
    recipe: ['slot', 'key'],
    exchange: ['key', 'index'],
    withdraw: ['slot', 'index'],
    pause: ['paused'],
    skipTutorial: [],
  };
  if (
    !Object.prototype.hasOwnProperty.call(fields, action.type) ||
    Object.keys(action).some(
      (key) => !['type', 'matchId', 'seq', 'version', ...fields[action.type]].includes(key),
    )
  )
    return fail('未知命令字段');
  if (
    action.seq !== undefined &&
    (!integer(action.seq, 1) || action.seq !== state.sequences[sideId] + 1)
  )
    return fail('重复或乱序命令');
  if (state.phase !== 'running') return fail('对局已结束');
  if (state.paused && action.type !== 'pause') return fail('请先继续对局');
  const side = state.sides[sideId];
  const slot = 'slot' in action && integer(action.slot, 0, 4) ? side.slots[action.slot] : null;
  switch (action.type) {
    case 'pause':
      if (sideId !== 0 || typeof action.paused !== 'boolean' || action.paused === state.paused)
        return fail('无效暂停操作');
      state.paused = action.paused;
      break;
    case 'skipTutorial':
      if (sideId !== 0 || !state.tutorial || state.tutorialStep === 6) return fail('当前没有引导');
      state.tutorialStep = 6;
      break;
    case 'draw': {
      if (action.kind !== 'hero' && action.kind !== 'weapon') return fail('无效抽取类别');
      if (side.coins < DRAW_COST) return fail('灵石不足');
      const pool = side.deck
        .filter((id) => getSpec(id).kind === action.kind)
        .flatMap((id) => getSpec(id).parts.map((_, i) => `${id}:${i}`));
      const missing = side.slots
        .filter((s) => getSpec(s.key).kind === action.kind && s.parts.some(Boolean))
        .flatMap((s) =>
          s.parts.flatMap((filled, i) =>
            !filled && !side.bag[`${s.key}:${i}`] ? [`${s.key}:${i}`] : [],
          ),
        );
      side.coins = round(side.coins - DRAW_COST);
      side.draws[action.kind]++;
      for (let i = 0; i < 3; i++) {
        const p =
          i === 2 && side.draws[action.kind] % 3 === 0 && missing.length
            ? missing[0]
            : pool[Math.floor(random(state.rng, sideId) * pool.length)];
        side.bag[p] = (side.bag[p] || 0) + 1;
      }
      break;
    }
    case 'fill':
    case 'fillAll': {
      if (!slot) return fail('无效生产位');
      const indices =
        action.type === 'fill' ? [partInfo(action.part)?.index ?? -1] : slot.parts.map((_, i) => i);
      if (action.type === 'fill' && partInfo(action.part)?.spec.id !== slot.key)
        return fail('残字不属于此配方');
      const available = indices.filter(
        (i) => i >= 0 && !slot.parts[i] && (side.bag[`${slot.key}:${i}`] || 0) > 0,
      );
      if (!available.length) return fail('没有可填入的残字');
      if (!safeLevel(getSpec(slot.key), slot.level + 1)) return fail('等级超出安全数值范围');
      for (const i of available) {
        side.bag[`${slot.key}:${i}`]--;
        slot.parts[i] = true;
      }
      if (slot.parts.every(Boolean)) {
        slot.level++;
        slot.parts.fill(false);
        emit(state, 'assemble', sideId, { key: slot.key, value: slot.level });
      }
      break;
    }
    case 'withdraw': {
      if (!slot || (action.index !== undefined && !integer(action.index, 0, slot.parts.length - 1)))
        return fail('无效字位');
      const indices = slot.parts
        .map((_, i) => i)
        .filter((i) => slot.parts[i] && (action.index === undefined || action.index === i));
      if (!indices.length) return fail('没有未完成材料');
      for (const i of indices) {
        addPart(side, slot.key, i);
        slot.parts[i] = false;
      }
      break;
    }
    case 'recipe': {
      if (
        !slot ||
        slot.level !== 0 ||
        !side.deck.includes(action.key) ||
        getSpec(action.key).kind !== slotKind(action.slot) ||
        slot.key === action.key
      )
        return fail('只能更换空位的同类配方');
      refund(side, slot);
      slot.key = action.key;
      slot.parts = getSpec(action.key).parts.map(() => false);
      slot.progress = 0;
      break;
    }
    case 'merge': {
      if (!integer(action.from, 0, 4) || !integer(action.to, 0, 4) || action.from === action.to)
        return fail('无效合并位置');
      const from = side.slots[action.from],
        to = side.slots[action.to];
      if (
        !from.level ||
        !to.level ||
        from.key !== to.key ||
        !safeLevel(getSpec(to.key), from.level + to.level)
      )
        return fail('只能合并同名兵符，等级须在安全数值范围');
      refund(side, from);
      refund(side, to);
      to.level += from.level;
      to.progress = Math.min(from.progress, to.progress);
      from.level = 0;
      from.progress = 0;
      emit(state, 'merge', sideId, { key: to.key, value: to.level });
      break;
    }
    case 'exchange': {
      if (
        !side.deck.includes(action.key) ||
        !integer(action.index, 0, getSpec(action.key).parts.length - 1)
      )
        return fail('兑换目标不在本局残字池');
      const part = `${action.key}:${action.index}`;
      const material = surplus(side, getSpec(action.key).kind, part);
      if (material.reduce((n, [, count]) => n + count, 0) < 3) return fail('需要三枚同类别余字');
      let remaining = 3;
      for (const [p, count] of material) {
        const amount = Math.min(count, remaining);
        side.bag[p] -= amount;
        remaining -= amount;
        if (!remaining) break;
      }
      addPart(side, action.key, action.index);
      break;
    }
    default:
      return fail('未知操作');
  }
  if (sideId === 0)
    for (const s of side.slots)
      if (s.level > 0) state.maxLevels[s.key] = Math.max(state.maxLevels[s.key] || 0, s.level);
  updateTutorial(state);
  const seq = ++state.sequences[sideId];
  state.commands.push({ tick: state.tick, side: sideId, seq, action: copy(action) });
  return { ok: true, message: '操作成功' };
}

export function runAI(state: Match, sideId: SideId): CommandResult | null {
  if ((sideId !== 0 && sideId !== 1) || state.phase !== 'running' || state.paused) return null;
  const side = state.sides[sideId],
    config = getLevel(state.levelId).ai;
  if (state.tick < side.nextAITick) return null;
  side.nextAITick = state.tick + config.decisionTicks;
  const enemies = state.units.filter((u) => u.side !== sideId);
  const pressure = enemies.filter((u) => distance(u, crystal(sideId)) < 280).length;
  const slots = side.slots
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.level - b.s.level || a.i - b.i);
  for (const { s, i } of slots)
    if (s.parts.some((filled, index) => !filled && side.bag[`${s.key}:${index}`] > 0))
      return command(state, sideId, { type: 'fillAll', slot: i });
  if (config.style === 'focus') {
    for (const { s, i } of slots) {
      const to = side.slots.findIndex((t, j) => j !== i && t.key === s.key && t.level >= s.level);
      if (s.level >= 2 && to >= 0) return command(state, sideId, { type: 'merge', from: i, to });
    }
  }
  for (const { s } of slots)
    for (let i = 0; i < s.parts.length; i++) {
      if (
        !s.parts[i] &&
        !side.bag[`${s.key}:${i}`] &&
        surplus(side, getSpec(s.key).kind, `${s.key}:${i}`).reduce(
          (n, [, count]) => n + count,
          0,
        ) >= 3
      )
        return command(state, sideId, { type: 'exchange', key: s.key, index: i });
    }
  if (side.coins < DRAW_COST + (pressure ? 0 : config.reserve)) return null;
  let chosen = slots[0];
  if (config.style === 'counter' && enemies.length) {
    chosen = [...slots].sort((a, b) => {
      const score = (s: Slot): number =>
        (pressure && getSpec(s.key).hp >= 390 ? 2 : 0) +
        (enemies.length > 8 && getSpec(s.key).splash ? 2 : 0) -
        s.level;
      return score(b.s) - score(a.s) || a.i - b.i;
    })[0];
  }
  return command(state, sideId, { type: 'draw', kind: getSpec(chosen.s.key).kind });
}

function produce(state: Match, sideId: SideId): void {
  const side = state.sides[sideId];
  side.coins = round(
    side.coins + getLevel(state.levelId).income * dt * (side.buffTicks > 0 ? 1.2 : 1),
  );
  if (side.buffTicks > 0) side.buffTicks--;
  let population = state.units.filter((u) => u.side === sideId).length;
  for (const slot of side.slots) {
    if (!slot.level) continue;
    const spec = getSpec(slot.key);
    slot.progress = Math.min(spec.production, round(slot.progress + dt));
    if (slot.progress < spec.production || population >= POPULATION_CAP) continue;
    slot.progress = 0;
    population++;
    const pos = crystal(sideId);
    const unit: Unit = {
      id: state.nextId++,
      key: slot.key,
      side: sideId,
      level: slot.level,
      x: pos.x + (sideId === 0 ? 28 : -28),
      y: round(pos.y + (random(state.spawnRng, sideId) - 0.5) * 36),
      hp: scaled(spec.hp, slot.level),
      maxHp: scaled(spec.hp, slot.level),
      damage: scaled(spec.damage, slot.level),
      range: spec.range,
      speed: spec.speed,
      attackTimer: 0,
      targetId: null,
      anim: 'spawn',
      skillTimer: 0,
      slowTicks: 0,
      shield: 0,
    };
    state.units.push(unit);
    emit(state, 'spawn', sideId, {
      key: unit.key,
      unitId: unit.id,
      x: unit.x,
      y: unit.y,
      value: unit.level,
    });
  }
}
function fight(state: Match): void {
  const units = state.units;
  const damage = new Map<number, number>();
  const credit = new Map<number, Unit>();
  const slow = new Set<number>();
  const healing = new Map<number, number>();
  const shielding = new Map<number, number>();
  const moves = new Map<number, { x: number; y: number }>();
  const crystalDamage = [0, 0];
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
      if (d <= 300 && (d < nearest || (d === nearest && enemy.id < (target?.id ?? Infinity)))) {
        target = enemy;
        nearest = d;
      }
    }
    const old = enemies.find((e) => e.id === unit.targetId);
    if (old && distance(unit, old) <= 330 && distance(unit, old) <= nearest + 12) target = old;
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
      unit.attackTimer = spec.interval;
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
            hurt(enemy, unit, Math.round(unit.damage * 0.55));
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
      } else {
        const exposure = state.tick >= 240 * TICK_RATE ? 2 : 1;
        crystalDamage[other(unit.side)] +=
          unit.damage * exposure * (spec.special === 'siege' ? 2 : 1);
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
        side.coins = round(side.coins + 2);
        side.kills[getSpec(killer.key).kind]++;
      }
      emit(state, 'death', unit.side, { unitId: unit.id, key: unit.key, x: unit.x, y: unit.y });
    }
  }
  state.units = units.filter((u) => u.hp > 0);
  for (const side of [0, 1] as const)
    state.sides[side].crystalHp = Math.max(0, state.sides[side].crystalHp - crystalDamage[side]);
  const leftDead = state.sides[0].crystalHp <= 0,
    rightDead = state.sides[1].crystalHp <= 0;
  if (leftDead || rightDead) {
    state.phase = leftDead && rightDead ? 'draw' : rightDead ? 'won' : 'lost';
    state.winner = leftDead && rightDead ? null : rightDead ? 0 : 1;
    emit(state, 'result', state.winner ?? 0);
  }
}
export function step(state: Match, ticks = 1): Match {
  if (!integer(ticks)) throw new Error('Ticks must be a nonnegative safe integer');
  for (let i = 0; i < ticks && state.phase === 'running' && !state.paused; i++) {
    state.tick++;
    state.units = state.units.filter((u) => u.hp > 0);
    runAI(state, 1);
    produce(state, 0);
    produce(state, 1);
    fight(state);
    if (state.tutorial && state.tutorialStep === 5) state.tutorialStep = 6;
    updateTutorial(state);
  }
  return state;
}

export function snapshot(state: Match): Match {
  return copy(state);
}
export function restore(input: unknown): Match {
  const data: unknown = typeof input === 'string' ? JSON.parse(input) : input;
  const check: (condition: unknown) => asserts condition = (condition) => {
    if (!condition) throw new Error('Invalid match snapshot');
  };
  check(object(data));
  check(
    data.version === RULE_VERSION &&
      data.contentVersion === CONTENT_VERSION &&
      typeof data.id === 'string' &&
      /^mf-[a-z0-9-]+$/.test(data.id),
  );
  check(typeof data.levelId === 'string');
  const level = getLevel(data.levelId);
  check(integer(data.seed, 0, 0xffffffff) && integer(data.tick) && integer(data.nextId, 1));
  check(
    ['running', 'won', 'lost', 'draw'].includes(String(data.phase)) &&
      typeof data.paused === 'boolean' &&
      (data.winner === null || data.winner === 0 || data.winner === 1),
  );
  check(
    typeof data.assisted === 'boolean' &&
      typeof data.practice === 'boolean' &&
      typeof data.tutorial === 'boolean' &&
      integer(data.tutorialStep, 0, 6),
  );
  for (const field of ['rng', 'spawnRng', 'sequences'])
    check(
      Array.isArray(data[field]) &&
        data[field].length === 2 &&
        data[field].every((n: unknown) =>
          integer(n, 0, field === 'sequences' ? Number.MAX_SAFE_INTEGER : 0xffffffff),
        ),
    );
  check(Array.isArray(data.sides) && data.sides.length === 2);
  for (const side of data.sides) {
    check(object(side) && deckValid(side.deck, level));
    check(
      finite(side.coins) &&
        side.maxCrystalHp === level.crystalHp &&
        finite(side.crystalHp, 0, level.crystalHp),
    );
    check(
      integer(side.buffTicks, 0, 600) &&
        typeof side.boostUsed === 'boolean' &&
        (!side.buffTicks || side.boostUsed) &&
        integer(side.nextAITick),
    );
    check(object(side.draws) && integer(side.draws.hero) && integer(side.draws.weapon));
    check(object(side.kills) && integer(side.kills.hero) && integer(side.kills.weapon));
    check(object(side.bag));
    for (const [p, count] of Object.entries(side.bag))
      check(partInfo(p) && side.deck.includes(partInfo(p)!.spec.id) && integer(count));
    check(Array.isArray(side.slots) && side.slots.length === 5);
    for (const [i, slot] of side.slots.entries()) {
      check(object(slot) && typeof slot.key === 'string' && side.deck.includes(slot.key));
      const spec = getSpec(slot.key);
      check(
        spec.kind === slotKind(i) && typeof slot.level === 'number' && safeLevel(spec, slot.level),
      );
      check(
        Array.isArray(slot.parts) &&
          slot.parts.length === spec.parts.length &&
          slot.parts.every((p) => typeof p === 'boolean') &&
          !slot.parts.every(Boolean),
      );
      check(finite(slot.progress, 0, spec.production) && (slot.level > 0 || slot.progress === 0));
    }
  }
  check(!data.sides[1].boostUsed && data.assisted === data.sides[0].boostUsed);
  const dead = data.sides.map((s) => s.crystalHp === 0);
  check(
    data.phase === (dead[0] && dead[1] ? 'draw' : dead[0] ? 'lost' : dead[1] ? 'won' : 'running'),
  );
  check(data.winner === (data.phase === 'won' ? 0 : data.phase === 'lost' ? 1 : null));
  check(Array.isArray(data.units) && data.units.length <= 80);
  const unitIds = new Set<number>();
  for (const unit of data.units) {
    check(object(unit) && integer(unit.id, 1, data.nextId - 1) && !unitIds.has(unit.id));
    unitIds.add(unit.id);
    check(
      (unit.side === 0 || unit.side === 1) &&
        typeof unit.key === 'string' &&
        data.sides[unit.side].deck.includes(unit.key),
    );
    const spec = getSpec(unit.key);
    check(
      integer(unit.level, 1) &&
        safeLevel(spec, unit.level) &&
        unit.maxHp === scaled(spec.hp, unit.level) &&
        unit.damage === scaled(spec.damage, unit.level),
    );
    check(finite(unit.hp, 0.001, unit.maxHp) && finite(unit.x, 20, 980) && finite(unit.y, 18, 342));
    check(
      unit.range === spec.range &&
        unit.speed === spec.speed &&
        finite(unit.attackTimer, 0, spec.interval) &&
        finite(unit.skillTimer, 0, 6),
    );
    check(integer(unit.slowTicks, 0, 30) && finite(unit.shield, 0, Math.round(unit.maxHp * 0.18)));
    check(unit.targetId === null || integer(unit.targetId, 1, data.nextId - 1));
    check(['spawn', 'move', 'attack', 'idle', 'hit', 'skill'].includes(String(unit.anim)));
  }
  for (const side of [0, 1])
    check(data.units.filter((u) => u.side === side).length <= POPULATION_CAP);
  check(object(data.maxLevels));
  for (const [key, value] of Object.entries(data.maxLevels))
    check(
      level.allowed.includes(key) &&
        typeof value === 'number' &&
        safeLevel(getSpec(key), value) &&
        value > 0,
    );
  check(Array.isArray(data.events) && data.events.length <= 64);
  const eventIds = new Set<number>();
  for (const event of data.events) {
    check(
      object(event) &&
        integer(event.id, 1, data.nextId - 1) &&
        !eventIds.has(event.id) &&
        !unitIds.has(event.id),
    );
    eventIds.add(event.id);
    check(
      integer(event.tick, 0, data.tick) &&
        ['assemble', 'merge', 'spawn', 'attack', 'skill', 'hit', 'death', 'result'].includes(
          String(event.type),
        ),
    );
    check(
      (event.side === 0 || event.side === 1) && finite(event.x, 0, 1000) && finite(event.y, 0, 360),
    );
    if (event.key !== undefined)
      check(typeof event.key === 'string' && level.allowed.includes(event.key));
    for (const field of ['unitId', 'targetId'])
      if (event[field] !== undefined) check(integer(event[field], 1, data.nextId - 1));
    if (event.value !== undefined) check(finite(event.value));
  }
  check(Array.isArray(data.commands));
  const sequences = [0, 0];
  let lastTick = 0;
  for (const entry of data.commands) {
    check(
      object(entry) &&
        (entry.side === 0 || entry.side === 1) &&
        integer(entry.tick, lastTick, data.tick) &&
        entry.seq === ++sequences[entry.side],
    );
    lastTick = entry.tick;
    check(object(entry.action) && typeof entry.action.type === 'string');
    const a = entry.action;
    check(
      [
        'draw',
        'fill',
        'fillAll',
        'merge',
        'recipe',
        'exchange',
        'withdraw',
        'pause',
        'skipTutorial',
      ].includes(String(a.type)),
    );
    if (a.matchId !== undefined) check(a.matchId === data.id);
    if (a.version !== undefined) check(a.version === RULE_VERSION);
    if (a.seq !== undefined) check(a.seq === entry.seq);
    if (a.type === 'draw') check(a.kind === 'hero' || a.kind === 'weapon');
    if (['fill', 'fillAll', 'recipe', 'withdraw'].includes(String(a.type)))
      check(integer(a.slot, 0, 4));
    if (a.type === 'fill') check(typeof a.part === 'string' && partInfo(a.part));
    if (a.type === 'recipe' || a.type === 'exchange')
      check(typeof a.key === 'string' && data.sides[entry.side].deck.includes(a.key));
    if (a.type === 'exchange')
      check(integer(a.index, 0, getSpec(a.key as string).parts.length - 1));
    if (a.type === 'merge') check(integer(a.from, 0, 4) && integer(a.to, 0, 4) && a.from !== a.to);
    if (a.type === 'withdraw' && a.index !== undefined) check(integer(a.index, 0, 3));
    if (a.type === 'pause') check(typeof a.paused === 'boolean' && entry.side === 0);
  }
  check(
    Array.isArray(data.sequences) &&
      sequences[0] === data.sequences[0] &&
      sequences[1] === data.sequences[1],
  );
  return copy(data) as unknown as Match;
}
