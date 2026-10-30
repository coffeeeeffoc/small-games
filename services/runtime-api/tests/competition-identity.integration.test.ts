/* eslint-disable max-lines -- One real HTTP/PG fixture owns cleanup and deterministic transaction barriers. */
import { randomUUID } from 'node:crypto';
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
type Credential = {
  userId: string;
  playerId: string;
  token: string;
  refreshToken?: string;
  sessionId: string;
  game: string;
};
type ApiResponse = Credential & {
  code: string;
  error?: string;
  id: string;
  eligible: boolean;
  identityKind: 'guest' | 'platform';
  avatarUrl: string;
  nickname: string;
  region: { country?: string; province?: string } | null;
  players: unknown[];
  me: { userId: string; playerId: string; score: number; nickname: string } | null;
};
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
function barrier(point: 'before' | 'after', match: (text: string) => boolean, fault?: Error) {
  const reached = deferred(),
    released = deferred();
  return {
    point,
    match,
    taken: false,
    pid: 0,
    hit: reached.promise,
    release: released.resolve,
    async pause() {
      reached.resolve();
      await released.promise;
      if (fault) throw fault;
    },
  };
}
type Barrier = ReturnType<typeof barrier>;
/** Every SQL query and lock executes in PostgreSQL; barriers can fail before commit. */
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
                gate.pid = Number(
                  (
                    await (object as unknown as Database).execute(
                      sql`select pg_backend_pid() as pid`,
                    )
                  )[0]!.pid,
                );
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
  const engineName = '@coffeeeeffoc/place-and-clear/engine';
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
        openid: 'mock-official:' + endpoint.searchParams.get('js_code')?.split('~')[0],
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
            games: ['cops-robbers', 'three-choose-two', 'carding-car', 'night-overwatch'],
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
  const guest = (game = 'cops-robbers') =>
    request('/sessions/guest', undefined, { game }) as Promise<Credential>;
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
    base,
    database: database.db,
    store,
    ranked,
    gates,
    request,
    guest,
    appId,
    otherAppId,
    close,
  };
}

async function waitBlocked(
  f: Awaited<ReturnType<typeof setup>>,
  waiting: Barrier,
  holding: Barrier,
) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const rows = await f.database.execute(
      sql`select ${holding.pid}::int=any(pg_blocking_pids(${waiting.pid}::int)) as blocked`,
    );
    if (rows[0]!.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('PostgreSQL did not observe the expected blocking owner');
}
const refreshLock = (text: string) =>
  text.includes('join runtime.competition_refresh_tokens r') && text.includes('for no key update');
const logoutLock = (text: string) =>
  text.includes('join runtime.competition_sessions s') && text.includes('for no key update');
const resourceLock = (text: string) =>
  text.includes('select id from runtime.competition_players') && text.includes('for update');

integration(
  'real anonymous issuance scopes games, preserves profile privacy and rejects legacy tokens',
  async () =>
    fixture(async (f) => {
      const a = await f.guest('cops-robbers'),
        b = await f.guest();
      const same = await f.guest('xiangqi-five');
      expect(same.userId).not.toBe(a.userId);
      expect(same.sessionId).not.toBe(a.sessionId);
      await f.request('/games/cops-robbers', same, undefined, 403);
      const profile = await f.request('/me', a, {
        nickname: '玩家甲',
        avatarId: 'panda',
        region: { country: '中国' },
        source: 'user-authorized',
      });
      expect(profile.userId).toBe(a.userId);
      for (const patch of [
        { nickname: '<script>' },
        { avatarUrl: 'https://127.0.0.1/x' },
        { region: { city: 'precise' } },
        { userId: b.userId },
        { source: 'platform-verified' },
      ])
        await f.request('/me', a, patch, 422);
      const room = await f.request('/games/cops-robbers/rooms', a, {});
      await f.request(`/rooms/${room.code}`, b, undefined, 403);
      const joined = await f.request('/games/cops-robbers/rooms/join', b, { code: room.code });
      expect(joined.players[0]).toMatchObject({
        userId: a.userId,
        nickname: '玩家甲',
        avatarId: 'panda',
      });
      expect(JSON.stringify(joined)).not.toMatch(
        /password_hash|session_hash|family_id|token_hash|subject/,
      );
      await f.request('/sessions/guest', undefined, {}, 422);
      await f.request('/sessions/upgrade', a, {}, 404);
      await f.request('/sessions/refresh', a, {}, 422);
      await f.database.execute(
        sql`update runtime.competition_sessions set game='' where player_id=${a.userId}`,
      );
      await f.request('/me', a, undefined, 401);
      await f.request('/sessions/refresh', undefined, { refreshToken: a.refreshToken }, 401);
      await f.database.execute(
        sql`update runtime.competition_players set platform='invalid' where id=${b.userId}`,
      );
      await f.request('/me', b, undefined, 401);
    }),
  30000,
);

