import Fastify from 'fastify';
import { sql } from 'drizzle-orm';
import { openDatabase } from '@coffeeeeffoc/service-kit';
import { expect, it } from 'vitest';
import { registerCompetition } from '../src/competition/routes.js';
import { createCompetitionStore } from '../src/competition/store.js';
import type { Rule } from '../src/competition/types.js';

const databaseUrl = process.env.CARROM_TEST_DATABASE_URL;
const integration = databaseUrl ? it : it.skip;
integration(
  'two independent HTTP identities share one authoritative carrom board with idempotent shots and recovery',
  async () => {
    if (!databaseUrl || new URL(databaseUrl).pathname !== '/competition_test')
      throw new Error('Use the isolated competition_test database');
    const ruleUrl = new URL('../rules/carrom.mjs', import.meta.url).href;
    const { default: rule } = (await import(ruleUrl)) as { default: Rule };
    const database = openDatabase(databaseUrl, 'runtime');
    const store = createCompetitionStore(database.db, new Map([[rule.id, rule]]));
    const app = Fastify();
    await registerCompetition(app, store, {});
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test HTTP address');
    const base = `http://127.0.0.1:${address.port}/api/competition/v1`;
    const credentials: { playerId: string; token: string }[] = [];
    const rooms: string[] = [];
    async function request(path: string, token?: string, body?: unknown, expected = 200) {
      const response = await fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = JSON.parse(await response.text());
      expect(response.status, JSON.stringify(data)).toBe(expected);
      return data;
    }
    try {
      const a = await request('/sessions/guest', undefined, {});
      const b = await request('/sessions/guest', undefined, {});
      const outsider = await request('/sessions/guest', undefined, {});
      credentials.push(a, b, outsider);
      expect(a.playerId).not.toBe(b.playerId);
      let room = await request('/rooms', a.token, { game: 'carrom-club' });
      rooms.push(room.code);
      const code = room.code;
      await request('/rooms/join', b.token, { code, game: 'letters-words2' }, 409);
      const joined = await request('/rooms/join', b.token, { code, game: 'carrom-club' });
      expect(joined.you).toBe(1);
      await request('/rooms/join', outsider.token, { code, game: 'carrom-club' }, 409);
      await request(`/rooms/${code}`, outsider.token, undefined, 403);
      await request(`/rooms/${code}/ready`, a.token, {});
      room = await request(`/rooms/${code}/ready`, b.token, {});
      expect(room.status).toBe('playing');
      expect(room.state.game.turn).toBe(0);
      const shot = {
        seq: 1,
        action: { type: 'shoot', x: 500, dx: 0, dy: -1, power: 0.75, expectedShot: 0 },
      };
      await request(`/rooms/${code}/actions`, b.token, shot, 422);
      const results = await Promise.all([
        request(`/rooms/${code}/actions`, a.token, shot),
        request(`/rooms/${code}/actions`, a.token, shot),
      ]);
      expect(results[0].state.game).toEqual(results[1].state.game);
      expect(results[0].state.game.shots).toBe(1);
      const first = results[0];
      expect(first.state.lastShot.before.shots).toBe(0);
      expect(first.state.lastShot.seat).toBe(0);
      expect(first.state.scores).toHaveLength(2);
      const recovered = await request(`/rooms/${code}`, b.token);
      expect(recovered.state.game).toEqual(first.state.game);
      expect(recovered.seq).toBe(0);
      await request(
        `/rooms/${code}/actions`,
        a.token,
        { ...shot, action: { ...shot.action, power: 0.4 } },
        409,
      );
      const seat = recovered.state.game.turn;
      const shooter = seat === 0 ? a : b;
      const second = {
        seq: seat === 0 ? 2 : 1,
        action: {
          type: 'shoot',
          x: 500,
          dx: 0,
          dy: seat === 0 ? -1 : 1,
          power: 0.5,
          expectedShot: 1,
        },
      };
      const played = await request(`/rooms/${code}/actions`, shooter.token, second);
      expect(played.state.game.shots).toBe(2);
      const viewA = await request(`/rooms/${code}`, a.token);
      const viewB = await request(`/rooms/${code}`, b.token);
      expect(viewA.state.game).toEqual(viewB.state.game);
      const finished = await request(`/rooms/${code}/actions`, a.token, {
        seq: viewA.seq + 1,
        action: { type: 'resign' },
      });
      expect(finished.status).toBe('finished');
      expect(finished.state.game.winner).toBe(1);
      expect(finished.results).toHaveLength(2);
      const rematch = await request(`/rooms/${code}/rematch`, a.token, {});
      rooms.push(rematch.rematch);
      const newFriend = await request('/rooms/join', b.token, {
        code: rematch.rematch,
        game: 'carrom-club',
      });
      expect(newFriend.status).toBe('waiting');
      expect(newFriend.players).toHaveLength(2);
      const abandoned = await request(`/rooms/${rematch.rematch}/leave`, b.token, {});
      expect(abandoned.status).toBe('abandoned');
    } finally {
      await app.close();
      // Immutable settlement audit rows deliberately remain in the isolated test database.
      for (const code of rooms) {
        await database.db.execute(
          sql`delete from runtime.competition_actions where room_code=${code}`,
        );
        await database.db.execute(
          sql`delete from runtime.competition_results where match_id=${code}`,
        );
        await database.db.execute(sql`delete from runtime.competition_rooms where code=${code}`);
      }
      for (const { playerId } of credentials) {
        await database.db.execute(
          sql`delete from runtime.competition_best where player_id=${playerId}`,
        );
        await database.db.execute(
          sql`delete from runtime.competition_sessions where player_id=${playerId}`,
        );
        await database.db.execute(
          sql`delete from runtime.competition_players where id=${playerId}`,
        );
      }
      await database.close();
    }
  },
  30_000,
);
