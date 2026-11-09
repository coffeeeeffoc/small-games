/* eslint-disable max-lines -- Shared isolated PostgreSQL fixture verifies atomic economy and battle transitions. */
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { registerCompetition } from '../src/competition/routes.js';
import { sql } from 'drizzle-orm';
import { openDatabase } from '@coffeeeeffoc/service-kit';
import { createCompetitionStore } from '../src/competition/store.js';
import { createRankedStore } from '../src/competition/ranked-store.js';
import type { RankedRule } from '../src/competition/ranked-types.js';
import { nightLedgerLock, settleNightRoom } from '../src/competition/night-ledger.js';
import {
  nightAssets,
  previewNightMigration,
  reserveNightLoadout,
  verifyNightOfflineLoadout,
  consumeNightLoadout,
  rewardNightBattle,
  type NightAssets,
  type ProgressionRules,
  type AssetCommand,
} from '../src/competition/night-assets.js';
import type { Rule, Room } from '../src/competition/types.js';
import { gateFixture } from './control-fixture.js';
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
  it.each(
    (['mod', 'weapon', 'skill'] as const).flatMap((category) =>
      (['match', '24h'] as const).flatMap((term) =>
        (['checkin', 'open', 'wheel-spin'] as const).map((kind) => ({ category, term, kind })),
      ),
    ),
  )('$kind grants $category for $term and retries only once', async ({ category, term, kind }) => {
    const selected: ProgressionRules = {
      ...rules,
      catalog: rules.catalog
        .filter((p) => p.category === category)
        .map((p) => ({ ...p, rarity: 3, unlockLevel: 1 })),
      economy: {
        ...rules.economy!,
        termOdds: { match: term === 'match' ? 100 : 0, '24h': term === '24h' ? 100 : 0 },
      },
      wheelPrizes: [
        {
          weight: 100,
          coins: 60,
          xp: 40,
          tier: 3,
          category,
          term: 'random',
          fragments: { 'fragment:weapon': 2 },
        },
      ],
    };
    const id = await owner();
    await seed(id, { wheelTickets: 1, inventory: { 'pack:general:3': 1 } });
    const cmd: AssetCommand =
      kind === 'open'
        ? { kind, requestId: randomUUID(), item: 'pack:general:3', quantity: 1 }
        : { kind, requestId: randomUUID() };
    const run = () => database.db.transaction((tx) => nightAssets(tx, id, at, selected, cmd));
    const [a, b] = await Promise.all([run(), run()]);
    expect(a.lastReceipt).toEqual(b.lastReceipt);
    const gear = selected.catalog.find((p) => p.term === term && a.inventory[p.id] === 1);
    expect(gear, `${kind} ${category} ${term}`).toBeDefined();
    expect(a.active[gear!.effect] ?? 0).toBe(0);
    if (kind === 'wheel-spin') {
      expect(a.wheelTickets).toBe(0);
      expect(a.coins).toBe(60);
      expect(a.xp).toBe(40);
      expect(a.inventory['pack:general:3']).toBe(2);
      expect(a.inventory['fragment:weapon']).toBe(2);
      await expect(
        database.db.transaction((tx) =>
          nightAssets(tx, id, at, selected, { kind, requestId: randomUUID() }),
        ),
      ).rejects.toMatchObject({ code: 'NO_WHEEL_TICKETS' });
    }
  });
  it('daily equipment receipts are idempotent, usable at level one and convert fully permanent collections', async () => {
    const id = await owner(),
      cmd: AssetCommand = { kind: 'checkin', requestId: randomUUID() };
    const [a, b] = await Promise.all([command(id, cmd), command(id, cmd)]);
    expect(a.lastReceipt).toEqual(b.lastReceipt);
    const items = (a.lastReceipt as { items: Record<string, number> }).items,
      item = Object.keys(items)[0]!;
    const product = rules.catalog.find((p) => p.id === item)!;
    expect(['match', '24h']).toContain(product.term);
    expect(items[item]).toBe(1);
    expect(a.coins).toBe(100);
    expect(a.xp).toBe(40);
    expect(a.active[product.effect] ?? 0).toBe(0);
    if (product.term === '24h')
      await command(id, { kind: 'activate', item, requestId: randomUUID() });
    await command(id, {
      kind: 'loadout',
      requestId: randomUUID(),
      mode: 'solo',
      loadout: {
        mods: product.category === 'mod' ? [item] : [],
        weapon: product.category === 'weapon' ? item : null,
        skill: product.category === 'skill' ? item : null,
      },
    });
    const reserved = await database.db.transaction((tx) =>
      reserveNightLoadout(tx, id, at, 'newcomer', 'solo', rules),
    );
    expect(reserved.effects).toContain(product.effect);
    await expect(command(id, { ...cmd, requestId: randomUUID() })).rejects.toMatchObject({
      code: 'ALREADY_CLAIMED',
    });
    const duplicate = await owner();
    await seed(duplicate, { permanent: [...new Set(rules.catalog.map((p) => p.effect))] });
    const result = await command(duplicate, { ...cmd, requestId: randomUUID() });
    expect(result.inventory['fragment:weapon']).toBe(10);
    expect(result.inventory['drone-match'] ?? 0).toBe(0);
  });
  it('check-in prefers the only missing effect across categories and includes reserved stock as owned', async () => {
    for (const effect of ['power', 'drone', 'tracking']) {
      const id = await owner();
      await seed(id, {
        inventory: Object.fromEntries(
          rules.catalog
            .filter((p) => p.term === 'match' && p.effect !== effect)
            .map((p) => [p.id, 1]),
        ),
      });
      const result = await command(id, { kind: 'checkin', requestId: randomUUID() });
      const items = (result.lastReceipt as { items: Record<string, number> }).items;
      expect(Object.values(items)).toEqual([1]);
      expect([effect + '-match', effect + '-24h']).toContain(Object.keys(items)[0]);
    }
  });
  it('combination packs award all components atomically once and prepare newly earned level skills before drawing', async () => {
    const id = await owner();
    await seed(id, {
      xp: 2980,
      inventory: { 'pack:general:1': 2 },
      permanent: rules.catalog
        .filter((p) => p.rarity === 1 && p.effect !== 'tracking')
        .map((p) => p.effect),
    });
    const cmd: AssetCommand = {
      kind: 'open',
      item: 'pack:general:1',
      quantity: 2,
      requestId: randomUUID(),
    };
    const [a, b] = await Promise.all([command(id, cmd), command(id, cmd)]);
    expect(a.lastReceipt).toEqual(b.lastReceipt);
    const drops = (
      a.lastReceipt as { drops: Array<{ item?: string; coins?: number; xp?: number }> }
    ).drops;
    expect(drops.reduce((n, d) => n + (d.xp ?? 0), 0)).toBe(40);
    expect(drops.reduce((n, d) => n + (d.coins ?? 0), 0)).toBe(240);
    expect(drops.filter((d) => d.item?.startsWith('fragment:'))).toHaveLength(4);
    expect(drops.some((d) => d.item?.startsWith('tracking-'))).toBe(false);
    const state = await get(id);
    expect(state.xp).toBe(3020);
    expect(state.permanent).toContain('tracking');
    expect(state.inventory['pack:general:1'] ?? 0).toBe(0);
  });
  it('long achievements recover uncapped authoritative historical receipts once and claim only once', async () => {
    const id = await owner();
    await get(id);
    await database.db.execute(
      sql`update runtime.competition_matches set data=(data-'achievementHistoryVersion')||${JSON.stringify({ signedDays: ['2026-10-01', '2026-10-01', '2026-10-02'] })}::jsonb where id=${'night-assets:' + id}`,
    );
    await database.db.execute(
      sql`insert into runtime.competition_matches(id,board,data,created_at) select ${'night-assets-event:' + id + ':battle:history-'}||n,'night-overwatch:private-assets-v3',jsonb_build_object('input',jsonb_build_object('valid',n<=251,'durationMs',case when n=251 then 9999 else 10000 end,'outcome','win')),${at} from generate_series(1,252) n`,
    );
    const state = await get(id);
    expect(state.achievements.find((a) => a.id === 'sorties-250')).toMatchObject({
      progress: 250,
      claimed: false,
    });
    expect(state.achievements.find((a) => a.id === 'victories-250')).toMatchObject({
      progress: 250,
    });
    expect(state.achievements.find((a) => a.id === 'checkins-7')).toMatchObject({ progress: 2 });
    const cmd: AssetCommand = {
      kind: 'claim-achievement',
      achievementId: 'sorties-250',
      requestId: randomUUID(),
    };
    const a = await command(id, cmd),
      b = await command(id, cmd);
    expect(a.lastReceipt).toEqual(b.lastReceipt);
    await expect(command(id, { ...cmd, requestId: randomUUID() })).rejects.toMatchObject({
      code: 'NOT_CLAIMABLE',
    });
  });
  it('crafting validates recipes, rolls back failures, serializes spending and retains permanent grants', async () => {
    const id = await owner();
    await seed(id, { inventory: { 'fragment:weapon': 10, 'fragment:skill': 60 } });
    for (const item of ['unknown', 'burst-match', 'laser-24h'])
      await expect(
        command(id, { kind: 'craft', item, requestId: randomUUID() }),
      ).rejects.toMatchObject({ code: 'ITEM_UNAVAILABLE' });
    await expect(
      command(id, { kind: 'craft', item: 'laser-match', requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_FRAGMENTS' });
    expect((await get(id)).inventory['fragment:weapon']).toBe(10);
    const cmd: AssetCommand = { kind: 'craft', item: 'drone-match', requestId: randomUUID() };
    const results = await Promise.all([command(id, cmd), command(id, cmd)]);
    expect(results[0].lastReceipt).toEqual(results[1].lastReceipt);
    expect((await get(id)).inventory['drone-match']).toBe(1);
    expect((await get(id)).inventory['fragment:weapon'] ?? 0).toBe(0);
    await expect(command(id, { ...cmd, item: 'laser-match' })).rejects.toMatchObject({
      code: 'REQUEST_ID_CONFLICT',
    });
    await seed(id, { inventory: { 'fragment:weapon': 10, 'fragment:skill': 60 } });
    const race = await Promise.allSettled([
      command(id, { ...cmd, requestId: randomUUID() }),
      command(id, { ...cmd, requestId: randomUUID() }),
    ]);
    expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const item of ['tracking-permanent', 'emp-permanent'])
      await command(id, { kind: 'craft', item, requestId: randomUUID() });
    expect((await get(id)).permanent).toEqual(expect.arrayContaining(['tracking', 'emp']));
    await expect(
      command(id, { kind: 'craft', item: 'emp-permanent', requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'ALREADY_OWNED' });
    await seed(id, { inventory: { 'fragment:weapon': 3 } });
    const sold = await command(id, {
      kind: 'sell',
      item: 'fragment:weapon',
      quantity: 2,
      requestId: randomUUID(),
    });
    expect(sold.coins).toBe(20);
    expect(sold.inventory['fragment:weapon']).toBe(1);
  });
  it('permanent ownership rejects redundant purchases and crafting without spending or deleting stock', async () => {
    const id = await owner();
    await seed(id, {
      coins: 100000,
      xp: 3000,
      permanent: ['drone'],
      inventory: {
        'fragment:weapon': 300,
        'fragment:skill': 100,
        'drone-match': 2,
        'drone-24h': 1,
      },
    });
    const before = await get(id);
    expect(before.permanent).toContain('tracking');
    for (const effect of ['drone', 'tracking']) {
      for (const term of ['match', '24h', 'permanent'])
        await expect(
          command(id, {
            kind: 'buy',
            item: `${effect}-${term}`,
            quantity: 1,
            requestId: randomUUID(),
          }),
        ).rejects.toMatchObject({ code: 'ALREADY_OWNED' });
      for (const term of ['match', 'permanent'])
        await expect(
          command(id, { kind: 'craft', item: `${effect}-${term}`, requestId: randomUUID() }),
        ).rejects.toMatchObject({ code: 'ALREADY_OWNED' });
    }
    const after = await get(id);
    expect(after.coins).toBe(before.coins);
    expect(after.inventory).toEqual(before.inventory);
    expect(
      (
        await command(id, {
          kind: 'sell',
          item: 'drone-match',
          quantity: 1,
          requestId: randomUUID(),
        })
      ).inventory['drone-match'],
    ).toBe(1);
  });
  it('campaign and qualified duel fragments use authoritative level rewards and daily caps', async () => {
    const id = await owner();
    const award = (battle: string, input: Parameters<typeof rewardNightBattle>[5], time = at) =>
      database.db.transaction((tx) => rewardNightBattle(tx, id, time, battle, rules, input));
    const first = {
      mode: 'solo' as const,
      outcome: 'win' as const,
      durationMs: 60000,
      valid: true,
      levelId: 'corridor-01',
      firstClear: true,
    };
    expect(await award('first', first)).toMatchObject({
      coins: 360,
      xp: 240,
      firstClear: true,
      fragments: { 'fragment:weapon': 6 },
    });
    expect(await award('repeat', { ...first, firstClear: false })).toMatchObject({
      coins: 180,
      xp: 120,
      firstClear: false,
      fragments: { 'fragment:weapon': 2 },
    });
    expect(await award('second', { ...first, levelId: 'ambush-02' })).toMatchObject({
      coins: 375,
      xp: 246,
      fragments: { 'fragment:skill': 6 },
    });
    await seed(id, { permanent: ['tracking', 'emp'] });
    expect(
      await award('redirect', { ...first, levelId: 'ambush-02', firstClear: false }),
    ).toMatchObject({ fragments: { 'fragment:weapon': 2 } });
    for (const [name, patch] of [
      ['short', { durationMs: 59999 }],
      ['invalid', { valid: false }],
      ['bot', { mode: 'bot' }],
    ] as const) {
      const result = await award(name, { ...first, mode: 'duel', ...patch });
      expect(result.fragments).toBeUndefined();
    }
    for (let i = 0; i < 11; i++) {
      const result = await award(`duel-${i}`, {
        ...first,
        mode: 'duel',
        outcome: i % 2 ? 'loss' : 'win',
      });
      if (i < 10) expect(result.fragments).toEqual({ 'fragment:weapon': i % 2 ? 1 : 2 });
      else expect(result.fragments).toBeUndefined();
    }
    expect((await get(id)).duelFragmentBattlesToday).toBe(10);
    expect((await award('new-day', { ...first, mode: 'duel' }, at + 86400000)).fragments).toEqual({
      'fragment:weapon': 2,
    });
  });
  it('room settlement only gives fragments for natural, participating, non-takeover human matches', async () => {
    for (const scenario of [
      'eligible',
      'disconnect',
      'abandoned',
      'takeover',
      'idle',
      'short',
      'delayed-short',
    ]) {
      const a = await owner(),
        b = await owner(),
        created = await store.create(a, 'night-overwatch', { mode: 'friend' });
      await store.roomAction(b, created.code, 'join', {});
      const rows = await database.db.execute(
          sql`select data from runtime.competition_rooms where code=${created.code}`,
        ),
        room = rows[0]!.data as Room;
      room.startedAt = at - (scenario === 'short' ? 59999 : 60100);
      const secondary = scenario === 'delayed-short' ? 59999 : 60000;
      room.players[0]!.result = {
        finished: true,
        eligible: true,
        score: 100,
        secondary,
        outcome: 'win',
        participated: scenario !== 'idle',
      };
      room.players[1]!.result = {
        finished: true,
        eligible: true,
        score: 0,
        secondary,
        outcome: 'loss',
        participated: true,
      };
      if (scenario === 'takeover') room.players[0]!.takenOver = true;
      const reason =
        scenario === 'disconnect'
          ? 'disconnect'
          : scenario === 'abandoned'
            ? 'abandoned'
            : 'elimination';
      await database.db.transaction(async (tx) => {
        await settleNightRoom(tx, room, at, reason, rules);
        await settleNightRoom(tx, room, at, reason, rules);
      });
      expect((await get(a)).inventory['fragment:weapon'] ?? 0).toBe(
        scenario === 'eligible' ? 2 : 0,
      );
      expect((await get(b)).inventory['fragment:weapon'] ?? 0).toBe(
        ['disconnect', 'abandoned', 'short', 'delayed-short'].includes(scenario) ? 0 : 1,
      );
    }
  });
  it('reward previews include old verified replay clears before backfill and exclude unrelated boards', async () => {
    const id = await owner();
    for (const [level, score] of [
      ['corridor-01', 100],
      ['ambush-02', 0],
      ['forged-999', 100],
    ] as const)
      await database.db.execute(
        sql`insert into runtime.competition_results(match_id,board,player_id,score,secondary,created_at) values(${randomUUID()},${`night-overwatch:level-${level}:night-input-replay-v1`},${id},${score},60000,${at})`,
      );
    expect((await get(id)).clearedLevels).toEqual(['corridor-01']);
  });
  it('ranked settlement grants first clear once across concurrent runs and honors exact historical levels', async () => {
    let time = at;
    const original = (await import(new URL('../rules/night-ranked.mjs', import.meta.url).href))
      .default as RankedRule;
    const rule: RankedRule = {
      ...original,
      create: () => ({}),
      configure: (state) => state,
      apply: (state) => state,
      result: () => ({
        complete: true,
        eligible: true,
        participated: true,
        cleared: true,
        fastestEligible: true,
        score: 100,
        secondary: 60000,
      }),
    };
    const ranked = createRankedStore(
      database.db,
      new Map([[rule.id, rule]]),
      store.identityDetails,
      () => time,
    );
    const start = async (id: string, level = 'corridor-01') => {
      const run = await ranked.create(
        id,
        rule.id,
        `level-${level}`,
        level,
        rule.version,
        randomUUID(),
      );
      await ranked.actions(id, rule.id, run.id, { seq: 1, frames: [{ ticks: 1, input: {} }] });
      return run;
    };
    const id = await owner(),
      a = await start(id),
      b = await start(id);
    time += 60000;
    const results = await Promise.all([
      ranked.finish(id, rule.id, a.id, 1),
      ranked.finish(id, rule.id, b.id, 1),
    ]);
    expect(results.map((result) => result.coins).sort()).toEqual([180, 360]);
    expect(results.filter((result) => result.firstClear)).toHaveLength(1);
    expect((await get(id, time)).inventory['fragment:weapon']).toBe(8);
    expect(await ranked.finish(id, rule.id, a.id, 1)).toEqual(results[0]);
    const next = await start(id, 'ambush-02');
    time += 60000;
    expect(await ranked.finish(id, rule.id, next.id, 1)).toMatchObject({
      firstClear: true,
      coins: 375,
      xp: 246,
    });
    const old = await owner();
    await database.db.execute(
      sql`insert into runtime.competition_best(board,player_id,score,secondary,match_id,updated_at) values('night-overwatch:level-corridor-01:night-records-v1',${old},1,60000,${randomUUID()},${time})`,
    );
    const repeat = await start(old);
    time += 60000;
    expect(await ranked.finish(old, rule.id, repeat.id, 1)).toMatchObject({
      firstClear: false,
      coins: 180,
    });
    const raw = await owner();
    await database.db.execute(
      sql`update runtime.competition_matches set data='{}'::jsonb where id='night-migration:highest-clear-v2'`,
    );
    await database.db.execute(
      sql`insert into runtime.competition_results(match_id,board,player_id,score,secondary,created_at) values(${randomUUID()},'night-overwatch:level-corridor-01:night-input-replay-v1',${raw},100,60000,${time})`,
    );
    const migrated = await start(raw);
    time += 60000;
    expect(await ranked.finish(raw, rule.id, migrated.id, 1)).toMatchObject({
      firstClear: false,
      coins: 180,
    });
  });
  it('development adjustments require server capability and retain atomic idempotent receipts', async () => {
    const id = await owner();
    const cmd: AssetCommand = {
      kind: 'dev-adjust',
      requestId: randomUUID(),
      coinsDelta: 400,
      xpDelta: 250,
    };
    const develop = (input: AssetCommand) =>
      database.db.transaction((tx) => nightAssets(tx, id, at, rules, input, true));
    await expect(command(id, cmd)).rejects.toMatchObject({ code: 'DEV_TOOLS_DISABLED' });
    expect((await get(id)).devToolsEnabled).toBe(false);
    const results = await Promise.all([develop(cmd), develop(cmd)]);
    expect(results[0].coins).toBe(400);
    expect(results[1].xp).toBe(250);
    expect(results[0].devToolsEnabled).toBe(true);
    expect(results[0].lastReceipt).toMatchObject({
      before: { coins: 0, xp: 0 },
      after: { coins: 400, xp: 250 },
      coinsDelta: 400,
      xpDelta: 250,
    });
    await expect(command(id, cmd)).rejects.toMatchObject({ code: 'DEV_TOOLS_DISABLED' });
    await expect(develop({ ...cmd, coinsDelta: 401 })).rejects.toMatchObject({
      code: 'REQUEST_ID_CONFLICT',
    });
    await develop({ ...cmd, requestId: randomUUID(), coinsDelta: -35, xpDelta: -50 });
    expect((await get(id)).coins).toBe(365);
    expect((await get(id)).xp).toBe(200);
    await expect(
      develop({ ...cmd, requestId: randomUUID(), coinsDelta: 0, xpDelta: -201 }),
    ).rejects.toMatchObject({ code: 'INVALID_DEV_BALANCE' });
    await expect(
      develop({ ...cmd, requestId: randomUUID(), coinsDelta: -366 }),
    ).rejects.toMatchObject({ code: 'INVALID_DEV_BALANCE' });
    for (const coinsDelta of [1.5, 1e9 + 1])
      await expect(develop({ ...cmd, requestId: randomUUID(), coinsDelta })).rejects.toThrow();
    expect((await get(id)).coins).toBe(365);
    await seed(id, { coins: Number.MAX_SAFE_INTEGER });
    await expect(develop({ ...cmd, requestId: randomUUID(), coinsDelta: 1 })).rejects.toMatchObject(
      { code: 'INVALID_DEV_BALANCE' },
    );
  });
  it('HTTP developer mutations authenticate and scope the owner, with production disabled', async () => {
    const definitions = new Map(store.gameDefinitions().map((rule) => [rule.id, rule]));
    const developmentStore = createCompetitionStore(
      database.db,
      definitions,
      () => at,
      undefined,
      true,
    );
    const player = await store.guestSession({ game: 'night-overwatch' });
    const other = await store.guestSession({ game: 'wulong-city' });
    const cmd = { kind: 'dev-adjust', requestId: randomUUID(), coinsDelta: 77 };
    for (const [current, enabled] of [
      [store, false],
      [developmentStore, true],
    ] as const) {
      const app = Fastify();
      await registerCompetition(
        app,
        current,
        {},
        undefined,
        undefined,
        createRankedStore(database.db, new Map(), current.identityDetails, () => at),
      );
      try {
        const url = '/api/competition/v1/games/night-overwatch/assets';
        const post = (token?: string, payload: object = cmd) =>
          app.inject({
            method: 'POST',
            url,
            headers: token ? { authorization: `Bearer ${token}` } : {},
            payload,
          });
        const shared = (
          token?: string,
          payload: object = { requestId: cmd.requestId, deltas: { coins: 77 } },
          game = 'night-overwatch',
        ) =>
          app.inject({
            method: 'POST',
            url: `/api/competition/v1/games/${game}/development/assets`,
            headers: token ? { authorization: `Bearer ${token}` } : {},
            payload,
          });
        const metadata = await app.inject({
          url: '/api/competition/v1/games/night-overwatch',
          headers: { authorization: `Bearer ${player.token}` },
        });
        expect(metadata.json().developmentAssets).toEqual({ enabled, assets: ['coins', 'xp'] });
        expect((await shared()).statusCode).toBe(401);
        expect((await shared(other.token)).statusCode).toBe(403);
        expect((await post()).statusCode).toBe(401);
        expect((await post(other.token)).statusCode).toBe(403);
        const result = await post(player.token);
        expect(result.statusCode).toBe(enabled ? 200 : 403);
        if (enabled) {
          expect(result.json()).toMatchObject({
            playerId: player.playerId,
            coins: 77,
            devToolsEnabled: true,
          });
          expect((await post(player.token)).json().coins).toBe(77);
          expect((await shared(player.token)).json().coins).toBe(77);
          const requestId = randomUUID();
          expect(
            (await shared(player.token, { requestId, deltas: { coins: -7, xp: 20 } })).json(),
          ).toMatchObject({ coins: 70, xp: 20 });
          expect(
            (
              await post(player.token, {
                kind: 'dev-adjust',
                requestId,
                coinsDelta: -7,
                xpDelta: 20,
              })
            ).json(),
          ).toMatchObject({ coins: 70, xp: 20 });
          expect(
            (
              await shared(player.token, { requestId: randomUUID(), deltas: { coins: -71 } })
            ).json(),
          ).toMatchObject({ error: 'INVALID_DEV_BALANCE' });
          expect(
            (await shared(player.token, { requestId: randomUUID(), deltas: { gems: 1 } })).json(),
          ).toMatchObject({ error: 'DEVELOPMENT_ASSET_UNSUPPORTED' });
          expect(
            (
              await shared(player.token, {
                requestId: randomUUID(),
                deltas: { coins: 1 },
                development: true,
              })
            ).statusCode,
          ).toBe(422);
          expect(
            (
              await shared(
                other.token,
                { requestId: randomUUID(), deltas: { coins: 1 } },
                'wulong-city',
              )
            ).json(),
          ).toMatchObject({ error: 'DEVELOPMENT_ASSETS_UNSUPPORTED' });
          expect((await post(player.token, { ...cmd, playerId: other.playerId })).statusCode).toBe(
            422,
          );
        } else {
          expect(result.json()).toMatchObject({ error: 'DEV_TOOLS_DISABLED' });
          expect((await shared(player.token)).json()).toMatchObject({
            error: 'DEV_TOOLS_DISABLED',
          });
        }
      } finally {
        await app.close();
      }
    }
    expect(
      await database.db.execute(
        sql`select id from runtime.competition_matches where id=${`night-assets:${other.playerId}`}`,
      ),
    ).toHaveLength(0);
  });
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
  it('offline runs may claim only owned permanent effects at or below the current level', async () => {
    const id = await owner();
    await seed(id, { permanent: ['power'], active: { tracking: at + 86400000 } });
    const verify = (loadout: Parameters<typeof verifyNightOfflineLoadout>[3]) =>
      database.db.transaction((tx) => verifyNightOfflineLoadout(tx, id, at, loadout, rules));
    const base = { version: rules.version, level: 1, skipped: ['x'] };
    expect(await verify({ ...base, effects: ['power'] })).toEqual({
      ...base,
      effects: ['power'],
      skipped: [],
    });
    for (const loadout of [
      { ...base, effects: ['tracking'] },
      { ...base, effects: ['power', 'power'] },
      { ...base, level: 2, effects: [] },
      { ...base, version: 'old', effects: [] },
      undefined,
    ])
      await expect(verify(loadout)).rejects.toMatchObject({ code: 'INVALID_LOADOUT' });
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
      const drops = (
        result.lastReceipt as { drops: Array<{ item?: string; coins?: number; xp?: number }> }
      ).drops;
      for (const drop of drops) {
        if (drop.item?.startsWith('fragment:')) {
          expect(['fragment:weapon', 'fragment:skill']).toContain(drop.item);
          continue;
        }
        if (drop.xp) {
          expect(drop.xp).toBe(rules.economy!.bundleTiers![Number(item.at(-1))]!.xp);
          continue;
        }
        if (drop.item) {
          const p = rules.catalog.find((p) => p.id === drop.item)!;
          expect(p.rarity).toBe(Number(item.at(-1)));
          if (item.includes('general')) expect(p.goldOnly).toBe(false);
        } else
          expect([
            rules.pools[item.split(':')[1]!]!.coinDrops[Number(item.at(-1))],
            rules.economy!.bundleTiers![Number(item.at(-1))]!.coins,
          ]).toContain(drop.coins);
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
  it('unifies old crate keys without losing old retries and gates actual prizes and purchases', async () => {
    const id = await owner();
    await seed(id, { coins: 10000, inventory: { 'pack:general:3': 1, 'pack:gold:3': 2 } });
    expect((await get(id)).inventory['pack:general:3']).toBe(3);
    expect((await get(id)).inventory).not.toHaveProperty('pack:gold:3');
    await expect(
      command(id, { kind: 'buy', item: 'burst-match', quantity: 1, requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'LEVEL_LOCKED' });
    const old: AssetCommand = {
      kind: 'open',
      item: 'pack:gold:3',
      quantity: 1,
      requestId: randomUUID(),
    };
    const low = await command(id, old);
    expect(low.lastReceipt).toMatchObject({
      drops: expect.arrayContaining([{ coins: 800 }, { xp: 80 }]),
    });
    expect((await command(id, old)).coins).toBe(low.coins);
    await seed(id, { xp: 13200 });
    const unlocked = await command(id, {
      kind: 'open',
      item: 'pack:general:3',
      quantity: 1,
      requestId: randomUUID(),
    });
    expect(unlocked.lastReceipt).toMatchObject({
      drops: expect.arrayContaining([
        { item: expect.stringMatching(/^burst-(match|24h)$/) },
        { coins: 200 },
        { xp: 80 },
      ]),
    });
    await seed(id, { permanent: ['burst'] });
    expect(
      (
        await command(id, {
          kind: 'open',
          item: 'pack:gold:3',
          quantity: 1,
          requestId: randomUUID(),
        })
      ).lastReceipt,
    ).toMatchObject({ drops: expect.arrayContaining([{ coins: 800 }, { xp: 80 }]) });
    expect((await get(id)).inventory['pack:general:3']).toBe(0);
  });
  it('wheel orders coexist with five legacy orders, serialize ad playback, retain tickets and settle once', async () => {
    const id = await owner();
    for (const quantity of [1, 3, 5, 10, 20])
      await command(id, { kind: 'ad-order', quantity, requestId: randomUUID() });
    const created = await command(id, {
      kind: 'ad-order',
      quantity: 1,
      purpose: 'wheel',
      requestId: randomUUID(),
    });
    const order = created.videoOrders.find((o) => o.purpose === 'wheel')!;
    expect(order.required).toBe(1);
    expect((await get(id)).videoOrders.at(-1)?.purpose).toBe('wheel');
    await expect(
      command(id, { kind: 'ad-order', quantity: 1, purpose: 'wheel', requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_ORDERS' });
    const starts = await Promise.allSettled(
      [1, 2].map(() =>
        command(id, { kind: 'ad-start', orderId: order.id, requestId: randomUUID() }),
      ),
    );
    expect(starts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const started = (
      starts.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<
        Awaited<ReturnType<typeof command>>
      >
    ).value;
    const attemptId = (started.lastReceipt as { attemptId: string }).attemptId;
    await expect(
      command(id, {
        kind: 'ad-start',
        orderId: created.videoOrders[0]!.id,
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'AD_IN_PROGRESS' });
    await command(id, { kind: 'ad-cancel', orderId: order.id, attemptId, requestId: randomUUID() });
    expect((await get(id)).wheelTickets).toBe(0);
    expect((await get(id)).videosToday).toBe(0);
    const retry = await command(id, {
      kind: 'ad-start',
      orderId: order.id,
      requestId: randomUUID(),
    });
    const completed: AssetCommand = {
      kind: 'ad-complete',
      orderId: order.id,
      attemptId: (retry.lastReceipt as { attemptId: string }).attemptId,
      requestId: randomUUID(),
    };
    const done = await command(id, completed, at + 100);
    expect(done.wheelTickets).toBe(1);
    expect(done.wheelVideosToday).toBe(1);
    expect(done.videosToday).toBe(1);
    expect(
      (await command(id, { ...completed, requestId: randomUUID() }, at + 86400000)).wheelTickets,
    ).toBe(1);
    const spin: AssetCommand = { kind: 'wheel-spin', requestId: randomUUID() };
    const result = await command(id, spin, at + 86400000);
    expect(result.wheelTickets).toBe(0);
    expect((await command(id, spin, at + 86400000)).lastReceipt).toEqual(result.lastReceipt);
    await expect(
      command(id, { kind: 'wheel-spin', requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'NO_WHEEL_TICKETS' });
    await seed(id, { videoDays: { [created.day]: 11 }, wheelVideoDays: { [created.day]: 4 } });
    const next = await command(id, {
      kind: 'ad-order',
      quantity: 1,
      purpose: 'wheel',
      requestId: randomUUID(),
    });
    const nextOrder = next.videoOrders.find((o) => o.purpose === 'wheel' && !o.delivered)!;
    const permit = await command(id, {
      kind: 'ad-start',
      orderId: nextOrder.id,
      requestId: randomUUID(),
    });
    const last = await command(id, {
      kind: 'ad-complete',
      orderId: nextOrder.id,
      attemptId: (permit.lastReceipt as { attemptId: string }).attemptId,
      requestId: randomUUID(),
    });
    expect(last.videosToday).toBe(12);
    expect(last.wheelVideosToday).toBe(5);
    await expect(
      command(id, {
        kind: 'ad-start',
        orderId: created.videoOrders[0]!.id,
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'DAILY_VIDEO_LIMIT' });
    expect((await get(id, at + 86400000)).wheelTickets).toBe(1);
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
  it('retention persists raw reservation releases, preserves consumed stock and honors existing invalidation refunds', async () => {
    for (const mode of ['unused', 'consumed', 'old-unused', 'old-consumed', 'disabled', 'epoch']) {
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
      const registry = new Map([[rule.id, rule]]),
        gate = gateFixture();
      let time = at;
      const ranked = createRankedStore(
        database.db,
        registry,
        store.identityDetails,
        () => time,
        gate.control,
      );
      const requestId = randomUUID();
      const run = await ranked.create(
        id,
        rule.id,
        'level-corridor-01',
        'corridor-01',
        rule.version,
        requestId,
      );
      const consumed = ['consumed', 'old-consumed', 'disabled', 'epoch'].includes(mode);
      if (consumed)
        await ranked.actions(id, rule.id, run.id, { seq: 1, frames: [{ input: {}, ticks: 2 }] });
      if (mode.startsWith('old-'))
        registry.set(rule.id, { ...rule, version: rule.version + '-next' });
      if (mode === 'disabled') gate.set('disabled', 1);
      if (mode === 'epoch') gate.set('enabled', 1);
      time += 86400000;
      if (!['unused', 'consumed'].includes(mode))
        await expect(ranked.retireExpired(id, rule.id, run.id)).rejects.toMatchObject({
          code:
            mode === 'disabled'
              ? 'GAME_DISABLED'
              : mode === 'epoch'
                ? 'GAME_CANCELLED'
                : 'RULE_VERSION_CHANGED',
        });
      const results = await Promise.all([
        ranked.retireExpired(id, rule.id, run.id),
        ranked.retireExpired(id, rule.id, run.id),
      ]);
      expect(results.every((value) => value.status === 'finished')).toBe(true);
      // Inspect persisted JSON directly: an assets GET would hide a missing save by preparing in memory.
      const wallet = (
        await database.db.execute(
          sql`select data from runtime.competition_matches where id=${`night-assets:${id}`}`,
        )
      )[0]!.data as NightAssets;
      expect(wallet.inventory['power-match']).toBe(mode === 'consumed' ? 1 : 2);
      expect(wallet.reservations[`run:${run.id}`]!.status).toBe(
        mode === 'consumed' ? 'consumed' : consumed ? 'refunded' : 'released',
      );
      const before = structuredClone(wallet);
      await ranked.retireExpired(id, rule.id, run.id);
      expect(
        (
          await database.db.execute(
            sql`select data from runtime.competition_matches where id=${`night-assets:${id}`}`,
          )
        )[0]!.data,
      ).toEqual(before);
      gate.set('enabled', 0);
      registry.set(rule.id, rule);
      expect(
        (
          await ranked.create(
            id,
            rule.id,
            'level-corridor-01',
            'corridor-01',
            rule.version,
            requestId,
          )
        ).id,
      ).toBe(run.id);
      expect(
        (
          await database.db.execute(
            sql`select count(*)::integer as n from runtime.competition_matches where id=${`ranked-run:${run.id}`}`,
          )
        )[0]!.n,
      ).toBe(1);
    }
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
