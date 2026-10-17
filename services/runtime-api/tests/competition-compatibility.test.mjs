import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import Fastify from 'fastify';
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterEach, describe, expect, it } from 'vitest';
import { registerCompetition } from '../src/competition/routes.js';
import { createCompetitionStore } from '../src/competition/store.js';
import { publicRanking, publicRankingRow } from '../src/competition/profile.js';
import { pinnedCommit, pinnedRuntime } from './competition-compatibility-fixture.mjs';

const pinned = await pinnedRuntime();
const candidateClient = await readFile(
  new URL('../../../platforms/competition/client.js', import.meta.url),
  'utf8',
);
const apps = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));
const day = 86400_000;
const uuid = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const rule = {
  id: 'xiangqi-five',
  version: 'compat-fixture-v1',
  title: 'Compatibility fixture',
  description: 'Fixture rule; no gameplay acceptance claimed',
  durationMs: 60000,
  initial: () => ({}),
  action: (state) => state,
  view: () => ({}),
  result: () => ({ finished: false, eligible: false, score: 0, secondary: 0 }),
};

/** SQL adapter only; executes the actual pinned/candidate stores, never claims PG semantics. */
function memoryDatabase(clock) {
  const players = new Map(),
    sessions = new Map(),
    refresh = new Map(),
    rooms = new Map();
  let ranked = [];
  const db = {
    transaction: async (change) => change(db),
    async execute(query) {
      const { sql, params: p } = new PgDialect().sqlToQuery(query);
      if (sql.startsWith('insert into runtime.competition_players')) {
        const old = sql.includes('subject,created_at');
        players.set(p[0], {
          id: p[0],
          platform: old ? p[1] : 'guest',
          app_id: old ? p[2] : p[1],
          created_at: old ? p[4] : p[2],
          display_name: null,
          profile: { source: 'default' },
        });
        return [{ id: p[0] }];
      }
      if (sql.startsWith('insert into runtime.competition_sessions')) {
        sessions.set(p[0], { player_id: p[1], expires_at: p[2] });
        return [];
      }
      if (sql.startsWith('insert into runtime.competition_refresh_tokens')) {
        refresh.set(p[0], { id: p[1], expires_at: p[2] });
        return [];
      }
      if (sql.startsWith('select player_id from runtime.competition_sessions')) {
        const found = sessions.get(p[0]);
        return found?.expires_at > clock.time ? [found] : [];
      }
      if (sql.includes('from runtime.competition_sessions s join runtime.competition_players p')) {
        const found = sessions.get(p[0]);
        return found?.expires_at > clock.time
          ? [{ ...players.get(found.player_id), expires_at: found.expires_at }]
          : [];
      }
      if (sql.startsWith('select 1 from runtime.competition_sessions')) {
        const found = sessions.get(p[0]);
        return found?.expires_at > clock.time && found.player_id === p[1] ? [{ ok: 1 }] : [];
      }
      if (
        sql.includes('join runtime.competition_refresh_tokens') ||
        sql.startsWith('select r.expires_at')
      ) {
        const found = refresh.get(p[0]);
        return found && found.expires_at > clock.time
          ? [{ ...found, ...players.get(found.id) }]
          : [];
      }
      if (sql.startsWith('select id,platform,display_name,profile'))
        return [players.get(p[0])].filter(Boolean);
      if (sql.startsWith('select id,platform,app_id,created_at'))
        return [players.get(p[0])].filter(Boolean);
      if (sql.startsWith('select profile from runtime.competition_players'))
        return [players.get(p[0])].filter(Boolean);
      if (sql.startsWith('select id as "playerId"')) {
        const player = players.get(p[0]);
        return player ? [{ playerId: player.id, name: player.display_name ?? '新玩家' }] : [];
      }
      if (sql.startsWith('update runtime.competition_players set')) {
        const player = players.get(p.at(-1));
        player.display_name = p[0];
        if (sql.includes('profile=')) player.profile = JSON.parse(p[1]);
        return [];
      }
      if (sql.startsWith('with ranked as')) {
        const mine = ranked.find((row) => row.playerId === p[1]);
        return ranked.filter(
          (row) =>
            row.position <= 100 || row === mine || (mine && row.position === mine.position - 1),
        );
      }
      if (sql.startsWith('insert into runtime.competition_rooms')) {
        rooms.set(p[0], JSON.parse(p[1]));
        return [];
      }
      if (sql.startsWith('select data from runtime.competition_rooms'))
        return rooms.has(p[0]) ? [{ data: structuredClone(rooms.get(p[0])) }] : [];
      if (sql.startsWith('select id,display_name,profile'))
        return p.map((id) => players.get(id)).filter(Boolean);
      if (sql.startsWith('select id,coalesce(display_name'))
        return p.map((id) => ({ id, name: players.get(id)?.display_name ?? '新玩家' }));
      if (sql.startsWith('update runtime.competition_rooms')) {
        rooms.set(p.at(-1), JSON.parse(p[0]));
        return [];
      }
      throw new Error(`Unimplemented fixture SQL: ${sql}`);
    },
  };
  return {
    db,
    players,
    rooms,
    setRanked: (rows) => {
      ranked = rows;
    },
  };
}

