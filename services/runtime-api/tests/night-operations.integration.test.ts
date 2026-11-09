import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { openDatabase, type NightOperations } from '@coffeeeeffoc/service-kit';
import { sql } from 'drizzle-orm';
import { createCompetitionStore } from '../src/competition/store.js';
import type { Rule } from '../src/competition/types.js';
import { gateFixture } from './control-fixture.js';
import { game, releaseFixture } from './night-release.fixture.js';

const url = process.env.COMPETITION_TEST_DATABASE_URL;
(url ? describe : describe.skip)('Night published operations in isolated PostgreSQL', () => {
  let database: ReturnType<typeof openDatabase>;
  beforeAll(() => {
    if (!url || new URL(url).pathname !== '/competition_test')
      throw Error('Use isolated competition_test');
    database = openDatabase(url, 'runtime');
  });
  afterAll(async () => {
    await database?.close();
  });
  it('compensates only players seen in the login range, atomically claims once, and keeps the mail', async () => {
    let at = Date.now();
    const rule = (await import(new URL('../rules/night.mjs', import.meta.url).href))
      .default as Rule;
    const gate = gateFixture(),
      store = createCompetitionStore(database.db, new Map([[game, rule]]), () => at, gate.control);
    const owner = (await store.guestSession({ game })).playerId;
    const before = await store.nightAssets(owner);
    const ops: NightOperations = {
      announcements: [
        { id: 'ops-notice', title: '公告', body: '正文', enabled: true, startsAt: at },
      ],
      compensations: [
        {
          id: randomUUID(),
          title: '补偿',
          body: '登录过的玩家',
          loginFrom: at - 1000,
          loginTo: at + 10,
          reward: { coins: 10, xp: 20, packs: 1 },
        },
      ],
    };
    at += 20;
    gate.operations(ops);
    const [first, second] = await Promise.all([store.nightAssets(owner), store.nightAssets(owner)]);
    const mailId = `ops-compensation:${ops.compensations[0]!.id}`;
    expect(first.mail.filter((m) => m.id === mailId)).toHaveLength(1);
    expect(second.mail.filter((m) => m.id === mailId)).toHaveLength(1);
    expect(second.announcements).toMatchObject([{ id: 'ops-notice' }]);
    // A player first seen after the range closes receives nothing.
    const newer = (await store.guestSession({ game })).playerId;
    expect((await store.nightAssets(newer)).mail.some((m) => m.id === mailId)).toBe(false);
    gate.operations({ announcements: [], compensations: [] });
    const commands = Array.from({ length: 2 }, () => ({
      kind: 'claim-mail' as const,
      mailId,
      requestId: randomUUID(),
    }));
    const claims = await Promise.allSettled(commands.map((c) => store.nightAssets(owner, c)));
    expect(claims.filter((c) => c.status === 'fulfilled')).toHaveLength(1);
    const winner = claims.findIndex((c) => c.status === 'fulfilled');
    const retry = await store.nightAssets(owner, commands[winner]!);
    expect(retry.coins).toBe(before.coins + 10);
    expect(retry.xp).toBe(before.xp + 20);
    expect(retry.mail.find((m) => m.id === mailId)).toMatchObject({
      claimed: true,
      reward: { coins: 10, xp: 20, packs: 1 },
    });
    at += 2000;
    gate.operations(ops);
    expect((await store.nightAssets(owner)).mail.filter((m) => m.id === mailId)).toHaveLength(1);
    const [wallet] = await database.db.execute(
      sql`select data from runtime.competition_matches where id=${`night-assets:${owner}`}`,
    );
    expect(wallet?.data).toMatchObject({ coins: before.coins + 10, xp: before.xp + 20 });
  });
  it('stops and restores one build without restarting the store or disrupting an old playing room', async () => {
    let at = Date.now();
    const f = releaseFixture(),
      gate = gateFixture();
    const ops: NightOperations = {
      announcements: [],
      compensations: [],
      release: structuredClone(f.config),
    };
    ops.release!.builds.push({ ...ops.release!.builds[0]!, buildId: 'same-rule' });
    gate.operations(ops);
    const store = createCompetitionStore(
      database.db,
      new Map([[game, f.current.multiplayer]]),
      () => at,
      gate.control,
      false,
      new Map(),
      f.release,
    );
    const [a, b, c, d] = await Promise.all(
      Array.from({ length: 4 }, async () => (await store.guestSession({ game })).playerId),
    );
    const room = await store.create(a!, game, { buildId: 'build-a', mode: 'friend' });
    const joined = (await store.roomAction(b!, room.code, 'join', {
      game,
      buildId: 'build-a',
    })) as { leaseId: string };
    await store.roomAction(a!, room.code, 'ready', {
      game,
      buildId: 'build-a',
      leaseId: room.leaseId,
    });
    await store.roomAction(b!, room.code, 'ready', {
      game,
      buildId: 'build-a',
      leaseId: joined.leaseId,
    });
    ops.release!.builds[0]!.disabled = true;
    expect((await store.nightReleaseMetadata(a!, 'build-a'))?.release.canStartNewGames).toBe(false);
    expect((await store.nightReleaseMetadata(a!, 'same-rule'))?.release.canStartNewGames).toBe(
      true,
    );
    await expect(
      store.create(c!, game, { buildId: 'build-a', mode: 'friend' }),
    ).rejects.toMatchObject({ code: 'BUILD_DISABLED' });
    await expect(store.match(c!, game, 'build-a')).rejects.toMatchObject({
      code: 'BUILD_DISABLED',
    });
    const other = await store.create(c!, game, { buildId: 'same-rule', mode: 'friend' });
    expect(other.version).toBe('duel-a');
    at += 1300;
    ops.release!.builds.push({
      buildId: 'future-build',
      channel: 'h5',
      ranked: 'solo-future',
      multiplayer: 'duel-future',
    });
    ops.release!.allowNew.ranked.push('solo-future');
    ops.release!.allowNew.multiplayer.push('duel-future');
    const connected = (await store.roomAction(a!, room.code, 'connect', {
      game,
      buildId: 'build-a',
    })) as { leaseId: string };
    const input = { game, leaseId: connected.leaseId, seq: 1, action: {} };
    const result = await store.roomAction(a!, room.code, 'actions', input);
    expect(await store.roomAction(a!, room.code, 'actions', input)).toEqual(result);
    ops.release!.builds[0]!.removed = true;
    await database.db.execute(
      sql`update runtime.competition_rooms set data=jsonb_set(data,'{players,0,state,finished}','true'::jsonb) where code=${room.code}`,
    );
    const finished = await store.roomAction(a!, room.code, 'get', { game });
    expect(finished).toMatchObject({ status: 'finished', version: 'duel-a' });
    expect(await store.roomAction(a!, room.code, 'get', { game })).toEqual(finished);
    const settlements = await database.db.execute(
      sql`select score from runtime.competition_results where player_id=${a!} and board='night-overwatch:points:night-records-v1'`,
    );
    expect(settlements.map((row) => Number(row.score))).toEqual([60]);
    delete ops.release!.builds[0]!.removed;
    ops.release!.builds[0]!.disabled = false;
    expect((await store.create(d!, game, { buildId: 'build-a', mode: 'friend' })).version).toBe(
      'duel-a',
    );
  });
  it.each(['disabled', 'removed', 'backend'] as const)(
    'skips waiting hosts closed by %s even when both builds use the same rules',
    async (kind) => {
      const f = releaseFixture(),
        gate = gateFixture();
      const suffix = randomUUID(),
        hostBuild = 'host-' + suffix,
        guestBuild = 'guest-' + suffix;
      const config = structuredClone(f.config);
      config.builds[0]!.buildId = hostBuild;
      config.builds[0]!.backendVersion = 'old-backend';
      config.builds.push({
        ...config.builds[0]!,
        buildId: guestBuild,
        backendVersion: 'new-backend',
      });
      gate.operations({ announcements: [], compensations: [], release: config });
      const store = createCompetitionStore(
        database.db,
        new Map([[game, f.current.multiplayer]]),
        Date.now,
        gate.control,
        false,
        new Map(),
        f.release,
      );
      const host = (await store.guestSession({ game })).playerId,
        guest = (await store.guestSession({ game })).playerId;
      const blockedRoom = await store.create(host, game, {
        buildId: hostBuild,
        mode: 'match',
        visibility: 'public',
      });
      if (kind === 'backend') config.disabledBackendVersions = ['old-backend'];
      else config.builds[0]![kind] = true;
      const next = await store.match(guest, game, guestBuild);
      expect(next.code).not.toBe(blockedRoom.code);
      expect(next.players).toHaveLength(1);
    },
  );
});
