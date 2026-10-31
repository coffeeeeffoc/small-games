import { randomInt, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  shop,
  passive,
  nightLoadoutSchema,
  type Command,
  type NightLoadout,
} from './night-wallet-schema.js';
export {
  nightLoadoutSchema,
  nightWalletCommand,
  type NightLoadout,
} from './night-wallet-schema.js';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { backfillClearCoins } from './night-wallet-backfill.js';
import { CompetitionError } from './types.js';

type Database = ReturnType<typeof openDatabase>['db'];
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

type Inventory = Record<string, number>;
type Prize = { id: (typeof shop)[number]; tier: 1 | 2 | 3 };
type Wallet = {
  version: 2;
  coins: number;
  owned: Inventory;
  inventory: Inventory;
  trials: Inventory;
  revision: number;
  signed?: string;
  signedDays: string[];
  challenge?: { id: string; until: number };
};
type Extra = { reward?: number; challenge?: string; prize?: Prize };
type Receipt = { signature: string; extra?: Extra };
const walletBoard = 'night-overwatch:private-wallet-v1';
const utc8Day = (at: number) => new Date(at + 8 * 3600000).toISOString().slice(0, 10);
export type NightCatalog = Record<
  string,
  { price: number; tune: number; prices?: readonly number[] }
>;
const walletId = (owner: string) => 'night-wallet:' + owner;
const eventId = (owner: string, event: string) => 'night-wallet-event:' + owner + ':' + event;
const refuse = (code: string): never => {
  throw new CompetitionError(code, 422);
};
const empty = (): Wallet => ({
  version: 2,
  coins: 0,
  owned: { hePower: 1, heVelocity: 1, heavyPower: 1 },
  inventory: { coolant: 0 },
  trials: {},
  signedDays: [],
  revision: 0,
});
const snapshot = (playerId: string, w: Wallet, at: number) => ({
  playerId,
  coins: w.coins,
  owned: w.owned,
  inventory: w.inventory,
  trials: w.trials,
  signedDays: w.signedDays,
  revision: w.revision,
  day: utc8Day(at),
  signedToday: w.signed === utc8Day(at),
});
async function locked(tx: Tx, owner: string, at: number) {
  const id = walletId(owner);
  await tx.execute(sql`insert into runtime.competition_matches(id,board,data,created_at)
    values(${id},${walletBoard},${JSON.stringify(empty())}::jsonb,${at}) on conflict(id) do nothing`);
  const rows = await tx.execute(
    sql`select data from runtime.competition_matches where id=${id} for update`,
  );
  const w = rows[0]!.data as Wallet;
  if (w.version !== 2) {
    const history = await tx.execute(sql`select created_at from runtime.competition_matches
      where board=${walletBoard} and id like ${eventId(owner, 'request:%')} and data->>'signature'='checkin'`);
    for (const [old, ids] of [
      ['power', ['hePower', 'heavyPower']],
      ['velocity', ['heVelocity', 'heavyVelocity']],
    ] as const) {
      const tier = w.owned[old];
      if (tier) for (const target of ids) w.owned[target] = Math.max(w.owned[target] || 0, tier);
      delete w.owned[old];
    }
    w.trials = {};
    w.signedDays = [
      ...new Set([
        ...history.map((row) => utc8Day(Number(row.created_at))),
        ...(w.signed ? [w.signed] : []),
      ]),
    ].sort();
    delete w.challenge;
    w.version = 2;
    ++w.revision;
    await tx.execute(
      sql`update runtime.competition_matches set data=${JSON.stringify(w)}::jsonb where id=${id}`,
    );
  }
  return w;
}
async function persist(
  tx: Tx,
  owner: string,
  w: Wallet,
  at: number,
  event: string,
  entry: Record<string, unknown>,
) {
  ++w.revision;
  await tx.execute(sql`insert into runtime.competition_matches(id,board,data,created_at)
    values(${eventId(owner, event)},${walletBoard},${JSON.stringify(entry)}::jsonb,${at})`);
  await tx.execute(
    sql`update runtime.competition_matches set data=${JSON.stringify(w)}::jsonb where id=${walletId(owner)}`,
  );
}
function validate(w: Wallet, loadout: NightLoadout, duel: boolean) {
  if (!nightLoadoutSchema.safeParse(loadout).success) refuse('INVALID_LOADOUT');
  for (const slot of loadout) {
    if (slot.id === 'coolant') {
      if (duel || !w.inventory.coolant) refuse('INVALID_LOADOUT');
    } else if (slot.trial) {
      if (!(w.trials[slot.id + ':' + slot.tier]! > 0) || slot.tier <= (w.owned[slot.id] || 0))
        refuse('INVALID_LOADOUT');
    } else if ((w.owned[slot.id] || 0) !== slot.tier) refuse('INVALID_LOADOUT');
  }
  for (const id of passive) {
    const tier = w.owned[id] || 0,
      slot = loadout.find((slot) => slot.id === id);
    if (tier && (!slot || slot.tier < tier)) refuse('INVALID_LOADOUT');
  }
}
export async function checkNightLoadout(
  tx: Tx,
  owner: string,
  loadout: NightLoadout,
  duel: boolean,
  at: number,
) {
  validate(await locked(tx, owner, at), loadout, duel);
}
export async function useNightTrials(
  tx: Tx,
  owner: string,
  loadout: NightLoadout,
  duel: boolean,
  at: number,
  battle: string,
) {
  const w = await locked(tx, owner, at),
    id = 'trials:' + battle;
  const prior = await tx.execute(
    sql`select data from runtime.competition_matches where id=${eventId(owner, id)}`,
  );
  const signature = JSON.stringify(loadout);
  if (prior.length) {
    if ((prior[0]!.data as Receipt).signature !== signature)
      throw new CompetitionError('REQUEST_ID_CONFLICT');
    return;
  }
  validate(w, loadout, duel);
  const consumed = loadout.filter((slot) => slot.trial);
  if (!consumed.length) return;
  for (const slot of consumed) --w.trials[slot.id + ':' + slot.tier]!;
  await persist(tx, owner, w, at, id, { signature, consumed, battle });
}
export async function refundNightTrials(tx: Tx, owner: string, at: number, battle: string) {
  const w = await locked(tx, owner, at),
    id = 'refund:' + battle;
  const prior = await tx.execute(
    sql`select id from runtime.competition_matches where id=${eventId(owner, id)}`,
  );
  if (prior.length) return;
  const rows = await tx.execute(
    sql`select data from runtime.competition_matches where id=${eventId(owner, 'trials:' + battle)}`,
  );
  if (!rows.length) return;
  const { consumed } = rows[0]!.data as { consumed: NightLoadout };
  for (const slot of consumed)
    w.trials[slot.id + ':' + slot.tier] = (w.trials[slot.id + ':' + slot.tier] || 0) + 1;
  await persist(tx, owner, w, at, id, { battle, refunded: consumed });
}
export async function useNightCoolant(tx: Tx, owner: string, runId: string, at: number) {
  const w = await locked(tx, owner, at);
  if (!(w.inventory.coolant! > 0)) refuse('INSUFFICIENT_INVENTORY');
  w.inventory.coolant = (w.inventory.coolant ?? 0) - 1;
  await persist(tx, owner, w, at, 'use:' + runId, { item: 'coolant', quantity: -1, runId });
}
export async function awardNightClear(
  tx: Tx,
  owner: string,
  runId: string,
  level: string,
  at: number,
  reward: (level: string, first: boolean) => number,
) {
  const w = await locked(tx, owner, at);
  const first =
    await tx.execute(sql`insert into runtime.competition_matches(id,board,data,created_at)
    values(${eventId(owner, 'first:' + level)},${walletBoard},${JSON.stringify({ runId, level })}::jsonb,${at})
    on conflict(id) do nothing returning id`);
  const previous = first.length
    ? await tx.execute(sql`select 1 from runtime.competition_results where player_id=${owner} and score>0
    and match_id<>${'ranked-result:' + runId + ':level-' + level} and (board=${'night-overwatch:clear-' + level + ':night-records-v1'}
    or board like ${'night-overwatch:level-' + level + ':night-input-replay-v%'}) limit 1`)
    : [];
  const firstEver = !!first.length && !previous.length,
    coins = reward(level, firstEver);
  w.coins += coins;
  await persist(tx, owner, w, at, 'clear:' + runId, { runId, level, coins, first: firstEver });
  return coins;
}