integration(
  'concurrent anonymous entry requests never merge identities',
  async () =>
    fixture(async (f) => {
      const [a, b] = await Promise.all([f.guest(), f.guest()]);
      expect(a.userId).not.toBe(b.userId);
      expect(a.sessionId).not.toBe(b.sessionId);
    }),
  30000,
);

integration.each(['refresh', 'logout'] as const)(
  'real player locks serialize %s first; late old access revokes only its family',
  async (firstOperation) =>
    fixture(async (f) => {
      const a = await f.guest('cops-robbers'),
        other = await f.guest('cops-robbers');
      const first = barrier('after', firstOperation === 'refresh' ? refreshLock : logoutLock);
      f.gates.push(first);
      const refresh = () =>
        f.request(
          '/sessions/refresh',
          undefined,
          { refreshToken: a.refreshToken },
          firstOperation === 'refresh' ? 200 : 401,
        );
      const logout = () => f.request('/sessions/logout', a, {});
      const left = firstOperation === 'refresh' ? refresh() : logout();
      await bounded(first.hit);
      const second = barrier('before', firstOperation === 'refresh' ? logoutLock : refreshLock);
      f.gates.push(second);
      const right = firstOperation === 'refresh' ? logout() : refresh();
      await bounded(second.hit);
      second.release();
      try {
        await waitBlocked(f, second, first);
      } finally {
        first.release();
      }
      const results = await Promise.all([left, right]);
      await f.request('/me', a, undefined, 401);
      if (firstOperation === 'refresh') {
        expect(results[0]!.sessionId).toBe(a.sessionId);
        await f.request('/me', results[0], undefined, 401);
        await f.request(
          '/sessions/refresh',
          undefined,
          { refreshToken: results[0]!.refreshToken },
          401,
        );
      }
      expect((await f.request('/me', other)).userId).toBe(other.userId);
      expect(
        (await f.request('/sessions/refresh', undefined, { refreshToken: other.refreshToken }))
          .sessionId,
      ).toBe(other.sessionId);
    }),
  30000,
);

integration(
  'single-use refresh is rechecked after an actual PostgreSQL owner lock wait',
  async () =>
    fixture(async (f) => {
      const a = await f.guest();
      const first = barrier('after', refreshLock);
      f.gates.push(first);
      const left = f.request('/sessions/refresh', undefined, { refreshToken: a.refreshToken });
      await bounded(first.hit);
      const second = barrier('before', refreshLock);
      f.gates.push(second);
      const right = f.request(
        '/sessions/refresh',
        undefined,
        { refreshToken: a.refreshToken },
        401,
      );
      await bounded(second.hit);
      second.release();
      try {
        await waitBlocked(f, second, first);
      } finally {
        first.release();
      }
      const next = await left;
      await right;
      expect(next.sessionId).toBe(a.sessionId);
      await f.request('/sessions/logout', a, {});
      await f.request('/me', next, undefined, 401);
    }),
  30000,
);

integration.each(['logout', 'create'] as const)(
  'resource authority rechecks revocation with %s winning the critical section',
  async (firstOperation) =>
    fixture(async (f) => {
      const a = await f.guest('three-choose-two');
      if (firstOperation === 'logout') {
        const first = barrier('before', resourceLock);
        f.gates.push(first);
        const creating = f.request('/three-choose-two/session', a, {}, 401);
        await bounded(first.hit);
        await f.request('/sessions/logout', a, {});
        first.release();
        await creating;
        const rows = await f.database.execute(
          sql`select count(*)::int as count from runtime.three_choose_two_sessions where player_id=${a.userId}`,
        );
        expect(rows[0]!.count).toBe(0);
      } else {
        const first = barrier('after', resourceLock);
        f.gates.push(first);
        const creating = f.request('/three-choose-two/session', a, {});
        await bounded(first.hit);
        const second = barrier('before', logoutLock);
        f.gates.push(second);
        const loggingOut = f.request('/sessions/logout', a, {});
        await bounded(second.hit);
        second.release();
        try {
          await waitBlocked(f, second, first);
        } finally {
          first.release();
        }
        expect((await creating).eligible).toBe(false);
        await loggingOut;
        await f.request('/three-choose-two/session', a, {}, 401);
      }
    }),
  30000,
);