async function server(version, clock) {
  const memory = memoryDatabase(clock);
  const store = (version === 'old' ? pinned.store.createCompetitionStore : createCompetitionStore)(
    memory.db,
    new Map([[rule.id, rule]]),
    () => clock.time,
  );
  const app = Fastify();
  apps.push(app);
  await (version === 'old' ? pinned.routes.registerCompetition : registerCompetition)(
    app,
    store,
    {},
  );
  return { app, store, memory };
}

function client(source, app, clock) {
  const calls = [],
    storage = new Map();
  class ClockDate extends Date {
    static now() {
      return clock.time;
    }
  }
  const context = {
    URL,
    Date: ClockDate,
    setTimeout,
    clearTimeout,
    AbortSignal,
    location: new URL('https://compat.invalid/play'),
    localStorage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
    },
    fetch: async (url, init) => {
      const pathname = new URL(url).pathname;
      calls.push({ path: pathname, body: init.body });
      const response = await app.inject({
        method: init.method,
        url: pathname,
        headers: init.headers,
        ...(init.body ? { payload: init.body } : {}),
      });
      return { status: response.statusCode, json: async () => response.json() };
    },
  };
  runInNewContext(source, context);
  context.__installCompetition({
    game: rule.id,
    platform: 'h5',
    apiUrl: 'https://compat.invalid/api/competition/v1',
  });
  return { api: context.__competition, calls, storage };
}

function assertCredential(value) {
  assert.match(value.playerId, /^[a-f0-9-]{36}$/);
  assert.equal(typeof value.token, 'string');
  assert.equal(value.token.length, 64);
  assert.equal(typeof value.expiresAt, 'number');
}
function assertProfile(value, owner) {
  assert.equal(value.playerId, owner);
  assert.equal(typeof value.name, 'string');
}
function assertBoard(value) {
  assert.equal(typeof value.board, 'string');
  assert.ok(Array.isArray(value.top));
  for (const key of ['me', 'previous', 'threshold', 'gap']) assert.ok(Object.hasOwn(value, key));
  assert.equal(typeof value.eligiblePlayers, 'number');
}
function assertRoom(value, owner) {
  assert.match(value.code, /^[A-F0-9]{12}$/);
  assert.equal(typeof value.you, 'number');
  assert.equal(value.players[0].id, owner);
  assert.equal(typeof value.players[0].name, 'string');
  assert.equal(typeof value.deadline, 'number');
  assert.equal(value.status, 'waiting');
}

