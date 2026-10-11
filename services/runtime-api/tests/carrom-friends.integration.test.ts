import Fastify from 'fastify';
import { sql } from 'drizzle-orm';
import { openDatabase } from '@coffeeeeffoc/service-kit';
import { expect, it } from 'vitest';
import { registerCompetition } from '../src/competition/routes.js';
import { createCompetitionStore } from '../src/competition/store.js';
import { createCarromStore } from '../src/carrom/store.js';
import type { Engine, Level } from '../src/carrom/types.js';

const databaseUrl = process.env.CARROM_TEST_DATABASE_URL;
(databaseUrl ? it : it.skip)(
  'four HTTP clients share durable, locked rooms and authoritative idempotent shots',
  async () => {
    if (!databaseUrl || new URL(databaseUrl).pathname !== '/competition_test')
      throw new Error('Use the isolated competition_test database');
    const engineUrl = new URL(
      '../../../games/local/carrom-club/src/friends-core.mjs',
      import.meta.url,
    ).href;
    const levelsUrl = new URL(
      '../../../games/local/carrom-club/src/friends-content.mjs',
      import.meta.url,
    ).href;
    const engine = (await import(engineUrl)) as Engine;
    const { FRIEND_LEVELS } = (await import(levelsUrl)) as { FRIEND_LEVELS: Level[] };
    const database = openDatabase(databaseUrl, 'runtime');
    const identity = createCompetitionStore(database.db, new Map());
    const carrom = createCarromStore(database.db, engine, FRIEND_LEVELS);
    const app = Fastify();
    await registerCompetition(app, identity, {}, undefined, carrom);
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('Missing HTTP address');
    const base = `http://127.0.0.1:${address.port}/api/competition/v1`;
    const people: { playerId: string; token: string }[] = [];
    const rooms: string[] = [];
    async function request(path: string, token?: string, body?: unknown, status = 200) {
      const response = await fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = JSON.parse(await response.text());
      expect(response.status, JSON.stringify(data)).toBe(status);
      return data;
    }
    try {
      for (let n = 0; n < 5; n++) people.push(await request('/sessions/guest', undefined, {}));
      const [a, b, c, d, outside] = people;
      let room = await request('/carrom/rooms', a!.token, { mode: 'colors', board: 'random' });
      rooms.push(room.code);
      const code = room.code;
      const path = `/carrom/rooms/${code}`;
      for (const person of [b!, c!, d!])
        room = await request('/carrom/rooms/join', person.token, { code });
      await request('/carrom/rooms/join', outside!.token, { code }, 409);
      await request(path, outside!.token, undefined, 403);
      await request(
        path + '/settings',
        b!.token,
        { revision: room.revision, settings: { mode: 'singles' } },
        409,
      );
      await request(
        path + '/settings',
        a!.token,
        { revision: room.revision, settings: { mode: 'singles' } },
        409,
      );
      await request(path + '/ready', a!.token, { revision: room.revision - 1, ready: true }, 409);
      const selected = room.resolvedLevelId;
      const readyRevision = room.revision;
      await Promise.all(
        people
          .slice(0, 4)
          .map((person) =>
            request(path + '/ready', person.token, { revision: readyRevision, ready: true }),
          ),
      );
      room = await request(path, a!.token);
      room = await request(path + '/start', a!.token, { revision: room.revision });
      expect(room.state.levelId).toBe(selected);
      expect(room.state.players.map((p: { color: string }) => p.color)).toEqual([
        'cyan',
        'orange',
        'purple',
        'green',
      ]);
      const shot = {
        round: room.round,
        expectedTurnNumber: room.state.turnNumber,
        seq: 1,
        shot: { position: 500, dx: 0, dy: -1, power: 0.25 },
      };
      await request(path + '/shoot', b!.token, shot, 409);
      await request(path + '/shoot', a!.token, { ...shot, state: { winner: 0 } }, 422);
      // Concurrent retries exercise PostgreSQL's row lock, not an in-memory test double.
      const [first, replay] = await Promise.all([
        request(path + '/shoot', a!.token, shot),
        request(path + '/shoot', a!.token, shot),
      ]);
      expect(first.state).toEqual(replay.state);
      expect(first.state.shots).toBe(1);
      expect(first.seq).toBe(1);
      const restoredStore = createCarromStore(database.db, engine, FRIEND_LEVELS);
      const restored = await restoredStore.action(c!.playerId, code, 'get');
      expect(restored).toMatchObject({ status: 'playing', state: first.state, you: 2, seq: 0 });
      const publicJson = JSON.stringify(first);
      for (const person of people) expect(publicJson).not.toContain(person.token);
      expect(publicJson).not.toContain('lastHash');
      await request(
        path + '/shoot',
        a!.token,
        { ...shot, shot: { ...shot.shot, power: 0.8 } },
        409,
      );
      await request(path + '/leave', a!.token, {});
      room = await request(path, b!.token);
      expect(room.hostId).toBe(b!.playerId);
      expect(room.status).toBe('abandoned');
      room = await request(path + '/rematch', b!.token, { revision: room.revision });
      expect(room.players).toHaveLength(3);
      expect(room.series).toHaveLength(3);
      expect(room.series.every((p: { points: number }) => p.points === 0)).toBe(true);
      expect(room.status).toBe('waiting');
    } finally {
      await app.close();
      for (const code of rooms)
        await database.db.execute(sql`delete from runtime.competition_rooms where code=${code}`);
      for (const person of people) {
        await database.db.execute(
          sql`delete from runtime.competition_sessions where player_id=${person.playerId}`,
        );
        await database.db.execute(
          sql`delete from runtime.competition_players where id=${person.playerId}`,
        );
      }
      await database.close();
    }
  },
  30_000,
);
