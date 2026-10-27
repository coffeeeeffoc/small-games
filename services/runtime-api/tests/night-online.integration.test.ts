/* eslint-disable max-lines -- One isolated HTTP/PG lifecycle fixture covers room races, recovery and atomic ledger settlement. */
import Fastify from 'fastify';
import { openDatabase } from '@coffeeeeffoc/service-kit';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { sql } from 'drizzle-orm';
const roomCodes = vi.hoisted(() => [] as number[]);
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    randomInt: (min: number, max?: number) =>
      min === 100000 && roomCodes.length
        ? roomCodes.shift()!
        : max === undefined
          ? actual.randomInt(min)
          : actual.randomInt(min, max),
  };
});
import { createCompetitionStore } from '../src/competition/store.js';
import { createRankedStore } from '../src/competition/ranked-store.js';
import { registerCompetition } from '../src/competition/routes.js';
import {
  backfillNightClears,
  nightBoard,
  nightLedgerLock,
  refreshNightClears,
  settleNightRoom,
} from '../src/competition/night-ledger.js';
import { randomUUID } from 'node:crypto';
import type { Room, Rule } from '../src/competition/types.js';
import type { RankedRule } from '../src/competition/ranked-types.js';

const databaseUrl = process.env.COMPETITION_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
type Player = { playerId: string; token: string };
integration('Night real HTTP and PostgreSQL', () => {
  let database: ReturnType<typeof openDatabase>,
    app: ReturnType<typeof Fastify>,
    base: string,
    store: ReturnType<typeof createCompetitionStore>;
  let guests = 0;
  let time = Date.now();
  const leases = new Map<string, string>();
  async function request(
    path: string,
    player?: Player,
    body?: unknown,
    status: number | number[] = 200,
  ) {
    const code = path.match(/rooms\/([A-F0-9]{6,12})/)?.[1];
    const key = `${player?.playerId}:${code}`,
      leaseId = leases.get(key);
    if (leaseId && code && !path.endsWith('/connect') && !path.endsWith('/spectate')) {
      if (body === undefined) path += '?leaseId=' + leaseId;
      else body = { leaseId, ...(body as object) };
    }
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        ...(player ? { authorization: `Bearer ${player.token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value = JSON.parse(await response.text());
    expect(
      Array.isArray(status) ? status : [status],
      `${path}: ${value.error || 'unexpected status'}`,
    ).toContain(response.status);
    if (value.leaseId) leases.set(`${player?.playerId}:${value.code}`, value.leaseId);
    return value;
  }
  // Additional fixture identities use the same store without exhausting the public signup quota.
  const player = (game = 'night-overwatch'): Promise<Player> =>
    ++guests <= 12 ? request('/sessions/guest', undefined, { game }) : store.guestSession({ game });
  const path = '/games/night-overwatch';
  const roomPath = (code: string) => `${path}/rooms/${code}`;
  beforeAll(async () => {
    if (!databaseUrl || new URL(databaseUrl).pathname !== '/competition_test')
      throw Error('Use isolated competition_test');
    database = openDatabase(databaseUrl, 'runtime');
    await database.db.execute(
      sql`delete from runtime.competition_actions where room_code in (select code from runtime.competition_rooms where data->>'game'='night-overwatch')`,
    );
    await database.db.execute(
      sql`delete from runtime.competition_rooms where data->>'game'='night-overwatch'`,
    );
    app = Fastify();
    const duel = (await import(new URL('../rules/night.mjs', import.meta.url).href))
      .default as Rule;
    const solo = (await import(new URL('../rules/night-ranked.mjs', import.meta.url).href))
      .default as RankedRule;
    store = createCompetitionStore(database.db, new Map([[duel.id, duel]]), () => time);
    const ranked = createRankedStore(
      database.db,
      new Map([[solo.id, solo]]),
      store.identityDetails,
      () => time,
    );
    await registerCompetition(app, store, {}, undefined, undefined, ranked);
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw Error('Missing HTTP address');
    base = `http://127.0.0.1:${address.port}/api/competition/v1`;
  });
  afterAll(async () => {
    await app?.close();
    await database?.close();
  });

  it('assigns distinct identities, requires both ready, isolates outsiders, and retries actions once', async () => {
    const [a, b, outsider, wrongGame] = await Promise.all([
      player(),
      player(),
      player(),
      player('cops-robbers'),
    ]);
    expect(a.playerId).not.toBe(b.playerId);
    const metadata = await request(path, a);
    expect(metadata.identity.playerId).toBe(a.playerId);
    expect(metadata.boards).toHaveLength(123);
    expect(metadata.capabilities.multiplayer).toBe(true);
    expect(metadata.identity.nickname || metadata.identity.name).toBeTruthy();
    const room = await request(path + '/rooms', a, { mode: 'friend' });
    await request(path + '/rooms/join', b, { code: room.code });
    expect((await request(roomPath(room.code) + '/ready', a, {})).status).toBe('waiting');
    const started = await request(roomPath(room.code) + '/ready', b, {});
    expect(started.status).toBe('playing');
    expect(started.state.you).toBe(1);
    expect(
      started.state.simulation.units.filter((u: { friendly: boolean }) => u.friendly),
    ).toHaveLength(8);
    await request(roomPath(room.code), outsider, undefined, 403);
    await request(roomPath(room.code), wrongGame, undefined, 403);
    expect(started.startsAt).toBe(time + 1200);
    expect(started.serverNow).toBe(time);
    time += 1500;
    const body = {
      seq: 1,
      action: {
        commands: [
          { command: 'choose', args: [3] },
          { command: 'setAim', args: [{ x: 800, z: 800 }] },
        ],
        keepAlive: true,
      },
    };
    const first = await request(roomPath(room.code) + '/actions', a, body);
    const repeated = await request(roomPath(room.code) + '/actions', a, body);
    expect(repeated).toEqual(first);
    expect(first.seq).toBe(1);
    await request(roomPath(room.code) + '/actions', a, { seq: 1, action: { commands: [] } }, 409);
    const before = await request(roomPath(room.code), a);
    await request(
      roomPath(room.code) + '/actions',
      a,
      { seq: 2, action: { commands: [{ command: 'grantAmmoSupply', args: [] }] } },
      422,
    );
    expect((await request(roomPath(room.code), a)).state.simulation.guns).toEqual(
      before.state.simulation.guns,
    );
    await request(roomPath(room.code) + '/leave', a, {});
    expect((await request(roomPath(room.code), b)).players[0].disconnected).toBe(true);
  });

  it('matches only humans, keeps public waiting rooms, and supports explicit bot rooms', async () => {
    const [a, b, c] = await Promise.all(Array.from({ length: 3 }, () => player()));
    const duplicates = await Promise.all([
      request(path + '/match', a, {}),
      request(path + '/match', a, {}),
    ]);
    expect(duplicates[0].code).toBe(duplicates[1].code);
    time += 8001;
    const waiting = await request(path + '/match', a, {});
    expect(waiting.mode).toBe('match');
    expect(waiting.status).toBe('waiting');
    expect((await request(path + '/rooms', a, {})).code).toBe(waiting.code);
    const paired = await request(path + '/match', b, {});
    expect(paired.code).toBe(waiting.code);
    expect(paired.players).toHaveLength(2);
    expect(paired.status).toBe('waiting');
    await request(roomPath(waiting.code) + '/leave', a, {});
    await request(roomPath(waiting.code), b, undefined, 404);
    const bot = await request(path + '/rooms', c, { mode: 'bot' });
    const started = await request(roomPath(bot.code) + '/ready', c, {});
    expect(started.state.bot).toBe(true);
    expect(started.players).toHaveLength(1);
    time += 1300;
    let end = started;
    for (let n = 0; n < 65 && end.status === 'playing'; n++) {
      time += 9000;
      end = await request(roomPath(bot.code), c);
    }
    expect(end.status).toBe('finished');
    expect(end.settlement.points).toBe(10);
    expect((await request(path + '/history', c)).summary.games).toBe(0);
    expect((await request(path + '/leaderboards/points', c)).me.score).toBe(10);
  });

  it('isolates private rooms, atomically claims the last seat, and gives spectators no control', async () => {
    const [a, b, c, watch, wrongGame] = await Promise.all([
      player(),
      player(),
      player(),
      player(),
      player('cops-robbers'),
    ]);
    const profile = await request('/me', a, { nickname: '夜航甲号' });
    expect(profile.nickname).toBe('夜航甲号');
    const room = await request(path + '/rooms', a, {
      visibility: 'private',
      password: 'secret-pass',
    });
    expect(room.code).toMatch(/^[0-9]{6}$/);
    expect(JSON.stringify(room)).not.toMatch(/secret-pass|passwordHash|passwordSalt/);
    expect(
      (await request(path + '/rooms', c)).rooms.some((r: { code: string }) => r.code === room.code),
    ).toBe(false);
    await request(path + '/rooms/join', b, { code: room.code, password: 'wrong' }, 403);
    await request(roomPath(room.code) + '/spectate', watch, { password: 'wrong' }, 403);
    await request(roomPath(room.code) + '/spectate', wrongGame, { password: 'secret-pass' }, 403);
    const watched = await request(roomPath(room.code) + '/spectate', watch, {
      password: 'secret-pass',
    });
    expect(watched.you).toBe(-1);
    expect(watched.spectator).toBe(true);
    expect(watched.leaseId).toBeUndefined();
    const race = await Promise.all(
      [b, c].map((p) =>
        request(path + '/rooms/join', p, { code: room.code, password: 'secret-pass' }, [200, 409]),
      ),
    );
    expect(race.filter((r) => !r.error)).toHaveLength(1);
    const joined = race[0].error ? c : b;
    expect((await request(roomPath(room.code), watch)).players).toHaveLength(2);
    for (const op of ['ready', 'connect', 'rematch'])
      await request(roomPath(room.code) + '/' + op, watch, {}, 403);
    await request(
      roomPath(room.code) + '/actions',
      watch,
      { seq: 1, action: { commands: [] } },
      403,
    );
    expect((await request(roomPath(room.code), joined)).players[0].nickname).toBe('夜航甲号');
    const stored = await database.db.execute(
      sql`select data from runtime.competition_rooms where code=${room.code}`,
    );
    const data = stored[0]!.data as { passwordSalt: string; passwordHash: string };
    expect(data.passwordSalt).toHaveLength(32);
    expect(data.passwordHash).toHaveLength(64);
    expect(JSON.stringify(data)).not.toContain('secret-pass');
    await request(roomPath(room.code) + '/leave', a, {});
    const publicRoom = await request(path + '/rooms', a, {});
    expect(
      (await request(path + '/rooms', watch)).rooms.find(
        (r: { code: string }) => r.code === publicRoom.code,
      ),
    ).toMatchObject({ playerCount: 1, canJoin: true, canSpectate: true });
    await request(roomPath(publicRoom.code) + '/spectate', watch, {});
    await request(roomPath(publicRoom.code) + '/leave', a, {});
  });

  async function pair(a: Player, b: Player) {
    const room = await request(path + '/rooms', a, {});
    await request(path + '/rooms/join', b, { code: room.code });
    await request(roomPath(room.code) + '/ready', a, {});
    const started = await request(roomPath(room.code) + '/ready', b, {});
    time += 1201;
    return started;
  }
  async function eliminate(code: string, side: number | null) {
    const rows = await database.db.execute(
      sql`select data from runtime.competition_rooms where code=${code}`,
    );
    const room = rows[0]!.data as {
      players: { state: { simulation: { units: { group: number; hp: number }[] } } }[];
    };
    for (const unit of room.players[0]!.state.simulation.units)
      if (side === null || unit.group === side) unit.hp = 0;
    await database.db.execute(
      sql`update runtime.competition_rooms set data=${JSON.stringify(room)}::jsonb where code=${code}`,
    );
    time += 100;
  }
  async function storedRoom(code: string) {
    const rows = await database.db.execute(
      sql`select data from runtime.competition_rooms where code=${code}`,
    );
    return rows[0]!.data as Room;
  }
  it('releases spectators on leave and expires inactive viewers while GET renews active viewers', async () => {
    const [owner, watcher, newcomer, partner] = await Promise.all(
      Array.from({ length: 4 }, () => player()),
    );
    const room = await request(path + '/rooms', owner, {
      visibility: 'private',
      password: 'secret-pass',
    });
    expect(JSON.stringify(room)).not.toMatch(/secret-pass|passwordHash|passwordSalt/);
    await request(path + '/rooms/join', partner, { code: room.code, password: 'wrong' }, 403);
    await request(path + '/rooms/join', partner, { code: room.code, password: 'secret-pass' });
    await request(roomPath(room.code) + '/spectate', watcher, { password: 'wrong' }, 403);
    await request(roomPath(room.code) + '/spectate', watcher, { password: 'secret-pass' });
    expect(await request(roomPath(room.code) + '/leave', watcher, {})).toEqual({
      code: room.code,
      spectator: true,
      left: true,
    });
    await request(roomPath(room.code), watcher, undefined, 403);
    expect((await storedRoom(room.code)).players.map((p) => p.id)).toEqual([
      owner.playerId,
      partner.playerId,
    ]);
    await request(roomPath(room.code) + '/spectate', watcher, { password: 'secret-pass' });
    time += 20000;
    await request(roomPath(room.code), watcher);
    time += 20000;
    await request(roomPath(room.code), watcher);
    const saved = await storedRoom(room.code);
    const inactive = Array.from({ length: 255 }, () => randomUUID());
    saved.spectators!.push(...inactive);
    for (const id of inactive) saved.spectatorSeenAt![id] = time - 30001;
    await database.db.execute(
      sql`update runtime.competition_rooms set data=${JSON.stringify(saved)}::jsonb where code=${room.code}`,
    );
    await request(roomPath(room.code) + '/spectate', newcomer, { password: 'secret-pass' });
    expect((await storedRoom(room.code)).spectators).toEqual([watcher.playerId, newcomer.playerId]);
    time += 20000;
    await request(roomPath(room.code), watcher);
    time += 10001;
    await Promise.all([store.sweepRooms(), store.sweepRooms()]);
    expect((await storedRoom(room.code)).spectators).toEqual([watcher.playerId]);
    time += 30001;
    await store.sweepRooms();
    const expired = await storedRoom(room.code);
    expect(expired.spectators).toEqual([]);
    expect(expired.spectatorSeenAt).toEqual({});
    expect(expired.status).toBe('waiting');
    await request(roomPath(room.code), watcher, undefined, 403);
    await request(roomPath(room.code) + '/spectate', watcher, { password: 'secret-pass' });
    await request(roomPath(room.code) + '/leave', watcher, {});
    await request(roomPath(room.code) + '/leave', owner, {});
  });
  it('rematches and matches after advancing to finished and ignores old-version active rooms', async () => {
    const [a, b] = await Promise.all([player(), player()]);
    const first = await pair(a, b);
    await eliminate(first.code, 1);
    const rematched = await request(roomPath(first.code) + '/rematch', a, {});
    expect(rematched.status).toBe('finished');
    expect(rematched.rematch).not.toBe(first.code);
    expect((await request(roomPath(first.code) + '/rematch', b, {})).rematch).toBe(
      rematched.rematch,
    );
    expect((await storedRoom(rematched.rematch)).status).toBe('waiting');
    await request(roomPath(rematched.rematch) + '/connect', a, {});
    await request(roomPath(rematched.rematch) + '/leave', a, {});
    const second = await pair(a, b);
    await eliminate(second.code, 1);
    const matched = await request(path + '/match', a, {});
    expect(matched.code).not.toBe(second.code);
    expect(matched.status).toBe('waiting');
    expect((await storedRoom(second.code)).status).toBe('finished');
    expect((await request(path + '/history', a)).summary.games).toBe(2);
    await request(roomPath(matched.code) + '/leave', a, {});
    const legacy = await pair(a, b);
    const old = await storedRoom(legacy.code);
    old.version = 'night-duel-v1';
    await database.db.execute(
      sql`update runtime.competition_rooms set data=${JSON.stringify(old)}::jsonb where code=${legacy.code}`,
    );
    const created = await request(path + '/rooms', a, {});
    expect(created.code).not.toBe(legacy.code);
    expect(created.status).toBe('waiting');
    await request(roomPath(created.code) + '/leave', a, {});
    const queued = await request(path + '/match', a, {});
    expect(queued.code).not.toBe(legacy.code);
    expect(queued.status).toBe('waiting');
    expect(await storedRoom(legacy.code)).toEqual(old);
    expect((await request(path + '/history', a)).summary.games).toBe(2);
    await request(roomPath(queued.code) + '/leave', a, {});
  });
  it('recovers within 30 seconds, rejects stale leases, and settles timeout only once', async () => {
    const [a, b] = await Promise.all([player(), player()]);
    const room = await pair(a, b);
    const old = leases.get(`${a.playerId}:${room.code}`);
    time += 3000;
    const offline = await request(roomPath(room.code), b);
    expect(offline.players[0].disconnected).toBe(true);
    expect(offline.players[0].takenOver).toBe(false);
    const resumed = await request(roomPath(room.code) + '/connect', a, {});
    expect(resumed.leaseId).not.toBe(old);
    expect(resumed.players[0].disconnected).toBe(false);
    for (const op of ['leave', 'actions'])
      await request(
        roomPath(room.code) + '/' + op,
        a,
        { leaseId: old, ...(op === 'actions' ? { seq: 1, action: { commands: [] } } : {}) },
        409,
      );
    await request(roomPath(room.code) + '/leave', a, {});
    time += 15000;
    await request(roomPath(room.code), b);
    time += 14000;
    await request(roomPath(room.code), b);
    expect((await request(roomPath(room.code) + '/connect', a, {})).players[0].takenOver).toBe(
      false,
    );
    expect((await request(path + '/history', a)).summary.games).toBe(0);
    await request(roomPath(room.code) + '/leave', a, {});
    time += 15000;
    await request(roomPath(room.code), b);
    time += 15001;
    const taken = await request(roomPath(room.code), b);
    expect(taken.status).toBe('playing');
    expect(taken.players[0]).toMatchObject({ disconnected: true, takenOver: true });
    expect(taken.settlement).toMatchObject({
      points: 120,
      wins: 1,
      games: 1,
      outcome: 'win',
      reason: 'disconnect',
    });
    await request(roomPath(room.code) + '/connect', a, {}, 409);
    const lost = await request(path + '/history', a),
      won = await request(path + '/history', b);
    expect(lost.summary).toMatchObject({ losses: 1, games: 1, wins: 0 });
    expect(lost.matches[0].points).toBe(40);
    expect(won.summary).toMatchObject({ wins: 1, games: 1, winRate: 1 });
    await eliminate(room.code, 1);
    const ended = await request(roomPath(room.code), b);
    expect(ended.status).toBe('finished');
    expect(ended.settlement.points).toBe(120);
    expect((await request(path + '/history', b)).summary.games).toBe(1);
    expect((await request(path + '/leaderboards/points', b)).me.score).toBe(120);
    const second = await pair(a, b);
    await eliminate(second.code, 1);
    await request(roomPath(second.code), a);
    const rate = (await request(path + '/leaderboards/win-rate', b)).me;
    expect(rate).toMatchObject({ score: 0.5, wins: 1, games: 2 });
    expect((await request(path + '/history', b)).summary).toMatchObject({
      wins: 1,
      losses: 1,
      games: 2,
      winRate: 0.5,
    });
    const draw = await pair(a, b);
    await eliminate(draw.code, null);
    await request(roomPath(draw.code), a);
    expect((await request(path + '/history', a)).summary).toMatchObject({
      wins: 1,
      losses: 1,
      draws: 1,
      games: 3,
    });
  });
  it('gives no pre-start result and records two abandoned losses without points', async () => {
    const [a, b] = await Promise.all([player(), player()]);
    const room = await pair(a, b);
    time -= 1201;
    await request(roomPath(room.code) + '/leave', a, {});
    expect((await request(path + '/history', a)).summary.games).toBe(0);
    const next = await pair(a, b);
    await request(roomPath(next.code) + '/leave', a, {});
    await request(roomPath(next.code) + '/leave', b, {});
    time += 30001;
    const record = await request(path + '/history', a);
    expect(record.summary).toMatchObject({ losses: 1, games: 1 });
    expect(record.matches[0]).toMatchObject({ reason: 'abandoned', points: 0 });
    expect((await request(path + '/history', b)).summary).toMatchObject({ losses: 1, games: 1 });
  });
  it('retries room code collisions and accepts old 12-hex invitations', async () => {
    const [a, b, c] = await Promise.all([player(), player(), player()]);
    const first = await request(path + '/rooms', a, {});
    roomCodes.push(Number(first.code));
    const second = await request(path + '/rooms', b, {});
    expect(second.code).not.toBe(first.code);
    const legacy = 'ABCDEF' + second.code;
    const rows = await database.db.execute(
      sql`select data from runtime.competition_rooms where code=${second.code}`,
    );
    const data = { ...(rows[0]!.data as object), code: legacy };
    await database.db.execute(
      sql`update runtime.competition_rooms set code=${legacy},data=${JSON.stringify(data)}::jsonb where code=${second.code}`,
    );
    expect((await request(path + '/rooms/join', c, { code: legacy })).code).toBe(legacy);
    await request(roomPath(first.code) + '/leave', a, {});
  });

  it('sweeps abandoned rooms without reads and pages history by immutable match identity', async () => {
    const [a, b] = await Promise.all([player(), player()]);
    const live = await pair(a, b);
    time += 30001;
    await Promise.all([store.sweepRooms(), store.sweepRooms()]);
    const saved = await database.db.execute(
      sql`select data from runtime.competition_rooms where code=${live.code}`,
    );
    expect((saved[0]!.data as { status: string }).status).toBe('abandoned');
    for (let i = 0; i < 22; i++) {
      const id = randomUUID();
      const room = {
        id,
        code: '777777',
        game: 'night-overwatch',
        version: 'night-duel-v2',
        status: 'finished' as const,
        seed: 1,
        createdAt: time - 5000,
        startedAt: time - 4000,
        deadline: time,
        mode: 'friend',
        players: [
          {
            id: a.playerId,
            ready: true,
            seq: 0,
            state: null,
            result: {
              finished: true,
              eligible: true,
              score: 1,
              secondary: 1,
              outcome: 'win' as const,
            },
          },
          {
            id: b.playerId,
            ready: true,
            seq: 0,
            state: null,
            result: {
              finished: true,
              eligible: true,
              score: 0,
              secondary: 1,
              outcome: 'loss' as const,
            },
          },
        ],
      };
      await database.db.transaction(async (tx) => {
        await settleNightRoom(tx, room, time, 'elimination');
        await settleNightRoom(tx, { ...room, settledAt: undefined }, time, 'elimination');
      });
    }
    const first = await request(path + '/history', a);
    expect(first.summary).toMatchObject({ wins: 22, losses: 1, games: 23 });
    expect(first.matches).toHaveLength(20);
    const next = await request(path + '/history?cursor=' + first.nextCursor, a);
    expect(next.matches).toHaveLength(3);
    expect(next.nextCursor).toBeUndefined();
    expect(new Set([...first.matches, ...next.matches].map((m) => m.id)).size).toBe(23);
    expect((await request(path + '/leaderboards/points', a)).me.score).toBe(22 * 120);
    await request(path + '/history?cursor=bad', a, undefined, 422);
    expect((await request(path + '/history', b)).summary).toMatchObject({
      wins: 0,
      losses: 23,
      games: 23,
    });
  });
  it('migrates legacy clears once atomically and refreshes only the new clear owner', async () => {
    // The fixture injects pre-migration history after other tests have read boards.
    await database.db.execute(
      sql`update runtime.competition_matches set data='{}'::jsonb where id='night-migration:legacy-clears-v1'`,
    );
    const [a, b] = await Promise.all([player(), player()]);
    for (const [level, version, ms] of [
      ['corridor-01', 'v6', 5000],
      ['corridor-01', 'v7', 4000],
      ['ambush-02', 'v7', 7000],
    ] as const) {
      await database.db.execute(
        sql`insert into runtime.competition_results values(${randomUUID()},${`night-overwatch:level-${level}:night-input-replay-${version}`},${a.playerId},1,${ms},${time})`,
      );
    }
    await database.db.execute(
      sql`insert into runtime.competition_results values(${randomUUID()},'night-overwatch:level-corridor-01:night-input-replay-v7',${b.playerId},1,6000,${time})`,
    );
    await expect(
      database.db.transaction(async (tx) => {
        await backfillNightClears(tx, time);
        throw Error('rollback migration');
      }),
    ).rejects.toThrow('rollback migration');
    expect(
      await database.db.execute(
        sql`select id from runtime.competition_matches where id='night-migration:legacy-clears-v1' and data->>'status'='complete'`,
      ),
    ).toHaveLength(0);
    await Promise.all([a, b].map((p) => store.prepareNightBoards(p.playerId)));
    const marker = await database.db.execute(
      sql`select data,created_at from runtime.competition_matches where id='night-migration:legacy-clears-v1'`,
    );
    expect(marker).toHaveLength(1);
    expect(marker[0]!.data).toEqual({ status: 'complete' });
    expect((await request(path + '/leaderboards/clears', a)).me.score).toBe(2);
    expect((await request(path + '/leaderboards/level-corridor-01', a)).me.secondary).toBe(4000);
    expect((await request(path + '/leaderboards/points', a)).me).toBeNull();
    expect((await request(path + '/history', a)).summary.games).toBe(0);
    const before = await database.db.execute(
      sql`select * from runtime.competition_best where board=${nightBoard('clears')} and player_id=${b.playerId}`,
    );
    time += 1000;
    // Later reads must not scan old history again or rewrite another player's aggregate.
    await database.db.execute(
      sql`insert into runtime.competition_results values(${randomUUID()},'night-overwatch:level-patrol-03:night-input-replay-v7',${b.playerId},1,6000,${time})`,
    );
    await store.prepareNightBoards(b.playerId);
    expect(
      await database.db.execute(
        sql`select data,created_at from runtime.competition_matches where id='night-migration:legacy-clears-v1'`,
      ),
    ).toEqual(marker);
    await database.db.transaction(async (tx) => {
      await nightLedgerLock(tx);
      await tx.execute(
        sql`insert into runtime.competition_results values(${randomUUID()},${nightBoard('clear-patrol-03')},${a.playerId},1,8000,${time})`,
      );
      await refreshNightClears(tx, time, a.playerId);
    });
    expect((await request(path + '/leaderboards/clears', a)).me.score).toBe(3);
    expect(
      await database.db.execute(
        sql`select * from runtime.competition_best where board=${nightBoard('clears')} and player_id=${b.playerId}`,
      ),
    ).toEqual(before);
    expect((await request(path + '/leaderboards/level-patrol-03', a)).me).toBeNull();
  });

  it('replays actual controls, ranks per level, retains faster times and rejects another player', async () => {
    const core = new URL(
      '../../../games/local/night-overwatch/assets/scripts/core/',
      import.meta.url,
    );
    const { Simulation } = await import(new URL('Simulation.ts', core).href);
    const { observeNightInputs, RANKED_RULE_VERSION } = await import(
      new URL('Replay.ts', core).href
    );
    const a = await player(),
      b = await player();
    const runOnce = async (delay: number, assisted = false) => {
      const run = await request(path + '/runs', a, {
        board: 'level-corridor-01',
        levelId: 'corridor-01',
        version: RANKED_RULE_VERSION,
      });
      await request(`${path}/runs/${run.id}`, b, undefined, 403);
      const sim = new Simulation();
      sim.start();
      const frames: { input: Record<string, unknown>; ticks: number }[] = [];
      observeNightInputs(sim, (input: Record<string, unknown>, ticks: number) => {
        const previous = frames.at(-1);
        if (ticks && previous && !Object.keys(previous.input).length && previous.ticks < 600)
          previous.ticks += ticks;
        else frames.push({ input, ticks });
      });
      if (assisted) sim.grantHomingAmmo(2);
      sim.choose(2);
      for (let i = 0; i < 6000 && sim.phase === 'playing'; i++) {
        const target = sim.units.find(
          (u: { friendly: boolean; hp: number }) => !u.friendly && u.hp > 0,
        );
        if (target && sim.time >= delay && !sim.shots.length && !sim.guns[2].cooldown) {
          sim.setAim({ x: target.x, z: target.z });
          sim.fire();
        }
        sim.step(1 / 60);
      }
      expect(sim.phase).toBe('success');
      let seq = 0;
      while (frames.length) {
        const batch: typeof frames = [];
        let ticks = 0;
        while (frames.length && batch.length < 500 && ticks + frames[0]!.ticks <= 2400) {
          const frame = frames.shift()!;
          batch.push(frame);
          ticks += frame.ticks;
        }
        time += Math.ceil((ticks * 1000) / 120);
        await request(`${path}/runs/${run.id}/actions`, a, { seq: ++seq, frames: batch });
      }
      const result = await request(`${path}/runs/${run.id}/finish`, a, { seq });
      expect(result.accepted).toBe(true);
      expect(result.points).toBe(100);
      expect(result.clears).toBe(1);
      expect(result.assisted).toBe(assisted);
      expect(result.fastestEligible).toBe(!assisted);
      expect(result.secondary).toBe(Math.round(sim.completionTime * 1000));
      expect(await request(`${path}/runs/${run.id}/finish`, a, { seq })).toEqual(result);
      return result.secondary;
    };
    await runOnce(0, true);
    expect((await request(path + '/leaderboards/level-corridor-01', a)).me).toBeNull();
    expect((await request(path + '/leaderboards/clears', a)).me.score).toBe(1);
    const first = await runOnce(2),
      slower = await runOnce(5);
    expect(slower).toBeGreaterThan(first);
    expect((await request(path + '/leaderboards/level-corridor-01', a)).me.secondary).toBe(first);
    const best = await runOnce(0);
    expect(best).toBeLessThan(first);
    const board = await request(path + '/leaderboards/level-corridor-01', a);
    expect(board.me.playerId).toBe(a.playerId);
    expect(board.me.secondary).toBe(best);
    expect(
      board.top.filter((row: { playerId: string }) => row.playerId === a.playerId),
    ).toHaveLength(1);
    expect((await request(path + '/leaderboards/level-ambush-02', a)).me).toBe(null);
    expect((await request(path + '/leaderboards/clears', a)).me.score).toBe(1);
    expect((await request(path + '/leaderboards/points', a)).me.score).toBe(400);
    expect((await request(path + '/history', a)).summary.games).toBe(0);
  });
});