describe('fixed 26756c80 H5 and Runtime wire compatibility (in-memory SQL, no PG claim)', () => {
  it('records the exact old source and actual dependency bindings', () => {
    expect(pinned.manifest.commit).toBe(pinnedCommit);
    expect(
      pinned.manifest.files['services/runtime-api/src/competition/store.ts'].sourceSha256,
    ).toMatch(/^[a-f0-9]{64}$/);
    expect(
      pinned.manifest.files['services/runtime-api/src/competition/routes.ts'].sourceSha256,
    ).toMatch(/^[a-f0-9]{64}$/);
    expect(pinned.manifest.dependencies.zod.resolved).toContain('zod');
  });
  for (const service of ['old', 'candidate'])
    for (const consumer of ['old', 'candidate']) {
      it(`${consumer} H5 × ${service} Runtime enforces explicit login while retaining the pinned old wire contract`, async () => {
        const clock = { time: 1_800_000_000_000 };
        const { app } = await server(service, clock);
        const { api } = client(consumer === 'old' ? pinned.client : candidateClient, app, clock);
        if (service === 'candidate' || consumer === 'candidate') {
          await expect(api.session()).rejects.toBeDefined();
          expect((await app.inject('/api/competition/v1/me')).statusCode).toBe(401);
          return;
        }
        const credential = await api.session();
        assertCredential(credential);
        const owner = credential.playerId;
        assertProfile(await api.request('/me'), owner);
        const renamed = await api.request('/me', { body: JSON.stringify({ name: '旧版玩家' }) });
        assertProfile(renamed, owner);
        expect(renamed.name).toBe('旧版玩家');
        assertBoard(await api.request(`/boards/${rule.id}`));
        const room = await api.request('/rooms', { body: JSON.stringify({ game: rule.id }) });
        assertRoom(room, owner);
        expect((await api.request(`/rooms/${room.code}`)).players[0].id).toBe(owner);
        clock.time += day + 1000;
        expect((await api.session()).playerId).toBe(owner);
        assertProfile(await api.request('/me'), owner);
        if (service === 'old') {
          for (const path of ['/sessions/refresh', '/sessions/upgrade']) {
            const unsupported = await app.inject({
              method: 'POST',
              url: `/api/competition/v1${path}`,
              payload: {},
            });
            expect(unsupported.statusCode).toBe(404);
          }
        }
      });
    }
  it('candidate client never silently replaces its owner when old Runtime cannot refresh at expiry', async () => {
    const clock = { time: 1_800_000_000_000 };
    const { app } = await server('old', clock);
    const { api, calls } = client(candidateClient, app, clock);
    await expect(api.session()).rejects.toMatchObject({ code: 'LOGIN_REQUIRED' });
    expect(calls).toHaveLength(0);
  });
  it('missing fields, changed types and changed HTTP error codes fail the compatibility contract', async () => {
    for (const broken of [
      { token: 'a'.repeat(64), expiresAt: 1 },
      { playerId: uuid(1), token: 'a'.repeat(64), expiresAt: '1' },
    ])
      expect(() => assertCredential(broken)).toThrow();
    expect(() => assertProfile({ playerId: uuid(1) }, uuid(1))).toThrow();
    expect(() => assertBoard({ board: 'x', top: [], eligiblePlayers: '0' })).toThrow();
    expect(() =>
      assertRoom(
        {
          code: 'ABCDEFABCDEF',
          you: '0',
          players: [{ id: uuid(1), name: 'x' }],
          deadline: 1,
          status: 'waiting',
        },
        uuid(1),
      ),
    ).toThrow();
    for (const version of ['old', 'candidate']) {
      const { app } = await server(version, { time: 1_800_000_000_000 });
      const response = await app.inject('/api/competition/v1/me');
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'SESSION_EXPIRED' });
      const contract = (status, data) => {
        assert.equal(status, 401);
        assert.equal(data.error, 'SESSION_EXPIRED');
      };
      expect(() => contract(403, response.json())).toThrow();
      expect(() => contract(401, { error: 'INVALID_SESSION' })).toThrow();
    }
  });
});

const privateCanary = {
  privateCanary: 'PRIVATE_CANARY',
  subject: 'PRIVATE_CANARY_SUBJECT',
  openid: 'PRIVATE_CANARY_OPENID',
  appId: 'PRIVATE_CANARY_APP',
  token: 'PRIVATE_CANARY_TOKEN',
  ip: 'PRIVATE_CANARY_IP',
  latitude: 'PRIVATE_CANARY_LAT',
  longitude: 'PRIVATE_CANARY_LON',
  internalId: 'PRIVATE_CANARY_LINK',
};
const rowKeys = [
  'userId',
  'playerId',
  'nickname',
  'name',
  'avatarId',
  'avatarUrl',
  'region',
  'profileSource',
  'profileUpdatedAt',
  'score',
  'secondary',
  'rank',
  'position',
  'total',
].sort();
function assertPublicRow(row) {
  expect(Object.keys(row).sort()).toEqual(rowKeys);
  expect(row.userId).toBe(row.playerId);
  expect(JSON.stringify(row)).not.toContain('PRIVATE_CANARY');
}

