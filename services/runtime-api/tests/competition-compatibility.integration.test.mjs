import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import Fastify from 'fastify';
import { sql } from 'drizzle-orm';
import { openDatabase } from '@coffeeeeffoc/service-kit';
import { expect, it } from 'vitest';
import { registerCompetition } from '../src/competition/routes.js';
import { createCompetitionStore } from '../src/competition/store.js';
import { pinnedRuntime } from './competition-compatibility-fixture.mjs';

const url = process.env.COMPETITION_TEST_DATABASE_URL;
const integration = url ? it : it.skip;

integration(
  'fixed old Runtime INSERT/read/write and candidate HTTP retain ownership on expanded PG schema',
  async () => {
    if (new URL(url).pathname !== '/competition_test')
      throw new Error('Only competition_test is permitted');
    const pinned = await pinnedRuntime();
    const database = openDatabase(url, 'runtime'),
      ids = new Set(),
      rooms = new Set(),
      matches = new Set(),
      apps = [];
    const rule = {
      id: 'xiangqi-five',
      version: `compat-${randomUUID()}`,
      title: 'Compatibility fixture',
      description: 'Isolated SQL compatibility fixture, not a natural game',
      durationMs: 60000,
      initial: () => ({}),
      view: () => ({}),
      action: (state) => state,
      result: () => ({ finished: false, eligible: false, score: 0, secondary: 0 }),
    };
    const stores = [
      pinned.store.createCompetitionStore(database.db, new Map([[rule.id, rule]])),
      createCompetitionStore(database.db, new Map([[rule.id, rule]])),
    ];
    const realFetch = globalThis.fetch;
    try {
      const columns = await database.db.execute(
        sql`select column_name from information_schema.columns where table_schema='runtime' and table_name='competition_players'`,
      );
      expect(columns.some((row) => row.column_name === 'profile')).toBe(true);
      const bases = [];
      for (const [index, store] of stores.entries()) {
        const app = Fastify();
        apps.push(app);
        await (index === 0 ? pinned.routes.registerCompetition : registerCompetition)(
          app,
          store,
          {},
        );
        await app.listen({ host: '127.0.0.1', port: 0 });
        bases.push(`http://127.0.0.1:${app.server.address().port}/api/competition/v1`);
      }
      async function request(index, path, credential, body, status = 200) {
        const response = await realFetch(bases[index] + path, {
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            'content-type': 'application/json',
            ...(credential ? { authorization: `Bearer ${credential.token}` } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        expect(response.status, path).toBe(status);
        const result = await response.json();
        if (result.token && result.playerId) ids.add(result.playerId);
        if (result.code && !result.error) rooms.add(result.code);
        return result;
      }
      const candidateClient = await readFile(
        new URL('../../../platforms/competition/client.js', import.meta.url),
        'utf8',
      );
      for (const [service, base] of bases.entries()) {
        for (const [consumer, source] of [
          ['old', pinned.client],
          ['candidate', candidateClient],
        ]) {
          const storage = new Map();
          const context = {
            URL,
            Date,
            setTimeout,
            clearTimeout,
            AbortSignal,
            location: new URL(`${base}/compat-player`),
            localStorage: {
              getItem: (key) => storage.get(key),
              setItem: (key, value) => storage.set(key, value),
            },
            fetch: async (target, init) => {
              const response = await realFetch(target, init);
              const body = await response.clone().json();
              if (body.token && body.playerId) ids.add(body.playerId);
              if (body.code && !body.error) rooms.add(body.code);
              return response;
            },
          };
          runInNewContext(source, context);
          context.__installCompetition({ game: rule.id, platform: 'h5', apiUrl: base });
          const api = context.__competition;
          if (service === 1 || consumer === 'candidate') {
            await expect(api.session()).rejects.toBeDefined();
            continue;
          }
          const credential = await api.session();
          expect(credential.playerId, `${consumer} H5 × service ${service}`).toMatch(
            /^[a-f0-9-]{36}$/,
          );
          expect((await api.request('/me')).playerId).toBe(credential.playerId);
          expect(
            (await api.request('/me', { body: JSON.stringify({ name: '兼容玩家' }) })).name,
          ).toBe('兼容玩家');
          const board = await api.request(`/boards/${rule.id}`);
          expect(Array.isArray(board.top)).toBe(true);
          expect(typeof board.eligiblePlayers).toBe('number');
          for (const key of ['me', 'previous', 'threshold', 'gap'])
            expect(Object.hasOwn(board, key)).toBe(true);
          const room = await api.request('/rooms', { body: JSON.stringify({ game: rule.id }) });
          expect(room.players[0].id).toBe(credential.playerId);
          expect((await api.request(`/rooms/${room.code}`)).players[0].id).toBe(
            credential.playerId,
          );
          expect((await api.session()).playerId).toBe(credential.playerId);
        }
      }
      // Old store performs its actual pre-013 column-list INSERT; no fixture replacement SQL.
      const old = await request(0, '/sessions/guest', null, {});
      const modern = await request(1, '/sessions/guest', null, { game: rule.id });
      expect(old.playerId).not.toBe(modern.playerId);
      for (const credential of [old, modern])
        for (const index of [0, 1]) {
          if (index === 1 && credential === old) {
            await request(index, '/me', old, undefined, 401);
            await request(index, '/sessions/refresh', old, {}, 422);
            continue;
          }
          const mine = await request(index, '/me', credential);
          expect(mine.playerId).toBe(credential.playerId);
          const renamed = await request(index, '/me', credential, { name: '兼容玩家' });
          expect(renamed.playerId).toBe(credential.playerId);
          expect(renamed.name).toBe('兼容玩家');
          const room = await request(index, '/rooms', credential, { game: rule.id });
          expect(room.players[0].id).toBe(credential.playerId);
          if (index === 0 && credential === old) {
            await request(1, `/rooms/${room.code}`, old, undefined, 401);
          } else {
            expect(
              (await request(1 - index, `/rooms/${room.code}`, credential)).players[0].id,
            ).toBe(credential.playerId);
          }
          const other = credential === old ? modern : old;
          const deniedStatus = 1 - index === 1 && other === old ? 401 : 403;
          await request(1 - index, `/rooms/${room.code}`, other, undefined, deniedStatus);
        }
      const matchId = `compat-${randomUUID()}`;
      matches.add(matchId);
      const finishedAt = Date.now(),
        startedAt = finishedAt - 2000;
      await stores[0].kartResults({
        matchId,
        board: 'carding-car-seaside-v1',
        entries: [{ playerId: old.playerId, elapsedMs: 1500 }],
        startedAt,
        finishedAt,
      });
      for (const store of stores) {
        const mine = await store.board('carding-car', old.playerId);
        expect(mine.me.playerId).toBe(old.playerId);
        expect(Number(mine.me.score)).toBe(-1500);
        expect((await store.board('carding-car', modern.playerId)).me).toBe(null);
      }
    } finally {
      await Promise.all(apps.map((app) => app.close()));
      for (const code of rooms) {
        await database.db.execute(
          sql`delete from runtime.competition_actions where room_code=${code}`,
        );
        await database.db.execute(sql`delete from runtime.competition_rooms where code=${code}`);
      }
      for (const id of ids) {
        for (const table of [
          'competition_best',
          'competition_results',
          'competition_refresh_tokens',
          'competition_sessions',
        ])
          await database.db.execute(
            sql`delete from ${sql.identifier('runtime')}.${sql.identifier(table)} where player_id=${id}::uuid`,
          );
        await database.db.execute(
          sql`delete from runtime.competition_players where id=${id}::uuid`,
        );
      }
      for (const match of matches)
        await database.db.execute(sql`delete from runtime.competition_matches where id=${match}`);
      await database.close();
    }
  },
  30000,
);
