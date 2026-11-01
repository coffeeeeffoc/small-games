/* eslint-disable max-lines -- Asset mutations share one locked wallet and immutable event receipts. */
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { CompetitionError, type Room } from './types.js';
import type { RankedRun } from './ranked-types.js';
type Database = ReturnType<typeof openDatabase>['db'];
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type Loadout = { mods: string[]; weapon: string | null; skill: string | null };
export type BattleLoadout = {
  version: string;
  level: number;
  effects: string[];
  skipped: string[];
};
type Product = {
  id: string;
  effect: string;
  category: string;
  term: string;
  price: number;
  sell: number;
  rarity: number;
  name: string;
  description: string;
  goldOnly: boolean;
};
export type ProgressionRules = {
  version: string;
  catalog: Product[];
  packages: { quantity: number; coins: number; videos: number }[];
  pools: Record<
    string,
    { name: string; packSell: number; coinDrops: number[]; weights: number[]; effects: string[] }
  >;
  skills: Record<string, { duration: number; cooldown: number; level: number }>;
  levelProgress(xp: number): { level: number; current: number; required: number };
  validLoadout(value: unknown): boolean;
};
type Reward = { coins: number; xp: number; packs?: number; permanent?: string };
type BattleReward = Reward & {
  totalCoins: number;
  totalXp: number;
  level: number;
  status: 'credited';
};
type Task = {
  id: string;
  day: string;
  name: string;
  event: string;
  target: number;
  progress: number;
  reward: Reward;
  claimed: boolean;
  alternate?: boolean;
};
type Mail = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  claimed: boolean;
  reward: Reward;
};
type VideoOrder = {
  id: string;
  quantity: number;
  required: number;
  completed: number;
  delivered: boolean;
  version: string;
  createdAt: number;
  grants?: Record<string, number>;
  attempt?: { id: string; startedAt: number };
};
type Reservation = {
  snapshot: BattleLoadout;
  items: string[];
  consumedItems?: string[];
  status: 'reserved' | 'consumed' | 'released' | 'refunded';
  expiresAt: number;
};
export type NightAssets = {
  version: 3;
  coins: number;
  xp: number;
  revision: number;
  inventory: Record<string, number>;
  permanent: string[];
  active: Record<string, number>;
  loadouts: { solo: Loadout; duel: Loadout };
  signedDays: string[];
  tasks: Task[];
  achievements: Record<string, { progress: number; claimed: boolean }>;
  mail: Mail[];
  videoOrders: VideoOrder[];
  videoDays: Record<string, number>;
  reservations: Record<string, Reservation>;
  legacy?: Record<string, unknown>;
  migratedAt: number;
};
const quantity = z.number().int().min(1).max(100),
  requestId = z.uuid(),
  item = z.string().min(1).max(80);
export const nightAssetCommandSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('dev-adjust'),
      requestId,
      coinsDelta: z.number().int().min(-1e9).max(1e9).default(0),
      xpDelta: z.number().int().min(-1e9).max(1e9).default(0),
    })
    .strict(),
  z.object({ kind: z.literal('buy'), requestId, item, quantity: quantity.default(1) }).strict(),
  z.object({ kind: z.literal('checkin'), requestId }).strict(),
  z
    .object({
      kind: z.literal('buy-packs'),
      requestId,
      quantity,
      pool: z.enum(['general', 'gold']).default('general'),
    })
    .strict(),
  z.object({ kind: z.literal('ad-order'), requestId, quantity }).strict(),
  z.object({ kind: z.literal('ad-start'), requestId, orderId: z.uuid() }).strict(),
  z
    .object({ kind: z.literal('ad-complete'), requestId, orderId: z.uuid(), attemptId: z.uuid() })
    .strict(),
  z.object({ kind: z.literal('open'), requestId, item, quantity }).strict(),
  z.object({ kind: z.literal('sell'), requestId, item, quantity }).strict(),
  z.object({ kind: z.literal('activate'), requestId, item }).strict(),
  z
    .object({
      kind: z.literal('loadout'),
      requestId,
      mode: z.enum(['solo', 'duel']),
      loadout: z
        .object({ mods: z.array(item).max(2), weapon: item.nullable(), skill: item.nullable() })
        .strict(),
    })
    .strict(),
  z.object({ kind: z.literal('claim-task'), requestId, taskId: item }).strict(),
  z.object({ kind: z.literal('claim-all'), requestId }).strict(),
  z.object({ kind: z.literal('alternate-task'), requestId, taskId: item }).strict(),
  z.object({ kind: z.literal('read-mail'), requestId, mailId: item }).strict(),
  z.object({ kind: z.literal('claim-mail'), requestId, mailId: item }).strict(),
  z.object({ kind: z.literal('claim-achievement'), requestId, achievementId: item }).strict(),
]);
export type AssetCommand = z.infer<typeof nightAssetCommandSchema>;
const board = 'night-overwatch:private-assets-v3';
const walletId = (owner: string) => `night-assets:${owner}`;
const eventId = (owner: string, event: string) => `night-assets-event:${owner}:${event}`;
export const nightDay = (at: number) => new Date(at + 8 * 3600000).toISOString().slice(0, 10);
const cutoff = Date.parse('2026-11-01T00:00:00+08:00');
const fail = (code: string): never => {
  throw new CompetitionError(code, 422);
};
const emptyLoadout = (): Loadout => ({ mods: [], weapon: null, skill: null });
const integer = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, canonical(x)]),
        )
      : v;