integration(
  'internal kart replay uses durable game authorization without storing or requiring bearer tokens',
  async () =>
    fixture(async (f) => {
      const a = await f.guest('carding-car');
      const result = {
        matchId: randomUUID(),
        board: 'carding-car-seaside-v1',
        entries: [{ playerId: a.playerId, elapsedMs: 1500 }],
        startedAt: Date.now() - 2000,
        finishedAt: Date.now(),
      };
      await f.request('/sessions/logout', a, {});
      await f.store.kartResults(result);
      await f.database.execute(
        sql`delete from runtime.player_game_access where player_id=${a.playerId} and game='carding-car'`,
      );
      await expect(f.store.kartResults(result)).rejects.toMatchObject({
        code: 'IDENTITY_SCOPE_MISMATCH',
      });
      await expect(f.store.kartResults({ ...result, matchId: randomUUID() })).rejects.toMatchObject(
        { code: 'IDENTITY_SCOPE_MISMATCH' },
      );
    }),
  30000,
);
integration(
  'verified Night TapTap binding preserves the guest ID/profile and restores it across fresh sessions',
  async () => {
    await fixture(async (f) => {
      const guest = await f.guest('night-overwatch');
      await f.request('/me', guest, { nickname: '原来的飞行员' });
      await f.database
        .execute(sql`insert into runtime.competition_best(board,player_id,score,secondary,match_id,updated_at)
        values('night-overwatch:points:night-records-v1',${guest.playerId},360,0,${randomUUID()},${Date.now()})`);
      const input = {
        platform: 'taptap',
        appId: f.appId,
        game: 'night-overwatch',
        code: 'stable-tap-account~first-use',
      };
      const bound = await f.request('/sessions/platform', guest, input);
      expect(bound.playerId).toBe(guest.playerId);
      expect(bound.identityKind).toBe('platform');
      expect((await f.request('/me', bound)).nickname).toBe('原来的飞行员');
      await f.request('/me', guest, undefined, 401);
      const fresh = await f.request('/sessions/platform', undefined, {
        ...input,
        code: 'stable-tap-account~second-use',
      });
      expect(fresh.playerId).toBe(bound.playerId);
      const scores = await f.database.execute(
        sql`select score from runtime.competition_best where board='night-overwatch:points:night-records-v1' and player_id=${fresh.playerId}`,
      );
      expect(Number(scores[0]!.score)).toBe(360);
      const another = await f.guest('night-overwatch');
      await f.database
        .execute(sql`insert into runtime.competition_best(board,player_id,score,secondary,match_id,updated_at)
        values('night-overwatch:points:night-records-v1',${another.playerId},920,0,${randomUUID()},${Date.now()})`);
      expect((await f.request('/sessions/platform', another, input)).playerId).toBe(bound.playerId);
      expect((await f.request('/me', another)).identityKind).toBe('guest');
      const preserved = await f.database
        .execute(sql`select player_id,score from runtime.competition_best
        where board='night-overwatch:points:night-records-v1' and player_id in (${bound.playerId},${another.playerId})`);
      expect(
        Object.fromEntries(preserved.map((row) => [String(row.player_id), Number(row.score)])),
      ).toEqual({
        [bound.playerId]: 360,
        [another.playerId]: 920,
      });
      const otherGame = await f.guest();
      await f.request('/sessions/platform', otherGame, { ...input, code: 'different-owner' }, 403);
      await f.request('/sessions/platform', bound, { ...input, appId: 'unconfigured' }, 503);
      expect((await f.request('/me', bound)).playerId).toBe(bound.playerId);
    });
  },
);

