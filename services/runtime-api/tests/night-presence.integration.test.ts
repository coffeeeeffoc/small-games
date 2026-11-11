import Fastify from 'fastify';
import { openDatabase } from '@coffeeeeffoc/service-kit';
import { sql } from 'drizzle-orm';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createCompetitionStore } from '../src/competition/store.js';
import { createRankedStore } from '../src/competition/ranked-store.js';
import { registerCompetition } from '../src/competition/routes.js';
import type { Rule } from '../src/competition/types.js';

const url = process.env.COMPETITION_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'Night presence with real PostgreSQL and two HTTP instances',
  () => {
    let db: ReturnType<typeof openDatabase>, store: ReturnType<typeof createCompetitionStore>;
    const apps: ReturnType<typeof Fastify>[] = [];
    let at = Date.now();
    beforeAll(async () => {
      if (!url || new URL(url).pathname !== '/competition_test')
        throw Error('Use isolated competition_test');
      db = openDatabase(url, 'runtime');
      await db.db.execute(sql`delete from runtime.night_presence`);
      const rule = (await import(new URL('../rules/night.mjs', import.meta.url).href))
        .default as Rule;
      for (let i = 0; i < 2; i++) {
        store = createCompetitionStore(db.db, new Map([[rule.id, rule]]), () => at);
        const app = Fastify();
        apps.push(app);
        await registerCompetition(
          app,
          store,
          {},
          undefined,
          undefined,
          createRankedStore(db.db, new Map(), store.identityDetails, () => at),
        );
      }
    });
    afterAll(async () => {
      for (const app of apps) await app.close();
      await db?.close();
    });
    const beat = (index: number, token?: string, payload = {}) =>
      apps[index]!.inject({
        method: 'POST',
        url: '/api/competition/v1/games/night-overwatch/presence',
        payload,
        headers: token ? { authorization: 'Bearer ' + token } : {},
      });
    it('authenticates, deduplicates across instances, expires and cleans leases without changing accounts', async () => {
      const a = await store.guestSession({ game: 'night-overwatch' }),
        b = await store.guestSession({ game: 'night-overwatch' });
      const other = await store.guestSession({ game: 'wulong-city' });
      expect((await beat(0)).statusCode).toBe(401);
      expect((await beat(0, other.token)).statusCode).toBe(403);
      expect((await beat(0, a.token, { playerId: b.playerId })).statusCode).toBe(422);
      expect((await beat(0, a.token)).json()).toMatchObject({
        onlineCount: 1,
        players: [{ playerId: a.playerId }],
      });
      expect((await beat(1, a.token)).json()).toMatchObject({ onlineCount: 1 });
      const both = (await beat(1, b.token)).json();
      expect(both.onlineCount).toBe(2);
      expect(both.players.map((p: { playerId: string }) => p.playerId).sort()).toEqual(
        [a.playerId, b.playerId].sort(),
      );
      expect(Object.keys(both.players[0]).sort()).toEqual([
        'nickname',
        'online',
        'playerId',
        'status',
      ]);
      at += 19999;
      expect((await beat(0, a.token)).json()).toMatchObject({ onlineCount: 2 });
      at++;
      expect((await beat(1, a.token)).json()).toMatchObject({
        onlineCount: 1,
        players: [{ playerId: a.playerId }],
      });
      await store.sweepRooms();
      expect(
        (await db.db.execute(sql`select count(*)::int as n from runtime.night_presence`))[0]!.n,
      ).toBe(1);
      expect((await beat(0, b.token)).json()).toMatchObject({ onlineCount: 2 });
      at += 20000;
      await store.sweepRooms();
      expect(
        (await db.db.execute(sql`select count(*)::int as n from runtime.night_presence`))[0]!.n,
      ).toBe(0);
      expect((await beat(1, a.token)).json()).toMatchObject({ onlineCount: 1 });
    });
    it('paginates the complete roster without duplicates or leaking credentials', async () => {
      at += 20000;
      const people = [];
      for (let i = 0; i < 53; i++) {
        const p = await store.guestSession({ game: 'night-overwatch' });
        people.push(p);
        await beat(i % 2, p.token);
      }
      const first = (await beat(0, people[0]!.token)).json();
      expect(first.onlineCount).toBe(53);
      expect(first.players).toHaveLength(50);
      expect(first.nextCursor).toBeTruthy();
      const last = (await beat(1, people[0]!.token, { cursor: first.nextCursor })).json();
      expect(last.players).toHaveLength(3);
      expect(last.nextCursor).toBeUndefined();
      expect([...first.players, ...last.players].map((p) => p.playerId).sort()).toEqual(
        people.map((p) => p.playerId).sort(),
      );
      expect((await beat(0, people[0]!.token, { cursor: 'bad' })).statusCode).toBe(422);
    }, 20000);
  },
);