const signature = (v: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(v)))
    .digest('hex');
const ACHIEVEMENTS = [
  {
    id: 'sorties-10',
    name: '十次出动',
    event: 'complete',
    target: 10,
    reward: { coins: 300, xp: 150, packs: 2 },
  },
  {
    id: 'victories-25',
    name: '常胜守望',
    event: 'win',
    target: 25,
    reward: { coins: 500, xp: 300, permanent: 'tracking' },
  },
  {
    id: 'sorties-100',
    name: '百战守望',
    event: 'complete',
    target: 100,
    reward: { coins: 1000, xp: 500, permanent: 'emp' },
  },
];
const templates = [
  {
    id: 'checkin',
    name: '完成今日签到',
    event: 'checkin',
    target: 1,
    reward: { coins: 60, xp: 40 },
  },
  {
    id: 'solo',
    name: '完成 2 次单人任务',
    event: 'solo',
    target: 2,
    reward: { coins: 120, xp: 80 },
  },
  {
    id: 'duel',
    name: '完成 2 次双人对战',
    event: 'duel',
    target: 2,
    reward: { coins: 120, xp: 80 },
  },
  { id: 'open', name: '打开 1 个礼包', event: 'open', target: 1, reward: { coins: 40, xp: 30 } },
  {
    id: 'complete',
    name: '完成 3 次有效行动',
    event: 'complete',
    target: 3,
    reward: { coins: 140, xp: 90 },
  },
  { id: 'win', name: '赢得 1 次行动', event: 'win', target: 1, reward: { coins: 100, xp: 70 } },
];
function prepare(w: NightAssets, owner: string, at: number, rules: ProgressionRules) {
  const day = nightDay(at),
    oldest = nightDay(at - 7 * 86400000);
  w.tasks = w.tasks.filter((t) => t.day >= oldest);
  if (!w.tasks.some((t) => t.day === day)) {
    const seed = createHash('sha256').update(`${owner}:${day}`).digest().readUInt32LE();
    const selected = [
      templates[0]!,
      templates[1]!,
      templates[3]!,
      templates[2 + (seed % 3 === 0 ? 0 : (seed % 3) + 1)]!,
    ];
    w.tasks.push(
      ...selected.map((t) => ({
        ...structuredClone(t),
        id: `${day}:${t.id}`,
        day,
        progress: 0,
        claimed: false,
      })),
    );
  }
  for (const a of ACHIEVEMENTS) w.achievements[a.id] ??= { progress: 0, claimed: false };
  const level = rules.levelProgress(w.xp).level;
  for (const [effect, skill] of Object.entries(rules.skills))
    if (level >= skill.level && !w.permanent.includes(effect)) w.permanent.push(effect);
  for (const reservation of Object.values(w.reservations))
    if (reservation.status === 'reserved' && reservation.expiresAt <= at)
      reservation.status = 'released';
}
function add(w: NightAssets, reward: Reward) {
  w.coins += reward.coins;
  w.xp += reward.xp;
  if (reward.packs) stock(w, 'pack:general:0', reward.packs);
  if (reward.permanent && !w.permanent.includes(reward.permanent))
    w.permanent.push(reward.permanent);
  if (!Number.isSafeInteger(w.coins) || !Number.isSafeInteger(w.xp)) fail('ASSET_LIMIT');
}
function stock(w: NightAssets, id: string, n: number) {
  const value = (w.inventory[id] ?? 0) + n;
  if (!Number.isSafeInteger(value) || value < 0) fail('INSUFFICIENT_INVENTORY');
  w.inventory[id] = value;
}
function reserved(w: NightAssets, id: string) {
  return Object.values(w.reservations)
    .filter((r) => r.status === 'reserved')
    .reduce((n, r) => n + r.items.filter((i) => i === id).length, 0);
}
function available(w: NightAssets, id: string) {
  return (w.inventory[id] ?? 0) - reserved(w, id);
}
function progress(w: NightAssets, day: string, events: string[], count = 1) {
  for (const task of w.tasks)
    if (task.day === day && events.includes(task.event))
      task.progress = Math.min(task.target, task.progress + count);
  for (const a of ACHIEVEMENTS)
    if (events.includes(a.event))
      w.achievements[a.id]!.progress = Math.min(a.target, w.achievements[a.id]!.progress + count);
}
/** Read-only legacy compensation preview; legacy JSON and its ledger are never deleted. */
export async function previewNightMigration(tx: Tx | Database, owner: string) {
  const old = await tx.execute(
    sql`select data from runtime.competition_matches where id=${`night-wallet:${owner}`}`,
  );
  const legacy = old[0]?.data as Record<string, unknown> | undefined;
  const result =
    await tx.execute(sql`select count(distinct match_id)::int as count from runtime.competition_results
    where player_id=${owner} and board like 'night-overwatch:%' and score>0 and created_at<${cutoff}`);
  const players = await tx.execute(
    sql`select created_at from runtime.competition_players where id=${owner}`,
  );
  const historical = Number(result[0]?.count ?? 0),
    veteran = !!legacy || Number(players[0]?.created_at ?? Infinity) < cutoff;
  const legacyPrices: Record<string, number[]> =
    legacy?.version === 2
      ? {
          power: [0, 900],
          velocity: [0, 600],
          duration: [0, 600],
          hePower: [300, 600, 1200],
          heVelocity: [300, 600, 1200],
          heavyPower: [300, 600, 1200],
          heavyVelocity: [300, 600, 1200],
          spread: [300, 600, 1200],
          emp: [7900, 10000, 14000],
        }
      : {
          power: [0, 900],
          velocity: [0, 600],
          duration: [0, 600],
          spread: [300, 750],
          emp: [1200],
        };
  const checkins = await tx.execute(
    sql`select created_at from runtime.competition_matches where board='night-overwatch:private-wallet-v1' and id like ${`night-wallet-event:${owner}:request:%`} and data->>'signature'='checkin'`,
  );
  const signedDays = [
    ...new Set(
      [
        ...(Array.isArray(legacy?.signedDays) ? legacy.signedDays : []),
        legacy?.signed,
        ...checkins.map((row) => nightDay(Number(row.created_at))),
      ].filter(
        (value): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value),
      ),
    ),
  ].sort();
  let conversionCoins = 0;
  for (const [id, tier] of Object.entries((legacy?.owned as Record<string, unknown>) ?? {}))
    conversionCoins += (legacyPrices[id] ?? [])
      .slice(0, Math.min(3, integer(tier)))
      .reduce((n, p) => n + p, 0);
  for (const [key, count] of Object.entries((legacy?.trials as Record<string, unknown>) ?? {})) {
    const [id, tier] = key.split(':');
    conversionCoins += (legacyPrices[id!]?.[Number(tier) - 1] ?? 0) * integer(count);
  }
  return {
    version: 'night-return-2026-11-01',
    cutoff,
    legacy: legacy ? structuredClone(legacy) : undefined,
    preservedCoins: integer(legacy?.coins),
    veteran,
    historical,
    conversionCoins,
    signedDays,
    reward: {
      coins: (veteran ? 200 + Math.min(10000, historical * 60) : 200) + conversionCoins,
      xp: veteran ? Math.min(6000, historical * 40) : 0,
      packs: veteran ? 3 : 1,
    },
  };
}
async function locked(tx: Tx, owner: string, at: number, rules: ProgressionRules) {
  // Asset lock never acquires another player's identity lock, including two-player settlement.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${walletId(owner)},0))`);
  const existing = await tx.execute(
    sql`select data from runtime.competition_matches where id=${walletId(owner)} for update`,
  );
  let w = existing[0]?.data as NightAssets | undefined;
  if (!w) {
    const migration = await previewNightMigration(tx, owner),
      legacy = migration.legacy;
    w = {
      version: 3,
      coins: migration.preservedCoins,
      xp: 0,
      revision: 0,
      inventory: {},
      permanent: [],
      active: {},
      loadouts: { solo: emptyLoadout(), duel: emptyLoadout() },
      signedDays: migration.signedDays,
      tasks: [],
      achievements: {},
      mail: [
        {
          id: migration.version,
          title: migration.veteran ? '老玩家补偿' : '欢迎加入夜航',
          body: `历史积分、进度与累计签到已保留。旧军需转换为新体系资格，按原版本目录价值补为 ${migration.conversionCoins} 金币；原始资产记录保留。附件只可领取一次。`,
          createdAt: at,
          read: false,
          claimed: false,
          reward: migration.reward,
        },
      ],
      videoOrders: [],
      videoDays: {},
      reservations: {},
      legacy,
      migratedAt: at,
    };
    if (legacy) {
      const inventory = legacy.inventory as Record<string, unknown> | undefined;
      for (const [id, count] of Object.entries(inventory ?? {}))
        if (integer(count)) {
          w.inventory[`legacy:${id}`] = integer(count);
          if (id === 'coolant') w.inventory['cooling-match'] = integer(count);
        }
      const owned = legacy.owned as Record<string, unknown> | undefined;
      for (const [id, count] of Object.entries(owned ?? {}))
        if (integer(count)) {
          const effect = ['power', 'hePower', 'heavyPower'].includes(id)
            ? 'power'
            : ['velocity', 'heVelocity', 'heavyVelocity'].includes(id)
              ? 'rate'
              : id === 'spread' || id === 'duration'
                ? 'radius'
                : id === 'emp'
                  ? 'emp'
                  : null;
          if (effect && !w.permanent.includes(effect)) w.permanent.push(effect);
        }
      for (const [id, count] of Object.entries((legacy.trials as Record<string, unknown>) ?? {}))
        if (integer(count)) w.inventory[`legacy-trial:${id}`] = integer(count);
    }
    await tx.execute(
      sql`insert into runtime.competition_matches(id,board,data,created_at) values(${walletId(owner)},${board},${JSON.stringify(w)}::jsonb,${at})`,
    );
  }
  if (w.version !== 3) fail('ASSET_VERSION');
  prepare(w, owner, at, rules);
  return w;
}
async function save(tx: Tx, owner: string, w: NightAssets) {
  w.revision++;
  await tx.execute(
    sql`update runtime.competition_matches set data=${JSON.stringify(w)}::jsonb where id=${walletId(owner)}`,
  );
}
const publicOrder = (order: VideoOrder) => ({
  id: order.id,
  quantity: order.quantity,
  required: order.required,
  completed: order.completed,
  delivered: order.delivered,
  version: order.version,
  createdAt: order.createdAt,
  ...(order.attempt ? { attempt: order.attempt } : {}),
});
function snapshot(w: NightAssets, owner: string, at: number, rules: ProgressionRules) {
  return {
    playerId: owner,
    version: w.version,
    coins: w.coins,
    xp: w.xp,
    ...rules.levelProgress(w.xp),
    revision: w.revision,
    inventory: w.inventory,
    available: Object.fromEntries(Object.keys(w.inventory).map((id) => [id, available(w, id)])),
    permanent: w.permanent,
    active: w.active,
    loadouts: w.loadouts,
    tasks: w.tasks,
    achievements: ACHIEVEMENTS.map((a) => ({ ...a, ...w.achievements[a.id] })),
    mail: w.mail,
    announcements: [
      {
        id: 'growth-v1',
        title: '成长与军需上线',
        body: '积分保持原规则。金币、经验独立记录；单人和双人分别配装。技能按冷却重复使用。',
        createdAt: cutoff,
      },
    ],
    videoOrders: w.videoOrders.map(publicOrder),
    signedDays: w.signedDays,
    signedToday: w.signedDays.includes(nightDay(at)),
    day: nightDay(at),
    serverNow: at,
    videoDailyLimit: 12,
    videosToday: w.videoDays[nightDay(at)] ?? 0,
    catalog: rules.catalog,
    packages: rules.packages,
    pools: rules.pools,
    quoteVersion: rules.version,
    adVerification: 'limited-client-callback',
    legacyPreserved: !!w.legacy,
  };
}
function drawPacks(rules: ProgressionRules, pool: string, quantity: number) {
  const weights = rules.pools[pool]?.weights ?? fail('INVALID_POOL');
  const grants: Record<string, number> = {};
  for (let n = 0; n < quantity; n++) {
    let roll = randomInt(weights.reduce((a, b) => a + b, 0)),
      tier = 0;
    while (tier < weights.length - 1 && roll >= weights[tier]!) roll -= weights[tier++]!;
    const id = `pack:${pool}:${tier}`;
    grants[id] = (grants[id] ?? 0) + 1;
  }
  return grants;
}
function deliverPacks(w: NightAssets, grants: Record<string, number>) {
  for (const [id, count] of Object.entries(grants)) stock(w, id, count);
  return grants;
}
function spend(w: NightAssets, coins: number) {
  if (w.coins < coins) fail('INSUFFICIENT_COINS');
  w.coins -= coins;
}
export async function nightAssets(
  tx: Tx,
  owner: string,
  at: number,
  rules: ProgressionRules,
  command?: AssetCommand,
  development = false,
) {
  if (command?.kind === 'dev-adjust' && !development)
    throw new CompetitionError('DEV_TOOLS_DISABLED', 403);
  const w = await locked(tx, owner, at, rules),
    day = nightDay(at);
  const response = async (lastReceipt?: unknown) => {
    const rows = await tx.execute(
      sql`select data,created_at from runtime.competition_matches where board=${board} and id like ${eventId(owner, 'request:%')} and data->'result'->>'kind'='open' order by created_at desc,id desc limit 20`,
    );
    const openReceipts = rows.map((row) => {
      const result = (
        row.data as {
          result: {
            requestId: string;
            item?: string;
            quantity?: number;
            drops: Array<{ item?: string; coins?: number }>;
          };
        }
      ).result;
      return {
        requestId: result.requestId,
        at: Number(row.created_at),
        item: result.item ?? 'pack',
        quantity: result.quantity ?? result.drops.length,
        drops: result.drops,
      };
    });
    return {
      ...snapshot(w, owner, at, rules),
      devToolsEnabled: development,
      openReceipts,
      ...(lastReceipt ? { lastReceipt } : {}),
    };
  };
  if (!command) {
    await save(tx, owner, w);
    return response();
  }
  const cmd = nightAssetCommandSchema.parse(command),
    key = eventId(owner, `request:${cmd.requestId}`),
    hash = signature(cmd);
  const previous = await tx.execute(
    sql`select data from runtime.competition_matches where id=${key}`,
  );
  if (previous[0]) {
    const receipt = previous[0].data as { hash: string; result: unknown };
    if (receipt.hash !== hash) throw new CompetitionError('REQUEST_ID_CONFLICT');
    return response(receipt.result);
  }
  if (cmd.kind === 'ad-complete') {
    const completed = await tx.execute(
      sql`select data from runtime.competition_matches where id=${eventId(owner, `ad:${cmd.attemptId}`)}`,
    );
    if (completed[0]) {
      const saved = completed[0].data as { orderId: string; result: Record<string, unknown> };
      if (saved.orderId !== cmd.orderId) fail('INVALID_AD_ATTEMPT');
      const result = { ...saved.result, requestId: cmd.requestId };
      await save(tx, owner, w);
      await tx.execute(
        sql`insert into runtime.competition_matches(id,board,data,created_at) values(${key},${board},${JSON.stringify({ hash, result, at })}::jsonb,${at})`,
      );
      return response(result);
    }
  }
  let result: Record<string, unknown> = { kind: cmd.kind, requestId: cmd.requestId };
  if (cmd.kind === 'dev-adjust') {
    const before = { coins: w.coins, xp: w.xp };
    const after = { coins: w.coins + cmd.coinsDelta, xp: w.xp + cmd.xpDelta };
    if (!Object.values(after).every((value) => Number.isSafeInteger(value) && value >= 0))
      fail('INVALID_DEV_BALANCE');
    w.coins = after.coins;
    w.xp = after.xp;
    result = { ...result, before, after, coinsDelta: cmd.coinsDelta, xpDelta: cmd.xpDelta };
  } else if (cmd.kind === 'buy') {
    const p = rules.catalog.find((p) => p.id === cmd.item) ?? fail('ITEM_UNAVAILABLE');
    if (p.term === 'permanent' && (w.permanent.includes(p.effect) || cmd.quantity !== 1))
      fail('ALREADY_OWNED');
    spend(w, p.price * cmd.quantity);
    if (p.term === 'permanent') w.permanent.push(p.effect);
    else stock(w, p.id, cmd.quantity);
    result = { ...result, item: p.id, quantity: cmd.quantity, coins: -p.price * cmd.quantity };
  } else if (cmd.kind === 'checkin') {
    if (w.signedDays.includes(day)) fail('ALREADY_CLAIMED');
    w.signedDays.push(day);
    const reward = { coins: 100 + (w.signedDays.length % 7 === 0 ? 100 : 0), xp: 40, packs: 1 };
    add(w, reward);
    progress(w, day, ['checkin']);
    result = { ...result, reward };
  } else if (cmd.kind === 'buy-packs' || cmd.kind === 'ad-order') {
    const quote =
      rules.packages.find((p) => p.quantity === cmd.quantity) ?? fail('INVALID_PACKAGE');
    if (cmd.kind === 'buy-packs') {
      spend(w, quote.coins);
      result = {
        ...result,
        coins: -quote.coins,
        packs: deliverPacks(w, drawPacks(rules, cmd.pool, cmd.quantity)),
      };
    } else {
      if (w.videoOrders.filter((o) => !o.delivered).length >= 5) fail('TOO_MANY_ORDERS');
      const order: VideoOrder = {
        id: randomUUID(),
        quantity: quote.quantity,
        required: quote.videos,
        completed: 0,
        delivered: false,
        version: rules.version,
        createdAt: at,
        grants: drawPacks(rules, 'general', quote.quantity),
      };
      w.videoOrders.push(order);
      result = { ...result, order: publicOrder(order) };
    }
  } else if (cmd.kind === 'ad-start' || cmd.kind === 'ad-complete') {
    const order = w.videoOrders.find((o) => o.id === cmd.orderId) ?? fail('ORDER_NOT_FOUND');
    if (order.delivered) fail('ALREADY_CLAIMED');
    if ((w.videoDays[day] ?? 0) >= 12) fail('DAILY_VIDEO_LIMIT');
    if (cmd.kind === 'ad-start') {
      order.attempt = { id: randomUUID(), startedAt: at };
      result = { ...result, orderId: order.id, attemptId: order.attempt.id };
    } else {
      // shortcut: H5 exposes no server-verifiable receipt here; quota/order/time checks limit abuse, not prove viewing.
      if (
        !order.attempt ||
        order.attempt.id !== cmd.attemptId ||
        at < order.attempt.startedAt ||
        at - order.attempt.startedAt > 30 * 60000
      )
        fail('INVALID_AD_ATTEMPT');
      if (at - order.attempt!.startedAt < 10000)
        await recordNightAdAudit(tx, owner, at, 'ad-complete', 'FAST_CALLBACK');
      order.completed++;
      w.videoDays[day] = (w.videoDays[day] ?? 0) + 1;
      delete order.attempt;
      progress(w, day, ['video']);
      if (order.completed === order.required) {
        order.delivered = true;
        result.packs = deliverPacks(w, order.grants ?? drawPacks(rules, 'general', order.quantity));
        progress(w, day, ['exchange']);
      }
      result = { ...result, order: publicOrder(order) };
      await tx.execute(
        sql`insert into runtime.competition_matches(id,board,data,created_at) values(${eventId(owner, `ad:${cmd.attemptId}`)},${board},${JSON.stringify({ orderId: order.id, result, at })}::jsonb,${at})`,
      );
    }
  } else if (cmd.kind === 'open' || cmd.kind === 'sell') {
    if (available(w, cmd.item) < cmd.quantity) fail('INSUFFICIENT_INVENTORY');
    const p = rules.catalog.find((p) => p.id === cmd.item),
      pack = /^pack:(general|gold):([0-3])$/.exec(cmd.item);
    if (cmd.kind === 'sell') {
      const unit = pack
        ? rules.pools[pack[1]!]!.packSell
        : (p?.sell ?? (cmd.item.startsWith('legacy') ? 20 : 0));
      if (!unit) fail('ITEM_NOT_SELLABLE');
      stock(w, cmd.item, -cmd.quantity);
      w.coins += unit * cmd.quantity;
      result = { ...result, coins: unit * cmd.quantity };
    } else {
      if (!pack) throw new CompetitionError('ITEM_NOT_PACK', 422);
      stock(w, cmd.item, -cmd.quantity);
      const pool = rules.pools[pack[1]!]!,
        tier = Number(pack[2]);
      const drops: Array<{ item?: string; coins?: number }> = [];
      const choices = rules.catalog.filter(
        (p) => p.term === 'match' && p.rarity === tier && pool.effects.includes(p.effect),
      );
      for (let n = 0; n < cmd.quantity; n++) {
        if (!choices.length || randomInt(4) === 0) {
          const coins = pool.coinDrops[tier]!;
          w.coins += coins;
          drops.push({ coins });
        } else {
          const prize = choices[randomInt(choices.length)]!;
          stock(w, prize.id, 1);
          drops.push({ item: prize.id });
        }
      }
      progress(w, day, ['open'], cmd.quantity);
      result = { ...result, item: cmd.item, quantity: cmd.quantity, drops };
    }
  } else if (cmd.kind === 'activate') {
    const p = rules.catalog.find((p) => p.id === cmd.item) ?? fail('ITEM_UNAVAILABLE');
    if (w.permanent.includes(p.effect)) fail('ALREADY_OWNED');
    if (p.term !== '24h' || available(w, p.id) < 1) fail('INSUFFICIENT_INVENTORY');
    stock(w, p.id, -1);
    w.active[p.effect] = Math.max(at, w.active[p.effect] ?? 0) + 86400000;
  } else if (cmd.kind === 'loadout') {
    if (!rules.validLoadout(cmd.loadout)) fail('INVALID_LOADOUT');
    for (const id of [
      ...cmd.loadout.mods,
      ...[cmd.loadout.weapon, cmd.loadout.skill].filter((x): x is string => !!x),
    ]) {
      const p = rules.catalog.find((p) => p.id === id)!;
      if (!w.permanent.includes(p.effect) && !(w.active[p.effect]! > at) && !(available(w, id) > 0))
        fail('INSUFFICIENT_INVENTORY');
    }
    w.loadouts[cmd.mode] = structuredClone(cmd.loadout);
  } else if (
    cmd.kind === 'claim-task' ||
    cmd.kind === 'claim-all' ||
    cmd.kind === 'alternate-task'
  ) {
    const tasks = cmd.kind === 'claim-all' ? w.tasks : w.tasks.filter((t) => t.id === cmd.taskId);
    if (!tasks.length) fail('TASK_NOT_FOUND');
    if (cmd.kind === 'alternate-task') {
      const t = tasks[0]!;
      if (t.event !== 'duel' || t.claimed || t.alternate) fail('TASK_NOT_REPLACEABLE');
      t.alternate = true;
      t.event = 'complete';
      t.name = '完成 3 次有效行动';
      t.target = 3;
      t.progress = 0;
    } else {
      let claimed = 0;
      for (const t of tasks)
        if (!t.claimed && t.progress >= t.target) {
          t.claimed = true;
          add(w, t.reward);
          claimed++;
        }
      if (!claimed) fail('NOT_CLAIMABLE');
      result.claimed = claimed;
    }
  } else if (cmd.kind === 'read-mail' || cmd.kind === 'claim-mail') {
    const mail = w.mail.find((m) => m.id === cmd.mailId) ?? fail('MAIL_NOT_FOUND');
    mail.read = true;
    if (cmd.kind === 'claim-mail') {
      if (mail.claimed) fail('ALREADY_CLAIMED');
      mail.claimed = true;
      add(w, mail.reward);
      result.reward = mail.reward;
    }
  } else {
    const a = ACHIEVEMENTS.find((a) => a.id === cmd.achievementId) ?? fail('ACHIEVEMENT_NOT_FOUND'),
      state = w.achievements[a.id]!;
    if (state.claimed || state.progress < a.target) fail('NOT_CLAIMABLE');
    state.claimed = true;
    add(w, a.reward);
    result.reward = a.reward;
  }
  prepare(w, owner, at, rules);
  await save(tx, owner, w);
  await tx.execute(
    sql`insert into runtime.competition_matches(id,board,data,created_at) values(${key},${board},${JSON.stringify({ hash, result, at })}::jsonb,${at})`,
  );
  return response(result);
}

