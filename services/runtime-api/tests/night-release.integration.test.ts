import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { openDatabase } from '@coffeeeeffoc/service-kit';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createCompetitionStore } from '../src/competition/store.js';
import { createRankedStore } from '../src/competition/ranked-store.js';
import { registerCompetition } from '../src/competition/routes.js';
import { game, releaseFixture } from './night-release.fixture.js';

const url = process.env.COMPETITION_TEST_DATABASE_URL;
type Player = { playerId: string; token: string };
(url ? describe : describe.skip)(
  'Night release rollout through HTTP and isolated PostgreSQL',
  () => {
    let database: ReturnType<typeof openDatabase>,
      app: ReturnType<typeof Fastify>,
      store: ReturnType<typeof createCompetitionStore>;
    let at = Date.now();
    const leases = new Map<string, string>();
    async function server(stop = false) {
      await app?.close();
      const f = releaseFixture(stop);
      store = createCompetitionStore(
        database.db,
        new Map([[game, f.current.multiplayer]]),
        () => at,
        undefined,
        false,
        new Map(),
        f.release,
      );
      const ranked = createRankedStore(
        database.db,
        new Map([[game, f.current.ranked]]),
        store.identityDetails,
        () => at,
        undefined,
        f.release,
      );
      app = Fastify();
      await registerCompetition(
        app,
        store,
        { COMPETITION_ORIGINS: 'https://game.example' },
        undefined,
        undefined,
        ranked,
      );
      return f;
    }
    async function request(
      path: string,
      player: Player,
      build = 'build-a',
      body?: object,
      expected = 200,
    ) {
      const code = path.match(/rooms\/([0-9]{6})/)?.[1],
        key = `${player.playerId}:${code}`;
      const lease = leases.get(key);
      if (lease && code && !path.endsWith('/connect')) {
        if (body) body = { ...body, leaseId: lease };
        else path += '?leaseId=' + lease;
      }
      const response = await app.inject({
        method: body ? 'POST' : 'GET',
        url: '/api/competition/v1/games/' + game + path,
        headers: { authorization: 'Bearer ' + player.token, 'x-game-build': build },
        ...(body ? { payload: body } : {}),
      });
      expect(response.statusCode, response.body).toBe(expected);
      const value = response.json();
      if (value.leaseId) leases.set(`${player.playerId}:${value.code}`, value.leaseId);
      return value;
    }
    beforeAll(async () => {
      if (!url || new URL(url).pathname !== '/competition_test')
        throw Error('Use isolated competition_test');
      database = openDatabase(url, 'runtime');
      await server();
    });
    afterAll(async () => {
      await app?.close();
      await database?.close();
    });

    it('pins A/B rooms, stops old admission, preserves ongoing actions/retries and isolates invitations', async () => {
      const [a, b, c, d, watcher, waitingOwner] = await Promise.all(
        Array.from({ length: 6 }, () => store.guestSession({ game })),
      );
      const ar = await request('/rooms', a, 'build-a', { mode: 'friend' });
      const br = await request('/rooms', c, 'build-b', { mode: 'friend' });
      const waiting = await request('/rooms', waitingOwner, 'build-a', { mode: 'friend' });
      expect(
        (await request('/rooms', watcher, 'build-b')).rooms.map((r: { code: string }) => r.code),
      ).toContain(br.code);
      expect(
        (await request('/rooms', watcher, 'build-b')).rooms.map((r: { code: string }) => r.code),
      ).not.toContain(ar.code);
      await request('/rooms/join', watcher, 'build-b', { code: ar.code }, 409);
      await request('/rooms', a, 'build-b', { mode: 'friend' }, 409);
      await request('/chat', waitingOwner, 'build-a', {
        requestId: randomUUID(),
        text: 'Join',
        roomCode: waiting.code,
      });
      const invitation = (await request('/chat', watcher, 'build-b')).messages.find(
        (m: { room?: { code: string } }) => m.room?.code === waiting.code,
      );
      expect(invitation.room.canJoin).toBe(false);
      for (const [room, first, second, build] of [
        [ar, a, b, 'build-a'],
        [br, c, d, 'build-b'],
      ] as const) {
        await request('/rooms/join', second, build, { code: room.code });
        await request(`/rooms/${room.code}/ready`, first, build, {});
        const started = await request(`/rooms/${room.code}/ready`, second, build, {});
        expect(started.status).toBe('playing');
        expect(started.state.engine).toBe(build === 'build-a' ? 'a' : 'b');
      }
      at += 1500;
      const soloId = randomUUID();
      const solo = await request('/runs', a, 'build-a', {
        board: 'level-corridor-01',
        levelId: 'corridor-01',
        version: 'solo-a',
        requestId: soloId,
      });
      const stopped = await server(true);
      expect((await request('', a)).release.update).toBe('required');
      expect(
        (
          await request('/runs', a, 'build-b', {
            board: 'level-corridor-01',
            levelId: 'corridor-01',
            version: 'solo-a',
            requestId: soloId,
          })
        ).id,
      ).toBe(solo.id);
      await request(
        '/runs',
        a,
        'build-a',
        {
          board: 'level-corridor-01',
          levelId: 'corridor-01',
          version: 'solo-a',
          requestId: randomUUID(),
        },
        409,
      );
      await request(`/rooms/${waiting.code}/ready`, waitingOwner, 'build-a', {}, 409);
      await request('/rooms/join', watcher, 'build-a', { code: waiting.code }, 409);
      const command = { seq: 1, action: { keepAlive: true, commands: [] } };
      await request(`/rooms/${ar.code}/connect`, a, 'build-b', {}, 409);
      const old = await request(`/rooms/${ar.code}/actions`, a, 'build-a', command);
      expect(old.state.engine).toBe('a');
      expect(await request(`/rooms/${ar.code}/actions`, a, 'build-a', command)).toEqual(old);
      const current = await request(`/rooms/${br.code}/actions`, c, 'build-b', command);
      expect(current.state.engine).toBe('b');
      expect(current.state.displayed).toBeGreaterThan(old.state.displayed);
      await request(`/runs/${solo.id}/actions`, a, 'build-b', {
        seq: 1,
        frames: [{ ticks: 10, input: {} }],
      });
      const settlement = await request(`/runs/${solo.id}/finish`, a, 'build-b', { seq: 1 });
      expect(settlement.score).toBe(11);
      expect(await request(`/runs/${solo.id}/finish`, a, 'build-b', { seq: 1 })).toEqual(
        settlement,
      );
      await request(`/runs/${solo.id}`, watcher, 'build-a', undefined, 403);
      at += 31000;
      await store.sweepRooms();
      const [row] = await database.db.execute(
        sql`select data from runtime.competition_rooms where code=${ar.code}`,
      );
      expect(row?.data).toMatchObject({ version: 'duel-a', status: 'abandoned' });
      stopped.release.multiplayer.delete('duel-a');
      const terminal = await request(`/rooms/${ar.code}`, a);
      expect(terminal).toMatchObject({
        version: 'duel-a',
        status: 'abandoned',
        state: null,
        seq: 1,
      });
      expect(await request(`/rooms/${ar.code}/actions`, a, 'build-b', command)).toEqual(terminal);
      await request(`/rooms/${ar.code}`, watcher, 'build-b', undefined, 403);
    });

    it('validates build headers and advertises CORS without changing explicit restrictions', async () => {
      const player = await store.guestSession({ game });
      await request('', player, '../invalid', undefined, 422);
      expect((await request('', player, 'unknown')).release.canStartNewGames).toBe(false);
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/api/competition/v1/games/night-overwatch',
        headers: {
          origin: 'https://game.example',
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization,x-game-build',
        },
      });
      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-headers']).toContain('x-game-build');
    });
  },
);
