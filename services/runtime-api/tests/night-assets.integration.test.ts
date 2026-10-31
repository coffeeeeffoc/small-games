/* eslint-disable max-lines -- Shared isolated PostgreSQL fixture verifies atomic economy and battle transitions. */
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { openDatabase } from '@coffeeeeffoc/service-kit';
import { createCompetitionStore } from '../src/competition/store.js';
import { createRankedStore } from '../src/competition/ranked-store.js';
import type { RankedRule } from '../src/competition/ranked-types.js';
import { nightLedgerLock } from '../src/competition/night-ledger.js';
import {
  nightAssets,
  previewNightMigration,
  reserveNightLoadout,
  consumeNightLoadout,
  rewardNightBattle,
  type NightAssets,
  type ProgressionRules,
  type AssetCommand,
} from '../src/competition/night-assets.js';
import type { Rule } from '../src/competition/types.js';
const databaseUrl = process.env.COMPETITION_TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)('Night asset transactions in isolated PostgreSQL', () => {
  let database: ReturnType<typeof openDatabase>,
    rules: ProgressionRules,
    store: ReturnType<typeof createCompetitionStore>;
  const at = Date.parse('2026-11-02T12:00:00+08:00');
  beforeAll(async () => {
    if (!databaseUrl || new URL(databaseUrl).pathname !== '/competition_test')
      throw Error('Use isolated competition_test');
    database = openDatabase(databaseUrl, 'runtime');
    const rule = (await import(new URL('../rules/night.mjs', import.meta.url).href))
      .default as Rule;
    rules = rule.progression!;
    store = createCompetitionStore(database.db, new Map([[rule.id, rule]]), () => at);
  });
  afterAll(async () => {
    await database?.close();
  });
  const owner = async () => (await store.guestSession({ game: 'night-overwatch' })).playerId;
  const get = (id: string, time = at) =>
    database.db.transaction((tx) => nightAssets(tx, id, time, rules));
  const command = (id: string, cmd: AssetCommand, time = at) =>
    database.db.transaction((tx) => nightAssets(tx, id, time, rules, cmd));
  const seed = async (id: string, patch: Partial<NightAssets>) => {
    await get(id);
    await database.db.execute(
      sql`update runtime.competition_matches set data=data || ${JSON.stringify(patch)}::jsonb where id=${`night-assets:${id}`}`,
    );
  };
  it('previews and migrates old assets once, preserves original JSON and read/claim distinction', async () => {
    const id = await owner(),
      legacy = {
        version: 2,
        coins: 80,
        owned: { hePower: 2, emp: 1 },
        inventory: { coolant: 1 },
        trials: { 'hePower:2': 3 },
      };
    await database.db.execute(
      sql`insert into runtime.competition_matches(id,board,data,created_at) values(${`night-wallet:${id}`},'night-overwatch:private-wallet-v1',${JSON.stringify(legacy)}::jsonb,${at - 86400000})`,
    );
    const preview = await previewNightMigration(database.db, id);
    expect(preview.preservedCoins).toBe(80);
    const snapshots = await Promise.all([get(id), get(id)]);
    expect(snapshots[0].coins).toBe(80);
    expect(snapshots[1].permanent).toEqual(expect.arrayContaining(['power', 'emp']));
    expect(snapshots[1].inventory['legacy:coolant']).toBe(1);
    expect(snapshots[1].inventory['legacy-trial:hePower:2']).toBe(3);
    expect(snapshots[1].inventory['cooling-match']).toBe(1);
    const mailId = snapshots[0].mail[0]!.id;
    const read = await command(id, { kind: 'read-mail', requestId: randomUUID(), mailId });
    expect(read.coins).toBe(80);
    expect(read.mail[0]?.claimed).toBe(false);
    const claim: AssetCommand = { kind: 'claim-mail', requestId: randomUUID(), mailId };
    const claims = await Promise.all([command(id, claim), command(id, claim)]);
    expect(claims[0].coins).toBe(280 + 900 + 7900 + 1800);
    expect(claims[1].coins).toBe(claims[0].coins);
    expect(
      (
        await database.db.execute(
          sql`select data from runtime.competition_matches where id=${`night-wallet:${id}`}`,
        )
      )[0]!.data,
    ).toEqual(legacy);
  });
  it('uses v1 prices and restores unique check-in dates from immutable legacy events', async () => {
    const id = await owner(),
      legacy = {
        version: 1,
        coins: 80,
        owned: { power: 2, velocity: 2, duration: 2, spread: 2, emp: 1 },
        signed: '2026-10-31',
        signedDays: ['2026-10-30'],
      };
    await database.db.execute(
      sql`insert into runtime.competition_matches(id,board,data,created_at) values(${`night-wallet:${id}`},'night-overwatch:private-wallet-v1',${JSON.stringify(legacy)}::jsonb,${at})`,
    );
    for (const day of ['2026-10-29', '2026-10-30'])
      await database.db.execute(
        sql`insert into runtime.competition_matches(id,board,data,created_at) values(${`night-wallet-event:${id}:request:${randomUUID()}`},'night-overwatch:private-wallet-v1','{"signature":"checkin"}'::jsonb,${Date.parse(day + 'T12:00:00+08:00')})`,
      );
    const preview = await previewNightMigration(database.db, id);
    expect(preview.signedDays).toEqual(['2026-10-29', '2026-10-30', '2026-10-31']);
    const migrated = await get(id);
    expect(migrated.signedDays).toEqual(preview.signedDays);
    expect(migrated.mail[0]!.reward.coins).toBe(200 + 4350);
    expect((await get(id)).coins).toBe(80);
    expect(
      (
        await database.db.execute(
          sql`select data from runtime.competition_matches where id=${`night-wallet:${id}`}`,
        )
      )[0]!.data,
    ).toEqual(legacy);
  });
  it('atomic purchases and request signatures reject concurrent overspend and repeat permanent charge', async () => {
    const id = await owner();
    await seed(id, { coins: 200 });
    const cmd: AssetCommand = {
      kind: 'buy',
      item: 'power-match',
      quantity: 1,
      requestId: randomUUID(),
    };
    const results = await Promise.all([command(id, cmd), command(id, cmd)]);
    expect(results[1].coins).toBe(40);
    expect(results[1].inventory['power-match']).toBe(1);
    await expect(command(id, { ...cmd, item: 'rate-match' })).rejects.toMatchObject({
      code: 'REQUEST_ID_CONFLICT',
    });
    await expect(command(id, { ...cmd, requestId: randomUUID() })).rejects.toMatchObject({
      code: 'INSUFFICIENT_COINS',
    });
    await seed(id, { coins: 10000 });
    await command(id, {
      kind: 'buy',
      item: 'power-permanent',
      quantity: 1,
      requestId: randomUUID(),
    });
    await expect(
      command(id, { kind: 'buy', item: 'power-permanent', quantity: 1, requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'ALREADY_OWNED' });
    await seed(id, { inventory: { 'power-24h': 1 } });
    await expect(
      command(id, { kind: 'activate', item: 'power-24h', requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'ALREADY_OWNED' });
    expect((await get(id)).inventory['power-24h']).toBe(1);
  });
  it('independent saved plans reserve inventory, cancel releases, start consumes once and permanent wins over single-match stock', async () => {
    const id = await owner();
    await seed(id, { inventory: { 'power-match': 1, 'tracking-24h': 1 } });
    await command(id, {
      kind: 'loadout',
      mode: 'solo',
      loadout: { mods: ['power-match'], weapon: null, skill: null },
      requestId: randomUUID(),
    });
    const reserve = (battle: string) =>
      database.db.transaction((tx) => reserveNightLoadout(tx, id, at, battle, 'solo', rules));
    expect((await reserve('a')).effects).toEqual(['power']);
    expect((await reserve('b')).skipped).toEqual(['power-match']);
    await expect(
      command(id, { kind: 'sell', item: 'power-match', quantity: 1, requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_INVENTORY' });
    await database.db.transaction((tx) => consumeNightLoadout(tx, id, at, 'a', rules, true));
    expect((await get(id)).available['power-match']).toBe(1);
    await reserve('c');
    await database.db.transaction((tx) => consumeNightLoadout(tx, id, at, 'c', rules));
    await database.db.transaction((tx) => consumeNightLoadout(tx, id, at, 'c', rules));
    expect((await get(id)).inventory['power-match']).toBe(0);
    await seed(id, { inventory: { 'power-match': 1 }, permanent: ['power'] });
    await reserve('d');
    await database.db.transaction((tx) => consumeNightLoadout(tx, id, at, 'd', rules));
    expect((await get(id)).inventory['power-match']).toBe(1);
    expect((await get(id)).loadouts.duel.mods).toEqual([]);
  });
  it('expired unstarted reservations cannot provide free effects; newly permanent rights preserve held stock', async () => {
    const id = await owner();
    await seed(id, { inventory: { 'power-match': 2 } });
    await command(id, {
      kind: 'loadout',
      mode: 'solo',
      loadout: { mods: ['power-match'], weapon: null, skill: null },
      requestId: randomUUID(),
    });
    await database.db.transaction((tx) =>
      reserveNightLoadout(tx, id, at, 'expired', 'solo', rules),
    );
    await expect(
      database.db.transaction((tx) => consumeNightLoadout(tx, id, at + 86400001, 'expired', rules)),
    ).rejects.toMatchObject({ code: 'LOADOUT_RESERVATION_EXPIRED' });
    expect((await get(id, at + 86400001)).available['power-match']).toBe(2);
    await database.db.transaction((tx) =>
      reserveNightLoadout(tx, id, at + 86400002, 'upgraded', 'solo', rules),
    );
    await seed(id, { permanent: ['power'] });
    await database.db.transaction((tx) =>
      consumeNightLoadout(tx, id, at + 86400003, 'upgraded', rules),
    );
    expect((await get(id)).inventory['power-match']).toBe(2);
  });
  it('24-hour effects remain in an active snapshot but disappear from the next start', async () => {
    const id = await owner();
    await seed(id, {
      active: { tracking: at + 1000 },
      loadouts: {
        solo: { mods: [], weapon: null, skill: 'tracking-24h' },
        duel: { mods: [], weapon: null, skill: null },
      },
    });
    const snapshot = await database.db.transaction((tx) =>
      reserveNightLoadout(tx, id, at, 'time-pass', 'solo', rules),
    );
    await database.db.transaction((tx) =>
      consumeNightLoadout(tx, id, at + 2000, 'time-pass', rules),
    );
    expect(snapshot.effects).toEqual(['tracking']);
    const next = await database.db.transaction((tx) =>
      reserveNightLoadout(tx, id, at + 2000, 'time-pass-next', 'solo', rules),
    );
    expect(next.effects).toEqual([]);
    expect(next.skipped).toEqual(['tracking-24h']);
  });
  it('pool tiers never downgrade and reward recycling cannot exceed the cheapest package plus finite task allowance', async () => {
    const id = await owner();
    await seed(id, {
      inventory: { 'pack:general:1': 100, 'pack:general:3': 100, 'pack:gold:3': 100 },
    });
    for (const item of ['pack:general:1', 'pack:general:3', 'pack:gold:3']) {
      const result = await command(id, {
        kind: 'open',
        item,
        quantity: 100,
        requestId: randomUUID(),
      });
      if (!('lastReceipt' in result)) throw Error('Missing drop receipt');
      const drops = (result.lastReceipt as { drops: Array<{ item?: string; coins?: number }> })
        .drops;
      for (const drop of drops) {
        if (drop.item) {
          const p = rules.catalog.find((p) => p.id === drop.item)!;
          expect(p.rarity).toBe(Number(item.at(-1)));
          if (item.includes('general')) expect(p.goldOnly).toBe(false);
        } else
          expect(drop.coins).toBe(rules.pools[item.split(':')[1]!]!.coinDrops[Number(item.at(-1))]);
      }
    }
    const floor = Math.min(...rules.packages.map((p) => p.coins / p.quantity));
    expect(
      Math.max(...rules.catalog.filter((p) => p.term === 'match').map((p) => p.sell)) + 40,
    ).toBeLessThanOrEqual(floor);
  });
  it('video order retains its quote and cross-day progress; duplicate callbacks never count twice', async () => {
    const id = await owner(),
      started = await command(id, { kind: 'ad-order', quantity: 5, requestId: randomUUID() }),
      order = started.videoOrders[0]!;
    let time = at;
    for (let n = 0; n < 3; n++) {
      const attempt = await command(
        id,
        { kind: 'ad-start', orderId: order.id, requestId: randomUUID() },
        time,
      );
      if (!('lastReceipt' in attempt)) throw Error('Missing attempt receipt');
      const attemptId = (attempt.lastReceipt as { attemptId: string }).attemptId;
      const cmd: AssetCommand = {
        kind: 'ad-complete',
        orderId: order.id,
        attemptId,
        requestId: randomUUID(),
      };
      expect((await command(id, cmd, time + 1)).videoOrders[0]!.completed).toBe(n + 1);
      const done = await command(id, cmd, time + 15000);
      expect(done.videoOrders[0]!.completed).toBe(n + 1);
      expect((await command(id, cmd, time + 16000)).videoOrders[0]!.completed).toBe(n + 1);
      expect(
        (await command(id, { ...cmd, requestId: randomUUID() }, time + 86400000)).videoOrders[0]!
          .completed,
      ).toBe(n + 1);
      time += 86400000;
    }
    const final = await get(id, time);
    expect(final.videoOrders[0]!.delivered).toBe(true);
    expect(
      Object.entries(final.inventory)
        .filter(([k]) => k.startsWith('pack:general:'))
        .reduce((n, [, v]) => n + v, 0),
    ).toBe(5);
    expect(Object.keys(final.inventory).some((k) => /burst|twin/.test(k))).toBe(false);
    expect(final.videoOrders[0]).not.toHaveProperty('grants');
    const audits = await database.db.execute(
      sql`select data from runtime.competition_matches where id like ${`night-ad-audit:${id}:%`}`,
    );
    expect(audits).toHaveLength(3);
    expect(audits.every((row) => (row.data as { count: number }).count === 1)).toBe(true);
  });
  it('rejected video callbacks retain sanitized audit counts after the asset transaction rolls back', async () => {
    const id = await owner();
    for (let n = 0; n < 2; n++)
      await expect(
        store.nightAssets(id, {
          kind: 'ad-complete',
          orderId: randomUUID(),
          attemptId: randomUUID(),
          requestId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
    const audits = await database.db.execute(
      sql`select data from runtime.competition_matches where id like ${`night-ad-audit:${id}:%`}`,
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]!.data).toEqual({
      day: '2026-11-02',
      kind: 'ad-complete',
      reason: 'ORDER_NOT_FOUND',
      count: 2,
      lastAt: at,
    });
    expect((await get(id)).videosToday).toBe(0);
  });
  it('returns only the owner’s latest twenty immutable opening receipts, including idempotent retries', async () => {
    const [id, other] = await Promise.all([owner(), owner()]);
    await seed(id, { inventory: { 'pack:general:0': 30 } });
    let cmd: AssetCommand = {
      kind: 'open',
      item: 'pack:general:0',
      quantity: 1,
      requestId: randomUUID(),
    };
    for (let n = 0; n < 22; n++) {
      cmd = { ...cmd, requestId: randomUUID() };
      await command(id, cmd, at + n);
    }
    const retried = await command(id, cmd, at + 30),
      history = (await get(id, at + 40)).openReceipts;
    expect(history).toHaveLength(20);
    expect(history[0]!.requestId).toBe(cmd.requestId);
    expect(history[0]!.drops).toEqual((retried.lastReceipt as { drops: unknown }).drops);
    expect((await get(other)).openReceipts).toEqual([]);
  });
  it('failure rewards, daily tasks and finite achievements advance once, including delayed retries', async () => {
    const id = await owner(),
      initial = await get(id);
    expect((await get(id)).tasks).toEqual(initial.tasks);
    const input = {
      mode: 'solo' as const,
      outcome: 'loss' as const,
      durationMs: 30000,
      valid: true,
    };
    const award = () =>
      database.db.transaction((tx) => rewardNightBattle(tx, id, at, 'failed-run', rules, input));
    const receipts = await Promise.all([award(), award()]);
    expect(receipts[0]).toEqual(receipts[1]);
    const after = await get(id);
    expect(after.coins).toBe(40);
    expect(after.xp).toBe(35);
    expect(after.tasks.find((t) => t.event === 'solo')!.progress).toBe(1);
    await command(id, { kind: 'checkin', requestId: randomUUID() });
    await expect(command(id, { kind: 'checkin', requestId: randomUUID() })).rejects.toMatchObject({
      code: 'ALREADY_CLAIMED',
    });
    const claim = await command(id, { kind: 'claim-all', requestId: randomUUID() });
    expect(claim.tasks.find((t) => t.event === 'checkin')?.claimed).toBe(true);
    await expect(command(id, { kind: 'claim-all', requestId: randomUUID() })).rejects.toMatchObject(
      { code: 'NOT_CLAIMABLE' },
    );
    const coins = claim.coins;
    await database.db.transaction((tx) =>
      rewardNightBattle(tx, id, at, 'quit-run', rules, { ...input, valid: false }),
    );
    expect((await get(id)).coins).toBe(coins);
  });
  it('server-invalidated solo consumption refunds once while an ordinary cancellation does not refund a started run', async () => {
    const id = await owner();
    await seed(id, {
      inventory: { 'power-match': 2 },
      loadouts: {
        solo: { mods: ['power-match'], weapon: null, skill: null },
        duel: { mods: [], weapon: null, skill: null },
      },
    });
    const rule = {
      ...(await import(new URL('../rules/night-ranked.mjs', import.meta.url).href)).default,
    } as RankedRule;
    const map = new Map([[rule.id, rule]]),
      ranked = createRankedStore(database.db, map, store.identityDetails, () => at);
    const run = await ranked.create(
      id,
      rule.id,
      'level-corridor-01',
      'corridor-01',
      rule.version,
      randomUUID(),
    );
    await ranked.actions(id, rule.id, run.id, { seq: 1, frames: [{ input: {}, ticks: 2 }] });
    expect((await get(id)).inventory['power-match']).toBe(1);
    map.set(rule.id, { ...rule, version: rule.version + '-next' });
    const duel = (await import(new URL('../rules/night.mjs', import.meta.url).href))
      .default as Rule;
    const changed = createCompetitionStore(
      database.db,
      new Map([[duel.id, { ...duel, rankedVersion: rule.version + '-next' }]]),
      () => at,
    );
    expect((await changed.nightAssets(id)).inventory['power-match']).toBe(2);
    expect((await changed.nightAssets(id)).inventory['power-match']).toBe(2);
    expect((await get(id)).inventory['power-match']).toBe(2);
    await ranked.cancel(id, rule.id, run.id);
    expect((await get(id)).inventory['power-match']).toBe(2);
    map.set(rule.id, rule);
    const next = await ranked.create(
      id,
      rule.id,
      'level-corridor-01',
      'corridor-01',
      rule.version,
      randomUUID(),
    );
    await ranked.actions(id, rule.id, next.id, { seq: 1, frames: [{ input: {}, ticks: 2 }] });
    await ranked.cancel(id, rule.id, next.id);
    expect((await get(id)).inventory['power-match']).toBe(1);
  });
  it('room advancement and solo settlement maintain ledger-before-assets lock order on two connections', async () => {
    const [a, b] = await Promise.all([owner(), owner()]);
    let time = at;
    const duel = (await import(new URL('../rules/night.mjs', import.meta.url).href))
      .default as Rule;
    const live = createCompetitionStore(database.db, new Map([[duel.id, duel]]), () => time);
    for (const id of [a, b])
      await seed(id, {
        inventory: { 'power-match': 2 },
        loadouts: {
          solo: { mods: ['power-match'], weapon: null, skill: null },
          duel: { mods: ['power-match'], weapon: null, skill: null },
        },
      });
    const room = await live.create(a, duel.id, { mode: 'friend' });
    const joined = await live.roomAction(b, room.code, 'join', {});
    if (!('leaseId' in joined)) throw Error('Missing lease');
    await live.roomAction(a, room.code, 'ready', { leaseId: room.leaseId! });
    await live.roomAction(b, room.code, 'ready', { leaseId: joined.leaseId! });
    time += 1500;
    let release!: () => void, locked!: () => void;
    const held = new Promise<void>((resolve) => {
        locked = resolve;
      }),
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    const blocker = database.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`night-assets:${a}`},0))`,
      );
      locked();
      await gate;
    });
    await held;
    const roomAdvance = live.roomAction(b, room.code, 'get', { leaseId: joined.leaseId! });
    // Wait until the room really owns the ledger, rather than relying on scheduling sleeps.
    let found = false;
    for (let n = 0; n < 100; n++) {
      const rows = await database.db.execute(
        sql`select 1 from pg_locks where locktype='advisory' and granted and objid=(hashtext('night-overwatch-ledger')::bigint & 4294967295)::oid`,
      );
      if (rows.length) {
        found = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const soloFinish = database.db.transaction(async (tx) => {
      await nightLedgerLock(tx);
      return rewardNightBattle(tx, a, time, 'parallel-solo', rules, {
        mode: 'solo',
        outcome: 'loss',
        durationMs: 30000,
        valid: true,
      });
    });
    release();
    await Promise.all([blocker, roomAdvance, soloFinish]);
    expect(found).toBe(true);
    expect((await get(a)).inventory['power-match']).toBe(1);
    expect((await get(a)).coins).toBe(40);
    const changed = { ...duel, version: duel.version + '-next' };
    const invalid = createCompetitionStore(
      database.db,
      new Map([[changed.id, changed]]),
      () => time,
    );
    expect((await invalid.nightAssets(b)).inventory['power-match']).toBe(2);
    expect((await invalid.nightAssets(a)).inventory['power-match']).toBe(2);
    expect((await get(a)).inventory['power-match']).toBe(2);
    expect((await get(b)).inventory['power-match']).toBe(2);
  });
});
