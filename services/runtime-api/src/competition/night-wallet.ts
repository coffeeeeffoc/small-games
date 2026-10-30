import { randomInt, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { CompetitionError } from './types.js';

type Database = ReturnType<typeof openDatabase>['db'];
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
const permanent = ['power', 'velocity', 'duration', 'spread', 'emp'] as const;
const items = [...permanent, 'coolant'] as const;
const item = z.enum(items);
export const nightLoadoutSchema = z
  .array(z.object({ id: item, tier: z.union([z.literal(1), z.literal(2)]) }).strict())
  .max(3)
  .refine((slots) => new Set(slots.map((slot) => slot.id)).size === slots.length);
export type NightLoadout = z.infer<typeof nightLoadoutSchema>;
const requestId = z.uuid();
export const nightWalletCommand = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('buy'),
      item,
      requestId,
      tier: z.number().int().min(1).max(2).optional(),
    })
    .strict(),
  z.object({ kind: z.literal('checkin'), requestId }).strict(),
  z.object({ kind: z.literal('ad-start'), requestId }).strict(),
  z.object({ kind: z.literal('ad-claim'), requestId, challenge: z.uuid() }).strict(),
]);
type Command = z.infer<typeof nightWalletCommand>;
type Inventory = Record<string, number>;
type Wallet = {
  coins: number;
  owned: Inventory;
  inventory: Inventory;
  revision: number;
  signed?: string;
  drawn?: string;
  challenge?: { id: string; day: string; until: number };
};
type Receipt = { signature: string; extra?: { reward?: number; challenge?: string } };
const walletBoard = 'night-overwatch:private-wallet-v1';
const utc8Day = (at: number) => new Date(at + 8 * 3600000).toISOString().slice(0, 10);
export type NightCatalog = Record<string, { price: number; tune: number }>;
const walletId = (owner: string) => 'night-wallet:' + owner;
const eventId = (owner: string, event: string) => 'night-wallet-event:' + owner + ':' + event;
const refuse = (code: string): never => {
  throw new CompetitionError(code, 422);
};
const empty = (): Wallet => ({
  coins: 0,
  owned: { power: 1, velocity: 1, duration: 1 },
  inventory: { coolant: 0 },
  revision: 0,
});
const snapshot = (playerId: string, w: Wallet, at: number) => ({
  playerId,
  coins: w.coins,
  owned: w.owned,
  inventory: w.inventory,
  revision: w.revision,
  day: utc8Day(at),
  signedToday: w.signed === utc8Day(at),
  drawnToday: w.drawn === utc8Day(at),
});
async function locked(tx: Tx, owner: string, at: number) {
  const id = walletId(owner);
  await tx.execute(sql`insert into runtime.competition_matches(id,board,data,created_at)
    values(${id},${walletBoard},${JSON.stringify(empty())}::jsonb,${at}) on conflict(id) do nothing`);
  const rows = await tx.execute(
    sql`select data from runtime.competition_matches where id=${id} for update`,
  );
  return rows[0]!.data as Wallet;
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
export async function checkNightLoadout(
  tx: Tx,
  owner: string,
  loadout: NightLoadout,
  duel: boolean,
  at: number,
) {
  const parsed = nightLoadoutSchema.safeParse(loadout);
  if (!parsed.success) refuse('INVALID_LOADOUT');
  const w = await locked(tx, owner, at);
  for (const slot of loadout) {
    if (slot.id === 'coolant') {
      if (duel || slot.tier !== 1 || !w.inventory.coolant) refuse('INVALID_LOADOUT');
    } else if ((duel && slot.tier !== 1) || (w.owned[slot.id] ?? 0) < slot.tier)
      refuse('INVALID_LOADOUT');
  }
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
) {
  const w = await locked(tx, owner, at);
  const first =
    await tx.execute(sql`insert into runtime.competition_matches(id,board,data,created_at)
    values(${eventId(owner, 'first:' + level)},${walletBoard},${JSON.stringify({ runId, level })}::jsonb,${at})
    on conflict(id) do nothing returning id`);
  const previous = first.length
    ? await tx.execute(sql`select 1 from runtime.competition_results
    where player_id=${owner} and score>0 and match_id<>${'ranked-result:' + runId + ':level-' + level}
      and (board=${'night-overwatch:clear-' + level + ':night-records-v1'}
       or board like ${'night-overwatch:level-' + level + ':night-input-replay-v%'}) limit 1`)
    : [];
  const firstEver = !!first.length && !previous.length,
    coins = firstEver ? 300 : 80;
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
) {
  const w = await locked(tx, owner, at);
  if (!cmd) return snapshot(owner, w, at);
  const signature =
    cmd.kind === 'buy'
      ? [cmd.kind, cmd.item, cmd.tier ?? ''].join(':')
      : cmd.kind === 'ad-claim'
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
    extra: { reward?: number; challenge?: string } = {};
  let delta = 0,
    quantity = 0;
  if (cmd.kind === 'buy') {
    const current = w.owned[cmd.item] ?? 0,
      target = cmd.item === 'coolant' ? 1 : current + 1;
    const spec = catalog?.[cmd.item];
    const price = target === 1 ? spec?.price : target === 2 ? spec?.tune : undefined;
    if (!price || (cmd.tier !== undefined && cmd.tier !== target))
      return refuse('ITEM_UNAVAILABLE');
    if (w.coins < price) refuse('INSUFFICIENT_COINS');
    delta = -price;
    quantity = 1;
    if (cmd.item === 'coolant') w.inventory.coolant = (w.inventory.coolant ?? 0) + 1;
    else w.owned[cmd.item] = target;
  } else if (cmd.kind === 'checkin') {
    if (w.signed === day) refuse('ALREADY_CLAIMED');
    w.signed = day;
    delta = 60;
    extra.reward = delta;
  } else {
    if (w.drawn === day) refuse('ALREADY_CLAIMED');
    if (cmd.kind === 'ad-start') {
      if (!w.challenge || w.challenge.day !== day || w.challenge.until < at)
        w.challenge = { id: randomUUID(), day, until: at + 30 * 60000 };
      extra.challenge = w.challenge.id;
    } else {
      if (
        !w.challenge ||
        w.challenge.id !== cmd.challenge ||
        w.challenge.day !== day ||
        w.challenge.until < at
      )
        refuse('INVALID_AD_CHALLENGE');
      const roll = randomInt(100);
      delta = roll < 60 ? 40 : roll < 90 ? 80 : 160;
      extra.reward = delta;
      delete w.challenge;
      w.drawn = day;
    }
  }
  w.coins += delta;
  await persist(tx, owner, w, at, id, {
    signature,
    extra,
    coins: delta,
    ...(quantity ? { item: cmd.kind === 'buy' ? cmd.item : undefined, quantity } : {}),
  });
  return { ...snapshot(owner, w, at), ...extra };
}