integration.each([
  ['guest adoption', 'update runtime.competition_players'],
  ['old session revocation', 'delete from runtime.competition_sessions'],
  ['game access grant', 'insert into runtime.player_game_access'],
  ['new access session', 'insert into runtime.competition_sessions'],
  ['new refresh token', 'insert into runtime.competition_refresh_tokens'],
])(
  'Night binding rolls back after %s and can be retried',
  async (_boundary, statement) => {
    await fixture(async (f) => {
      const guest = await f.guest('night-overwatch');
      await f.request('/me', guest, { nickname: '回滚飞行员', avatarId: 'panda' });
      await f.database
        .execute(sql`insert into runtime.competition_best(board,player_id,score,secondary,match_id,updated_at)
      values('night-overwatch:points:night-records-v1',${guest.playerId},360,0,${randomUUID()},${Date.now()})`);
      const savedState = async () => {
        const result: Record<string, unknown> = {
          player: [
            ...(await f.database.execute(
              sql`select * from runtime.competition_players where id=${guest.playerId}`,
            )),
          ],
        };
        for (const table of [
          'competition_best',
          'player_game_access',
          'competition_sessions',
          'competition_refresh_tokens',
        ])
          result[table] = [
            ...(await f.database.execute(
              sql`select * from ${sql.identifier('runtime')}.${sql.identifier(table)} where player_id=${guest.playerId}`,
            )),
          ];
        return result;
      };
      const before = await savedState();
      const gate = barrier(
        'after',
        (text) => text.startsWith(statement),
        Error('injected binding failure'),
      );
      f.gates.push(gate);
      const input = {
        platform: 'taptap',
        appId: f.appId,
        game: 'night-overwatch',
        code: 'rollback-account',
      };
      const pending = f.request('/sessions/platform', guest, input, 503);
      await bounded(gate.hit);
      gate.release();
      expect((await pending).error).toBe('SERVICE_UNAVAILABLE');
      expect(gate.taken).toBe(true);
      expect(await savedState()).toEqual(before);
      expect(
        await f.database.execute(sql`select id from runtime.competition_players
      where platform='taptap' and app_id=${f.appId} and subject='mock-official:rollback-account'`),
      ).toHaveLength(0);
      expect(await f.request('/me', guest)).toMatchObject({
        playerId: guest.playerId,
        identityKind: 'guest',
        nickname: '回滚飞行员',
      });
      const refreshed = await f.request('/sessions/refresh', undefined, {
        refreshToken: guest.refreshToken,
      });
      const bound = await f.request('/sessions/platform', refreshed, input);
      expect(bound).toMatchObject({ playerId: guest.playerId, identityKind: 'platform' });
      expect(await f.request('/me', bound)).toMatchObject({ nickname: '回滚飞行员' });
      await f.request('/me', guest, undefined, 401);
      await f.request('/me', refreshed, undefined, 401);
      await f.request(
        '/sessions/refresh',
        undefined,
        { refreshToken: refreshed.refreshToken },
        401,
      );
      const after = await savedState();
      expect(after.competition_best).toEqual(before.competition_best);
      expect(after.player_game_access).toEqual(before.player_game_access);
      expect(after.competition_sessions).toHaveLength(1);
      expect(after.competition_refresh_tokens).toHaveLength(1);
      expect(
        (await f.request('/sessions/refresh', undefined, { refreshToken: bound.refreshToken }))
          .playerId,
      ).toBe(guest.playerId);
    });
  },
  30000,
);

integration(
  'concurrent Night bindings share one official player and cannot rebind a platform owner',
  async () => {
    await fixture(async (f) => {
      const a = await f.guest('night-overwatch'),
        b = await f.guest('night-overwatch');
      const input = {
        platform: 'taptap',
        appId: f.appId,
        game: 'night-overwatch',
        code: 'concurrent-account',
      };
      const [x, y] = await Promise.all([
        f.request('/sessions/platform', a, { ...input, code: input.code + '~a' }),
        f.request('/sessions/platform', b, { ...input, code: input.code + '~b' }),
      ]);
      expect(x.playerId).toBe(y.playerId);
      expect([a.playerId, b.playerId]).toContain(x.playerId);
      await f.request('/sessions/platform', x, { ...input, code: 'other-account' }, 403);
      const adopted = x.playerId === a.playerId ? a : b;
      await f.request('/sessions/refresh', undefined, { refreshToken: adopted.refreshToken }, 401);
      expect(
        (await f.request('/sessions/refresh', undefined, { refreshToken: x.refreshToken }))
          .playerId,
      ).toBe(x.playerId);
    });
  },
);

integration('one Night guest cannot bind to two different Tap accounts concurrently', async () => {
  await fixture(async (f) => {
    const guest = await f.guest('night-overwatch');
    const responses = await Promise.all(
      ['tap-owner-one', 'tap-owner-two'].map((code) =>
        realFetch(f.base + '/sessions/platform', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${guest.token}` },
          body: JSON.stringify({
            platform: 'taptap',
            appId: f.appId,
            game: 'night-overwatch',
            code,
          }),
        }),
      ),
    );
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => [401, 403].includes(response.status))).toHaveLength(1);
    const winner = (await responses
      .find((response) => response.status === 200)!
      .json()) as ApiResponse;
    expect(winner.playerId).toBe(guest.playerId);
    const rows = await f.database.execute(sql`select id,subject from runtime.competition_players
      where platform='taptap' and app_id=${f.appId} and subject in ('mock-official:tap-owner-one','mock-official:tap-owner-two')`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(guest.playerId);
    expect((await f.request('/me', winner)).identityKind).toBe('platform');
  });
});