export async function nightWallet(
  tx: Tx,
  owner: string,
  at: number,
  cmd?: Command,
  catalog?: NightCatalog,
  reward?: (level: string, first: boolean) => number,
) {
  const w = await locked(tx, owner, at);
  const backfill = reward && (await backfillClearCoins(tx, owner, at, reward));
  if (backfill) {
    w.coins += backfill.coins;
    await persist(tx, owner, w, at, backfill.event, {
      coins: backfill.coins,
      levels: backfill.levels,
    });
  }
  if (!cmd) return snapshot(owner, w, at);
  const signature =
    cmd.kind === 'buy'
      ? [cmd.kind, cmd.item, cmd.tier ?? ''].join(':')
      : cmd.kind === 'lottery-claim'
        ? cmd.kind + ':' + cmd.challenge
        : cmd.kind;
  const id = 'request:' + cmd.requestId;
  const prior = await tx.execute(
    sql`select data from runtime.competition_matches where id=${eventId(owner, id)}`,
  );
  if (prior.length) {
    const receipt = prior[0]!.data as Receipt;
    if (receipt.signature !== signature) throw new CompetitionError('REQUEST_ID_CONFLICT');
    return { ...snapshot(owner, w, at), ...receipt.extra };
  }
  const day = utc8Day(at),
    extra: Extra = {};
  let delta = 0;
  if (cmd.kind === 'buy') {
    const target = (w.owned[cmd.item] || 0) + 1,
      spec = catalog?.[cmd.item],
      price = spec?.prices?.[target - 1];
    if (!price || (cmd.tier !== undefined && cmd.tier !== target))
      return refuse('ITEM_UNAVAILABLE');
    if (w.coins < price) refuse('INSUFFICIENT_COINS');
    delta = -price;
    w.owned[cmd.item] = target;
  } else if (cmd.kind === 'checkin') {
    if (w.signed === day) refuse('ALREADY_CLAIMED');
    w.signed = day;
    w.signedDays.push(day);
    delta = 60;
    extra.reward = 60;
  } else if (cmd.kind === 'lottery-start') {
    if (!w.challenge || w.challenge.until < at)
      w.challenge = { id: randomUUID(), until: at + 30 * 60000 };
    extra.challenge = w.challenge.id;
  } else {
    if (!w.challenge || w.challenge.id !== cmd.challenge || w.challenge.until < at)
      refuse('INVALID_AD_CHALLENGE');
    const pool: Prize[] = shop.flatMap((id) =>
      (catalog?.[id]?.prices || []).map((_, i) => ({ id, tier: (i + 1) as Prize['tier'] })),
    );
    if (!pool.length) refuse('ITEM_UNAVAILABLE');
    const prize = pool[randomInt(pool.length)]!;
    w.trials[prize.id + ':' + prize.tier] = (w.trials[prize.id + ':' + prize.tier] || 0) + 1;
    extra.prize = prize;
    delete w.challenge;
  }
  w.coins += delta;
  await persist(tx, owner, w, at, id, { signature, extra, coins: delta });
  return { ...snapshot(owner, w, at), ...extra };
}
