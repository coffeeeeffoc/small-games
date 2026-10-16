/* eslint-disable max-lines -- One real HTTP/PG fixture owns cleanup and deterministic transaction barriers. */
import { createHash, randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { openDatabase } from '@coffeeeeffoc/service-kit';
import { expect, it, vi } from 'vitest';
import { createCompetitionStore } from '../src/competition/store.js';
import { createRankedStore } from '../src/competition/ranked-store.js';
import { registerCompetition } from '../src/competition/routes.js';
import { createThreeChooseTwoStore } from '../src/three-choose-two/store.js';
import type { Engine } from '../src/three-choose-two/types.js';
import type { Rule } from '../src/competition/types.js';

const databaseUrl = process.env.COMPETITION_TEST_DATABASE_URL;
const integration = databaseUrl ? it : it.skip;
const realFetch = globalThis.fetch;
type Database = Parameters<typeof createCompetitionStore>[0];
type Credential = { userId: string; playerId: string; token: string; refreshToken?: string };
type ApiResponse = Credential & {
  code: string;
  error?: string;
  id: string;
  eligible: boolean;
  identityKind: 'guest' | 'platform';
  avatarUrl: string;
  region: { country?: string; province?: string } | null;
  players: unknown[];
  me: { userId: string; playerId: string; score: number; nickname: string } | null;
};
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
async function bounded<T>(pending: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Transaction barrier was not reached')), 5000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function barrier(point: 'before' | 'after', match: (text: string) => boolean) {
  const reached = deferred(),
    released = deferred();
  return {
    point,
    match,
    taken: false,
    hit: reached.promise,
    release: released.resolve,
    async pause() {
      reached.resolve();
      await released.promise;
    },
  };
}
type Barrier = ReturnType<typeof barrier>;
/** Only scheduling is intercepted: every SQL query and lock still executes in PostgreSQL. */
function controlledDatabase(database: Database, barriers: Barrier[]): Database {
  const wrap = <T extends object>(target: T): T =>
    new Proxy(target, {
      get(object, key) {
        if (key === 'transaction')
          return (work: (tx: Database) => unknown) =>
            database.transaction((tx) => work(wrap(tx) as unknown as Database) as never);
        if (key === 'execute')
          return async (query: Parameters<Database['execute']>[0]) => {
            const text = new PgDialect().sqlToQuery(query as never).sql;
            const pause = async (point: Barrier['point']) => {
              const gate = barriers.find(
                (item) => !item.taken && item.point === point && item.match(text),
              );
              if (gate) {
                gate.taken = true;
                await gate.pause();
              }
            };
            await pause('before');
            const result = await (object as unknown as Database).execute(query);
            await pause('after');
            return result;
          };
        const value = Reflect.get(object, key, object);
        return typeof value === 'function' ? value.bind(object) : value;
      },
    });
  return wrap(database);
}
async function fixture(run: (value: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
  if (!databaseUrl || new URL(databaseUrl).pathname !== '/competition_test')
    throw new Error('Use isolated competition_test, never a production database');
  const value = await setup(databaseUrl);
  try {
    await run(value);
  } finally {
    await value.close();
  }
}
async function setup(url: string) {
  const database = openDatabase(url, 'runtime'),
    gates: Barrier[] = [],
    identities = new Set<string>(),
    rooms = new Set<string>(),
    pending = new Set<Promise<unknown>>();
  const appId = 'identity-test-' + randomUUID(),
    otherAppId = appId + '-other';
  const db = controlledDatabase(database.db, gates);
  const rules = new Map<string, Rule>();
  for (const name of ['cops', 'realtime', 'chess']) {
    const module = (await import(new URL(`../rules/${name}.mjs`, import.meta.url).href)) as {
      default: Rule;
    };
    rules.set(module.default.id, module.default);
  }
  const store = createCompetitionStore(db, rules);
  const engineName = '@coffeeeeffoc/three-choose-two/engine';
  const engine = (await import(engineName)) as Engine;
  const ranked = createThreeChooseTwoStore(db, engine);
  const mockOfficial = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const endpoint = new URL(String(input));
    expect(['api.weixin.qq.com', 'miniapp.bilibili.com', 'cloud-miniapp.tapapis.cn']).toContain(
      endpoint.hostname,
    );
    // Explicit official-exchange fixture only. This never authenticates against a real SDK/account.
    return new Response(
      JSON.stringify({
        openid: 'mock-official:' + endpoint.searchParams.get('js_code'),
        session_key: 'mock-private-session-key',
      }),
    );
  });
  const app = Fastify();
  await registerCompetition(
    app,
    store,
    {
      COMPETITION_PLATFORM_CONFIG: JSON.stringify(
        ['taptap', 'wechat'].flatMap((platform) =>
          [appId, otherAppId].map((configuredAppId) => ({
            platform,
            appId: configuredAppId,
            secret: 'explicit-test-fixture-secret',
          })),
        ),
      ),
    },
    ranked,
    undefined,
    createRankedStore(db, new Map(), store.identityDetails),
  );
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test HTTP address');
  const base = `http://127.0.0.1:${address.port}/api/competition/v1`;
  function request(path: string, credential?: Credential, body?: unknown, status = 200) {
    const operation = (async () => {
      const response = await realFetch(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'content-type': 'application/json',
          ...(credential ? { authorization: `Bearer ${credential.token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      expect(response.status, path).toBe(status);
      const data = (await response.json()) as ApiResponse;
      if (data.userId && data.playerId === data.userId) identities.add(data.userId);
      if (data.code && !data.error) rooms.add(data.code);
      return data;
    })();
    pending.add(operation);
    operation.then(
      () => pending.delete(operation),
      () => pending.delete(operation),
    );
    return operation;
  }
  const guest = (installationId = randomUUID()) =>
    request('/sessions/guest', undefined, {
      installationId,
      identityVersion: 2,
    }) as Promise<Credential>;
  const upgrade = (credential: Credential, code: string = randomUUID()) =>
    request('/sessions/upgrade', credential, { platform: 'wechat', appId, code });
  async function close() {
    for (const gate of gates) gate.release();
    await Promise.allSettled([...pending]);
    await app.close();
    mockOfficial.mockRestore();
    if (rooms.size) {
      const codes = sql.join(
        [...rooms].map((code) => sql`${code}`),
        sql`,`,
      );
      await database.db.execute(
        sql`delete from runtime.competition_actions where room_code in (${codes})`,
      );
      await database.db.execute(
        sql`delete from runtime.competition_rooms where code in (${codes})`,
      );
    }
    if (identities.size) {
      const ids = sql.join(
        [...identities].map((id) => sql`${id}::uuid`),
        sql`,`,
      );
      for (const table of ['three_choose_two_best', 'three_choose_two_results'])
        await database.db.execute(
          sql`delete from ${sql.identifier('runtime')}.${sql.identifier(table)} where player_id in (${ids})`,
        );
      await database.db.execute(
        sql`delete from runtime.three_choose_two_actions where session_id in (select id from runtime.three_choose_two_sessions where player_id in (${ids}))`,
      );
      for (const table of [
        'three_choose_two_sessions',
        'competition_best',
        'competition_results',
        'competition_refresh_tokens',
        'competition_sessions',
      ])
        await database.db.execute(
          sql`delete from ${sql.identifier('runtime')}.${sql.identifier(table)} where player_id in (${ids})`,
        );
      await database.db.execute(sql`delete from runtime.competition_players where id in (${ids})`);
    }
    await database.close();
  }
  return {
    database: database.db,
    store,
    ranked,
    gates,
    request,
    guest,
    upgrade,
    appId,
    otherAppId,
    close,
  };
}

integration(
  'real HTTP/PG preserves scoped identities, legacy renewal, safe profiles, privacy and upgrade history',
  async () =>
    fixture(async (f) => {
      const installationId = randomUUID(),
        a = await f.guest(installationId),
        b = await f.guest(installationId);
      expect(a.userId).not.toBe(b.userId);
      // A valid pre-013 bearer had no refresh row; renewing must retain its original UUID.
      await f.database.execute(
        sql`delete from runtime.competition_refresh_tokens where player_id=${a.userId}`,
      );
      const renewed = await f.request('/sessions/refresh', a, {});
      const refreshed = await f.request('/sessions/refresh', undefined, {
        refreshToken: renewed.refreshToken,
      });
      expect(renewed.userId).toBe(a.userId);
      expect(refreshed.userId).toBe(a.userId);
      const profile = await f.request('/me', a, {
        nickname: '身份玩家甲',
        avatarUrl: 'https://img.tapimg.net/test.png',
        region: { country: '中国', province: '广东' },
        source: 'user-authorized',
      });
      expect(profile).toMatchObject({
        userId: a.userId,
        nickname: '身份玩家甲',
        profileSource: 'user-authorized',
        region: { country: '中国', province: '广东' },
      });
      for (const patch of [
        { nickname: '<script>' },
        { avatarUrl: 'https://127.0.0.1/x' },
        { region: { city: '精确城市' } },
        { nickname: '冒用玩家', userId: b.userId },
        { nickname: '伪造来源', source: 'platform-verified' },
      ])
        await f.request('/me', a, patch, 422);
      await f.request('/sessions/guest', undefined, { userId: a.userId }, 422);
      await f.request(
        '/sessions/platform',
        undefined,
        { platform: 'wechat', appId: f.appId, code: 'scope', platformId: 'victim' },
        422,
      );
      await f.request(
        '/sessions/platform',
        undefined,
        { platform: 'wechat', appId: 'not-configured', code: 'scope' },
        503,
      );
      const native = await f.request('/sessions/platform', undefined, {
        platform: 'wechat',
        appId: f.appId,
        code: 'scope',
      });
      const same = await f.request('/sessions/platform', undefined, {
        platform: 'wechat',
        appId: f.appId,
        code: 'scope',
      });
      const otherApp = await f.request('/sessions/platform', undefined, {
        platform: 'wechat',
        appId: f.otherAppId,
        code: 'scope',
      });
      const otherProvider = await f.request('/sessions/platform', undefined, {
        platform: 'taptap',
        appId: f.appId,
        code: 'scope',
      });
      expect(same.userId).toBe(native.userId);
      expect(otherApp.userId).not.toBe(native.userId);
      expect(otherProvider.userId).not.toBe(native.userId);
      for (const game of ['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five']) {
        const room = await f.request(`/games/${game}/rooms`, a, {});
        const joined = await f.request(`/games/${game}/rooms/join`, b, { code: room.code });
        expect(joined.players[0]).toMatchObject({
          userId: a.userId,
          nickname: '身份玩家甲',
          avatarUrl: profile.avatarUrl,
          region: profile.region,
        });
        expect(joined.players[1]).toMatchObject({ userId: b.userId, avatarUrl: '', region: null });
        expect(JSON.stringify(joined)).not.toMatch(
          /mock-official|app_id|session_key|subject|token_hash/,
        );
      }
      const board = 'cops-robbers:' + f.store.ruleFor('cops-robbers').version;
      // Isolated score fixture proves migration/upgrade preservation; it is never a production result.
      await f.database.execute(
        sql`insert into runtime.competition_best values(${board},${a.userId},42,0,${'identity-fixture:' + randomUUID()},${Date.now()})`,
      );
      const upgraded = await f.upgrade(a);
      expect(upgraded).toMatchObject({
        userId: a.userId,
        identityKind: 'platform',
        provider: 'wechat',
      });
      for (const old of [a, renewed, refreshed]) await f.request('/me', old, undefined, 401);
      for (const refreshToken of [a.refreshToken, renewed.refreshToken])
        await f.request('/sessions/refresh', undefined, { refreshToken }, 401);
      const ranking = await f.request('/games/cops-robbers/leaderboards/versus', upgraded);
      expect(ranking.me).toMatchObject({
        userId: a.userId,
        playerId: a.userId,
        score: 42,
        nickname: '身份玩家甲',
      });
      expect(JSON.stringify(ranking)).not.toMatch(
        /mock-official|app_id|session_key|subject|token_hash/,
      );
      await f.request(
        '/sessions/upgrade',
        b,
        { platform: 'wechat', appId: f.appId, code: 'scope' },
        409,
      );
      expect((await f.request('/me', b)).identityKind).toBe('guest');
      expect(
        (await f.request('/sessions/refresh', undefined, { refreshToken: b.refreshToken })).userId,
      ).toBe(b.userId);
      await f.request(
        '/sessions/upgrade',
        upgraded,
        { platform: 'taptap', appId: f.appId, code: 'cross-platform' },
        409,
      );
    }),
  30_000,
);

integration(
  'two real guest transactions targeting one scoped platform subject cannot merge or overwrite either account',
  async () =>
    fixture(async (f) => {
      const a = await f.guest(),
        b = await f.guest();
      const first = barrier(
        'after',
        (text) =>
          text.includes('join runtime.competition_sessions s') && text.includes('for update of p'),
      );
      f.gates.push(first);
      const aUpgrade = f.upgrade(a, 'same-subject');
      await bounded(first.hit);
      const second = barrier('before', (text) => text.includes('pg_advisory_xact_lock'));
      f.gates.push(second);
      const bUpgrade = f.request(
        '/sessions/upgrade',
        b,
        { platform: 'wechat', appId: f.appId, code: 'same-subject' },
        409,
      );
      await bounded(second.hit);
      second.release();
      first.release();
      expect((await aUpgrade).userId).toBe(a.userId);
      await bUpgrade;
      expect((await f.request('/me', b)).identityKind).toBe('guest');
      expect(
        (await f.request('/sessions/refresh', undefined, { refreshToken: b.refreshToken })).userId,
      ).toBe(b.userId);
    }),
  30_000,
);

integration.each(['refresh', 'upgrade'] as const)(
  'real player locks serialize %s first against the competing operation',
  async (firstOperation) =>
    fixture(async (f) => {
      const guest = await f.guest();
      const refreshQuery = (text: string) =>
        text.includes('join runtime.competition_refresh_tokens r') &&
        text.includes('for update of p');
      const upgradeQuery = (text: string) =>
        text.includes('join runtime.competition_sessions s') && text.includes('for update of p');
      const first = barrier('after', firstOperation === 'refresh' ? refreshQuery : upgradeQuery);
      f.gates.push(first);
      const refresh = () =>
        f.request(
          '/sessions/refresh',
          undefined,
          { refreshToken: guest.refreshToken },
          firstOperation === 'refresh' ? 200 : 401,
        );
      const a = firstOperation === 'refresh' ? refresh() : f.upgrade(guest);
      await bounded(first.hit);
      const second = barrier('before', firstOperation === 'refresh' ? upgradeQuery : refreshQuery);
      f.gates.push(second);
      const b = firstOperation === 'refresh' ? f.upgrade(guest) : refresh();
      await bounded(second.hit);
      second.release();
      first.release();
      const [left, right] = await Promise.all([a, b]);
      const upgraded = firstOperation === 'refresh' ? right : left;
      expect(upgraded.userId).toBe(guest.userId);
      if (firstOperation === 'refresh') await f.request('/me', left, undefined, 401);
      await f.request('/me', guest, undefined, 401);
      await f.request('/sessions/refresh', undefined, { refreshToken: guest.refreshToken }, 401);
    }),
  30_000,
);

integration.each(['upgrade', 'create'] as const)(
  'three-choose-two rejects revoked guest authority with %s winning the critical section',
  async (firstOperation) =>
    fixture(async (f) => {
      const guest = await f.guest();
      if (firstOperation === 'upgrade') {
        const checked = deferred(),
          proceed = deferred();
        const identity = f.store.identity;
        let intercepted = false;
        f.store.identity = async (token) => {
          const owner = await identity(token);
          if (!intercepted && digest(token) === digest(guest.token)) {
            intercepted = true;
            checked.resolve();
            await proceed.promise;
          }
          return owner;
        };
        const create = f.request('/three-choose-two/session', guest, {}, 401);
        try {
          await bounded(checked.promise);
          const upgraded = await f.upgrade(guest);
          proceed.resolve();
          await create;
          const rows = await f.database.execute(
            sql`select count(*)::int as count from runtime.three_choose_two_sessions where player_id=${guest.userId}`,
          );
          expect(rows[0]!.count).toBe(0);
          expect((await f.request('/three-choose-two/session', upgraded, {})).eligible).toBe(true);
        } finally {
          proceed.resolve();
          f.store.identity = identity;
        }
      } else {
        const locked = barrier(
          'after',
          (text) =>
            text.includes('select id from runtime.competition_players') &&
            text.includes('for update'),
        );
        f.gates.push(locked);
        const create = f.request('/three-choose-two/session', guest, {});
        await bounded(locked.hit);
        const waiting = barrier(
          'before',
          (text) =>
            text.includes('join runtime.competition_sessions s') &&
            text.includes('for update of p'),
        );
        f.gates.push(waiting);
        const upgrade = f.upgrade(guest);
        await bounded(waiting.hit);
        waiting.release();
        locked.release();
        const session = await create,
          upgraded = await upgrade;
        expect(session.eligible).toBe(false);
        expect(
          (await f.request(`/three-choose-two/session/${session.id}`, upgraded)).eligible,
        ).toBe(false);
        await f.request('/three-choose-two/session', guest, {}, 401);
      }
    }),
  30_000,
);