/** Daily bounded counters contain no token, nickname, IP or raw client payload. */
export async function recordNightAdAudit(
  tx: Tx,
  owner: string,
  at: number,
  kind: string,
  reason: string,
) {
  if (
    !['ad-order', 'ad-start', 'ad-complete'].includes(kind) ||
    ![
      'FAST_CALLBACK',
      'INVALID_AD_ATTEMPT',
      'ORDER_NOT_FOUND',
      'DAILY_VIDEO_LIMIT',
      'ALREADY_CLAIMED',
      'TOO_MANY_ORDERS',
    ].includes(reason)
  )
    return;
  const id = `night-ad-audit:${owner}:${nightDay(at)}:${kind}:${reason}`,
    data = { day: nightDay(at), kind, reason, count: 1, lastAt: at };
  await tx.execute(
    sql`insert into runtime.competition_matches(id,board,data,created_at) values(${id},'night-overwatch:private-ad-audit-v1',${JSON.stringify(data)}::jsonb,${at}) on conflict(id) do update set data=jsonb_set(jsonb_set(runtime.competition_matches.data,'{count}',to_jsonb((runtime.competition_matches.data->>'count')::bigint+1)),'{lastAt}',to_jsonb(${at}::bigint))`,
  );
}

/** Skip rows already held by gameplay: an asset read must never wait room -> identity in reverse. */
export async function reconcileNightLoadouts(
  tx: Tx,
  owner: string,
  at: number,
  rules: ProgressionRules,
  versions: { solo: string; duel: string },
  policy?: { state: string; killEpoch: number },
) {
  const epoch = policy?.killEpoch ?? 0,
    disabled = policy?.state === 'disabled';
  const runs = await tx.execute(
    sql`select id,data from runtime.competition_matches where data->>'kind'='ranked-run-v1' and data->>'game'='night-overwatch' and data->>'playerId'=${owner} and data->>'status'='active' and data->'loadout' is not null and data->'settlement' is null and (data->>'version'<>${versions.solo} or coalesce((data->>'killEpoch')::bigint,0)<>${epoch} or ${disabled}) order by id limit 20 for update skip locked`,
  );
  const rooms = await tx.execute(
    sql`select code,data from runtime.competition_rooms where data->>'game'='night-overwatch' and data->>'status'='playing' and data->>'loadoutBattle' is not null and data->'settledAt' is null and exists(select 1 from jsonb_array_elements(data->'players') p where p->>'id'=${owner}) and (data->>'version'<>${versions.duel} or coalesce((data->>'killEpoch')::bigint,0)<>${epoch} or ${disabled}) order by code limit 20 for update skip locked`,
  );
  const refunds = [
    ...runs.map((row) => ({ owner, battle: `run:${(row.data as RankedRun).id}` })),
    ...rooms.flatMap((row) => {
      const room = row.data as Room;
      return room.players.map((p) => ({ owner: p.id, battle: room.loadoutBattle! }));
    }),
  ].sort((a, b) => a.owner.localeCompare(b.owner) || a.battle.localeCompare(b.battle));
  for (const item of refunds) await refundNightLoadout(tx, item.owner, at, item.battle, rules);
  for (const row of runs)
    await tx.execute(
      sql`update runtime.competition_matches set data=jsonb_set(data,'{status}','"finished"'::jsonb) where id=${row.id}`,
    );
  for (const row of rooms)
    await tx.execute(
      sql`update runtime.competition_rooms set data=jsonb_set(data,'{status}','"abandoned"'::jsonb) where code=${row.code}`,
    );
}
export async function reserveNightLoadout(
  tx: Tx,
  owner: string,
  at: number,
  battle: string,
  mode: 'solo' | 'duel',
  rules: ProgressionRules,
) {
  const w = await locked(tx, owner, at, rules),
    prior = w.reservations[battle];
  if (prior && ['reserved', 'consumed'].includes(prior.status)) return prior.snapshot;
  const loadout = w.loadouts[mode],
    effects: string[] = [],
    items: string[] = [],
    skipped: string[] = [];
  for (const id of [
    ...loadout.mods,
    ...[loadout.weapon, loadout.skill].filter((x): x is string => !!x),
  ]) {
    const p = rules.catalog.find((p) => p.id === id)!;
    if (w.permanent.includes(p.effect) || (w.active[p.effect] ?? 0) > at) effects.push(p.effect);
    else if (p.term === 'match' && available(w, id) > 0) {
      effects.push(p.effect);
      items.push(id);
    } else skipped.push(id);
  }
  const snapshot: BattleLoadout = {
    version: rules.version,
    level: rules.levelProgress(w.xp).level,
    effects,
    skipped,
  };
  w.reservations[battle] = { snapshot, items, status: 'reserved', expiresAt: at + 24 * 3600000 };
  await save(tx, owner, w);
  return snapshot;
}
export async function consumeNightLoadout(
  tx: Tx,
  owner: string,
  at: number,
  battle: string,
  rules: ProgressionRules,
  release = false,
) {
  const w = await locked(tx, owner, at, rules),
    r = w.reservations[battle];
  if (!release && (!r || r.status === 'released' || r.status === 'refunded'))
    fail('LOADOUT_RESERVATION_EXPIRED');
  if (!r || r.status !== 'reserved') return;
  if (release) r.status = 'released';
  else {
    r.consumedItems = r.items.filter(
      (id) => !w.permanent.includes(rules.catalog.find((p) => p.id === id)!.effect),
    );
    for (const id of r.consumedItems) stock(w, id, -1);
    r.status = 'consumed';
  }
  await save(tx, owner, w);
}
/** Only server invalidation calls this; a normal quit never refunds committed inventory. */
export async function refundNightLoadout(
  tx: Tx,
  owner: string,
  at: number,
  battle: string,
  rules: ProgressionRules,
) {
  const w = await locked(tx, owner, at, rules),
    r = w.reservations[battle];
  if (!r || r.status === 'released' || r.status === 'refunded') return;
  if (r.status === 'consumed') for (const id of r.consumedItems ?? r.items) stock(w, id, 1);
  r.status = 'refunded';
  await save(tx, owner, w);
}
export async function rewardNightBattle(
  tx: Tx,
  owner: string,
  at: number,
  battle: string,
  rules: ProgressionRules,
  input: {
    mode: 'solo' | 'duel' | 'bot';
    outcome: 'win' | 'loss' | 'draw';
    durationMs: number;
    valid: boolean;
    levelId?: string;
  },
) {
  const w = await locked(tx, owner, at, rules),
    id = eventId(owner, `battle:${battle}`);
  const prior = await tx.execute(sql`select data from runtime.competition_matches where id=${id}`);
  if (prior[0]) return (prior[0].data as { receipt: BattleReward }).receipt;
  const valid = input.valid && input.durationMs >= 10000;
  const reward: Reward = valid
    ? input.mode === 'solo'
      ? { coins: input.outcome === 'win' ? 180 : 40, xp: input.outcome === 'win' ? 120 : 35 }
      : input.mode === 'duel'
        ? {
            coins: input.outcome === 'win' ? 200 : input.outcome === 'draw' ? 100 : 60,
            xp: input.outcome === 'win' ? 140 : 70,
          }
        : { coins: input.outcome === 'win' ? 100 : 30, xp: input.outcome === 'win' ? 80 : 25 }
    : { coins: 0, xp: 0 };
  add(w, reward);
  if (valid)
    progress(w, nightDay(at), [
      'complete',
      input.mode === 'solo' ? 'solo' : 'duel',
      ...(input.outcome === 'win' ? ['win'] : []),
    ]);
  prepare(w, owner, at, rules);
  await save(tx, owner, w);
  const receipt: BattleReward = {
    ...reward,
    totalCoins: w.coins,
    totalXp: w.xp,
    level: rules.levelProgress(w.xp).level,
    status: 'credited',
  };
  await tx.execute(
    sql`insert into runtime.competition_matches(id,board,data,created_at) values(${id},${board},${JSON.stringify({ receipt, input, at })}::jsonb,${at})`,
  );
  return receipt;
}