describe('explicit public profile white lists and persisted room results', () => {
  it('drops malformed persisted ranking rows without coercion or nonfinite JSON numbers', () => {
    const valid = {
      playerId: uuid(1),
      name: '玩家甲',
      score: 3,
      secondary: 0,
      rank: 1,
      position: 1,
      total: 2,
      profileSource: { toString: null },
    };
    const malformed = [
      null,
      false,
      1,
      'row',
      [],
      {},
      { ...valid, playerId: { toString: null } },
      { ...valid, playerId: 'not-a-uuid' },
      ...['score', 'secondary', 'rank', 'position', 'total'].flatMap((key) =>
        [undefined, '1', NaN, Infinity, { toString: null }].map((value) => ({
          ...valid,
          [key]: value,
        })),
      ),
    ];
    for (const row of malformed) expect(publicRankingRow(row)).toBeNull();
    expect(publicRankingRow(valid)).toMatchObject({
      playerId: valid.playerId,
      score: 3,
      profileSource: 'legacy',
    });
    expect(
      publicRanking({
        top: [valid, ...malformed],
        me: malformed[6],
        previous: null,
        threshold: {},
      }),
    ).toMatchObject({ top: [publicRankingRow(valid)], me: null, previous: null, threshold: null });
  });
  it('protects anonymous/self/other board views with populated top/me/previous/threshold', async () => {
    const clock = { time: 1_800_000_000_000 };
    const { store, memory } = await server('candidate', clock);
    const rows = Array.from({ length: 102 }, (_, index) => ({
      ...privateCanary,
      playerId: uuid(index + 1),
      display_name: `玩家${index + 1}`,
      profile: {
        avatarUrl: 'https://img.tapimg.net/a.png',
        region: { country: '中国', province: '广东' },
        source: 'user-authorized',
        updatedAt: 1,
        ...privateCanary,
      },
      score: 102 - index,
      secondary: 0,
      rank: index + 1,
      position: index + 1,
      total: 102,
    }));
    memory.setRanked(rows);
    await expect(store.board(rule.id, null)).rejects.toMatchObject({ code: 'LOGIN_REQUIRED' });
    for (const owner of [uuid(102), uuid(101)]) {
      const board = await store.board(rule.id, owner);
      for (const row of [...board.top, board.me, board.previous, board.threshold].filter(Boolean))
        assertPublicRow(row);
      expect(JSON.stringify(board)).not.toContain('PRIVATE_CANARY');
      if (owner === uuid(102)) {
        expect(board.me.position).toBe(102);
        expect(board.previous.position).toBe(101);
        expect(board.threshold.position).toBe(100);
      }
    }
    const snapshots = rows.map((row) => ({
      ...row,
      ...publicRankingRow({ ...row, name: row.display_name }),
      ...privateCanary,
    }));
    for (const player of rows.slice(-2))
      memory.players.set(player.playerId, { id: player.playerId, ...player });
    const ranking = {
      ...privateCanary,
      board: 'compat-board',
      top: snapshots.slice(0, 100),
      me: snapshots[101],
      previous: snapshots[100],
      threshold: snapshots[99],
      gap: { score: 1, secondary: 0, ...privateCanary },
      eligiblePlayers: 102,
      reason: null,
    };
    const result = {
      finished: true,
      eligible: true,
      score: 3,
      secondary: 0,
      correct: 17,
      accuracy: 9000,
      assisted: 1,
      ...privateCanary,
    };
    memory.rooms.set('ABCDEFABCDEF', {
      code: 'ABCDEFABCDEF',
      game: rule.id,
      version: rule.version,
      status: 'finished',
      seed: 1,
      deadline: clock.time + day,
      players: rows.slice(-2).map((player) => ({
        id: player.playerId,
        ready: true,
        seq: 0,
        state: null,
        result,
        ...privateCanary,
      })),
      results: rows.slice(-2).map((player) => ({
        userId: player.playerId,
        playerId: player.playerId,
        result,
        before: snapshots[101],
        after: ranking,
        rated: true,
        reason: null,
        ...privateCanary,
      })),
    });
    for (const owner of [uuid(101), uuid(102)]) {
      const room = await store.roomAction(owner, 'ABCDEFABCDEF', 'get');
      expect(JSON.stringify(room)).not.toContain('PRIVATE_CANARY');
      for (const entry of room.results) {
        expect(entry.userId).toBe(entry.playerId);
        assertPublicRow(entry.before);
        for (const row of [
          ...entry.after.top,
          entry.after.me,
          entry.after.previous,
          entry.after.threshold,
        ])
          assertPublicRow(row);
        expect(entry.result).toEqual({
          finished: true,
          eligible: true,
          score: 3,
          secondary: 0,
          correct: 17,
          accuracy: 9000,
          assisted: 1,
        });
      }
    }
    await expect(store.roomAction(uuid(999), 'ABCDEFABCDEF', 'get')).rejects.toMatchObject({
      code: 'NOT_A_MEMBER',
    });
  });
});
