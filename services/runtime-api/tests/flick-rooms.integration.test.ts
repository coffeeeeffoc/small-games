import Fastify from 'fastify';
import { sql } from 'drizzle-orm';
import { openDatabase } from '@coffeeeeffoc/service-kit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerCompetition } from '../src/competition/routes.js';
import { createCompetitionStore } from '../src/competition/store.js';
import type { Rule } from '../src/competition/types.js';

const databaseUrl = process.env.COMPETITION_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
type Credential = { playerId: string; token: string };

integration('Flick Arena rooms over real HTTP and PostgreSQL', () => {
  let database: ReturnType<typeof openDatabase>;
  let app: ReturnType<typeof Fastify>;
  let rules: Map<string, Rule>;
  let time: number;
  let prefix: string;
  let credentials: Credential[];
  let rooms: string[];

  async function start() {
    app = Fastify();
    const store = createCompetitionStore(database.db, rules, () => time);
    await registerCompetition(app, store, {});
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test HTTP address');
    prefix = `http://127.0.0.1:${address.port}/api/competition/v1`;
  }

  async function request(path: string, credential?: Credential, body?: unknown, expected = 200) {
    const response = await fetch(prefix + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        ...(credential ? { authorization: `Bearer ${credential.token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    expect(response.status, `${path}: ${text}`).toBe(expected);
    const value = JSON.parse(text);
    if (path === '/sessions/guest' && response.ok) credentials.push(value);
    if (path === '/rooms' && response.ok) rooms.push(value.code);
    if (path.endsWith('/rematch') && response.ok) rooms.push(value.rematch);
    return value;
  }

  async function player(): Promise<Credential> {
    return request('/sessions/guest', undefined, { game: 'flick-arena' });
  }

  async function started(mode = 'duel', count = 2) {
    const players = await Promise.all(Array.from({ length: count }, player));
    let room = await request('/rooms', players[0], { game: 'flick-arena', mode });
    for (const guest of players.slice(1))
      await request('/rooms/join', guest, { game: 'flick-arena', code: room.code });
    for (const guest of players) room = await request(`/rooms/${room.code}/ready`, guest, {});
    expect(room.status).toBe('playing');
    return { players, room };
  }

  beforeEach(async () => {
    if (!databaseUrl || new URL(databaseUrl).pathname !== '/competition_test')
      throw new Error('Use the isolated competition_test database');
    credentials = [];
    rooms = [];
    time = Date.now();
    rules = new Map();
    for (const name of ['flick', 'cops']) {
      const url = new URL(`../rules/${name}.mjs`, import.meta.url).href;
      const module = (await import(url)) as { default: Rule };
      rules.set(module.default.id, module.default);
    }
    database = openDatabase(databaseUrl, 'runtime');
    await start();
  });

  afterEach(async () => {
    if (app) await app.close();
    if (!database) return;
    try {
      if (rooms.length) {
        const codes = sql.join(
          rooms.map((code) => sql`${code}`),
          sql`, `,
        );
        await database.db.execute(
          sql`delete from runtime.competition_actions where room_code in (${codes})`,
        );
        await database.db.execute(
          sql`delete from runtime.competition_duels where match_id in (${codes})`,
        );
        await database.db.execute(
          sql`delete from runtime.competition_matches where id in (${codes})`,
        );
        await database.db.execute(
          sql`delete from runtime.competition_rooms where code in (${codes})`,
        );
      }
      if (credentials.length) {
        const ids = sql.join(
          credentials.map(({ playerId }) => sql`${playerId}::uuid`),
          sql`, `,
        );
        await database.db.execute(
          sql`delete from runtime.competition_best where player_id in (${ids})`,
        );
        await database.db.execute(
          sql`delete from runtime.competition_results where player_id in (${ids})`,
        );
        await database.db.execute(
          sql`delete from runtime.competition_sessions where player_id in (${ids})`,
        );
        await database.db.execute(
          sql`delete from runtime.competition_players where id in (${ids})`,
        );
      }
    } finally {
      await database.close();
    }
  });

  it.each([3, 4])(
    'starts a %i-player room only at capacity with every player ready',
    async (count) => {
      const players = await Promise.all(Array.from({ length: count + 1 }, player));
      const room = await request('/rooms', players[0], {
        game: 'flick-arena',
        mode: `party${count}`,
      });
      expect(room.capacity).toBe(count);
      expect((await request(`/rooms/${room.code}/ready`, players[0], {})).status).toBe('waiting');
      await request('/rooms/join', players[1], { code: room.code, game: 'cops-robbers' }, 409);
      for (let seat = 1; seat < count; seat++) {
        const joined = await request('/rooms/join', players[seat], {
          code: room.code,
          game: 'flick-arena',
        });
        expect(joined.you).toBe(seat);
        expect(joined.players).toHaveLength(seat + 1);
        expect(joined.status).toBe('waiting');
        const ready = await request(`/rooms/${room.code}/ready`, players[seat], {});
        expect(ready.status).toBe(seat === count - 1 ? 'playing' : 'waiting');
      }
      const active = await request(`/rooms/${room.code}`, players[0]);
      expect(active.state.match.discs).toHaveLength(count);
      await request('/rooms/join', players[count], { code: room.code }, 409);
      await request(`/rooms/${room.code}`, players[count], undefined, 403);
      const repeat = await request(`/rooms/${room.code}/ready`, players[0], {});
      expect(repeat.startedAt).toBe(active.startedAt);
      expect(repeat.state).toEqual(active.state);
      expect(new Set(active.players.map((entry: { id: string }) => entry.id)).size).toBe(count);
    },
  );

  it('rejects unauthenticated access, full waiting rooms and forged identity', async () => {
    const host = await player(),
      guest = await player(),
      outsider = await player();
    await request('/rooms', undefined, { game: 'flick-arena' }, 401);
    await request('/me', { ...host, token: '0'.repeat(64) }, undefined, 401);
    expect((await request('/me', host)).playerId).toBe(host.playerId);
    await request('/rooms', host, { game: 'flick-arena', playerId: guest.playerId }, 422);
    await request('/rooms', host, { game: 'flick-arena', mode: 'party5' }, 422);
    const room = await request('/rooms', host, { game: 'flick-arena', mode: 'duel' });
    await request('/rooms/join', guest, { code: room.code });
    expect((await request('/rooms/join', guest, { code: room.code })).players).toHaveLength(2);
    const full = await request('/rooms/join', outsider, { code: room.code }, 409);
    expect(full.error).toBe('ROOM_FULL');
    await request(`/rooms/${room.code}/ready`, outsider, {}, 403);
    expect((await request(`/rooms/${room.code}`, host)).status).toBe('waiting');
  });

  it('enforces turns and revisions, deduplicates commands and restores the shared match after restart', async () => {
    const { players, room } = await started('party4', 4);
    const actor = players[room.state.match.active]!;
    const other = players[(room.state.match.active + 1) % players.length]!;
    const action = { type: 'shoot', revision: room.state.revision, x: 1, y: 0, power: 0.12 };
    const path = `/rooms/${room.code}/actions`;
    await request(path, other, { seq: 1, action }, 422);
    await request(path, actor, { seq: 2, action }, 409);
    for (const forged of [
      { score: 999999 },
      { playerId: other.playerId },
      { winner: 0 },
      { points: [99, 0, 0, 0] },
    ])
      await request(path, actor, { seq: 1, action: { ...action, ...forged } }, 422);
    await request(path, actor, { seq: 1, action: { ...action, power: 2 } }, 422);
    const [shot, duplicate] = await Promise.all([
      request(path, actor, { seq: 1, action }),
      request(path, actor, { seq: 1, action }),
    ]);
    expect(shot.state).toEqual(duplicate.state);
    expect(shot.seq).toBe(1);
    expect(shot.state.revision).toBeGreaterThan(room.state.revision);
    expect(shot.state.match.shots).toBe(1);
    await request(path, actor, { seq: 1, action: { ...action, x: -1 } }, 409);
    const next = players[shot.state.match.active]!;
    const current = await request(`/rooms/${room.code}`, next);
    await request(path, next, { seq: current.seq + 1, action }, 422);
    const counts = await database.db.execute(
      sql`select count(*)::int as count from runtime.competition_actions where room_code=${room.code}`,
    );
    expect(counts[0]!.count).toBe(1);
    await app.close();
    await start();
    const restored = await request(`/rooms/${room.code}`, actor);
    expect(restored.state).toEqual(shot.state);
    expect(restored.seq).toBe(1);
    for (const guest of players) {
      const shared = await request(`/rooms/${room.code}`, guest);
      expect(shared.state.match).toEqual(restored.state.match);
      expect(shared.state.series).toEqual(restored.state.series);
    }
  });

  it.each(['duel', 'party4-relaxed'])(
    'advances absent players and settles %s once without ranked rows',
    async (mode) => {
      const count = mode.startsWith('party') ? 4 : 2;
      const { players, room } = await started(mode, count);
      const initialDeadline = room.state.turnDeadlineMs;
      expect(initialDeadline).toBe(mode.endsWith('relaxed') ? 15000 : 10000);
      time += initialDeadline - 1;
      expect((await request(`/rooms/${room.code}`, players[0])).state.revision).toBe(
        room.state.revision,
      );
      time += 2;
      let snapshot = await request(`/rooms/${room.code}`, players[0]);
      expect(snapshot.state.revision).toBeGreaterThan(room.state.revision);
      expect(snapshot.state.match.shots).toBe(1);
      expect(snapshot.state.match.active).not.toBe(room.state.match.active);
      // Only the injected server clock advances; clients never submit scores or timing.
      for (let tick = 0; tick < 200 && snapshot.status === 'playing'; tick++) {
        time += 30_001;
        snapshot = await request(`/rooms/${room.code}`, players[tick % count]);
      }
      expect(snapshot.status).toBe('finished');
      expect(snapshot.results).toHaveLength(count);
      expect(snapshot.results.every((entry: { rated: boolean }) => entry.rated === false)).toBe(
        true,
      );
      for (const guest of players)
        expect((await request(`/rooms/${room.code}`, guest)).results).toEqual(snapshot.results);
      const counts = await database.db.execute(sql`select
      (select count(*)::int from runtime.competition_matches where id=${room.code}) as matches,
      (select count(*)::int from runtime.competition_duels where match_id=${room.code}) as duels,
      (select count(*)::int from runtime.competition_results where match_id=${room.code}) as results,
      (select count(*)::int from runtime.competition_best where match_id=${room.code}) as best`);
      expect(counts[0]).toEqual({ matches: 1, duels: 0, results: 0, best: 0 });
      expect((await request('/boards/flick-arena', players[0])).me).toBeNull();
      const rematch = await request(`/rooms/${room.code}/rematch`, players[0], {});
      const waiting = await request(`/rooms/${rematch.rematch}`, players[0]);
      expect(waiting.capacity).toBe(count);
      expect(waiting.mode).toBe(mode);
      expect(waiting.status).toBe('waiting');
    },
  );

  it('keeps existing two-player roles and readiness compatible', async () => {
    const host = await player(),
      guest = await player(),
      outsider = await player();
    const room = await request('/rooms', host, {
      game: 'cops-robbers',
      mode: 'survival',
      role: 'runner',
      initiative: 'runner',
    });
    expect(room.capacity).toBe(2);
    await request('/rooms/join', guest, { code: room.code });
    expect((await request('/rooms/join', outsider, { code: room.code }, 409)).error).toBe(
      'ROOM_FULL',
    );
    expect((await request(`/rooms/${room.code}/ready`, host, {})).status).toBe('waiting');
    const active = await request(`/rooms/${room.code}/ready`, guest, {});
    expect(active.status).toBe('playing');
    expect(active.players.map((entry: { role: string }) => entry.role)).toEqual([
      'runner',
      'pursuer',
    ]);
    expect(active.firstRole).toBe('runner');
    expect(active.state.board.side).toBe('runner');
  });
});
