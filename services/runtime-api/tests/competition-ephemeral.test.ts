import Fastify from 'fastify';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { createCompetitionStore } from '../src/competition/store.js';
import { createCompetitionIdentities } from '../src/competition/identity-store.js';
import { assertGameScope, assertResourceAuth, EPHEMERAL_GAMES } from '../src/competition/auth.js';
import { registerCompetition } from '../src/competition/routes.js';
import { createRankedStore } from '../src/competition/ranked-store.js';
import { createCarromStore } from '../src/carrom/store.js';
import { createThreeChooseTwoStore } from '../src/three-choose-two/store.js';
import type { Rule } from '../src/competition/types.js';
import type { Engine as TctEngine } from '../src/three-choose-two/types.js';
import type { Engine as CarromEngine } from '../src/carrom/types.js';
import { fixture } from './competition-ephemeral-fixture.js';

it('caps ephemeral access at 15min and both renew paths at the original eight-hour identity deadline', async () => {
  const f = fixture(),
    identity = createCompetitionIdentities(f.db, f.now),
    created = f.now();
  const first = await identity.guestSession(undefined, 2, 'xiangqi-five');
  expect(first).toMatchObject({
    identityMode: 'ephemeral',
    game: 'xiangqi-five',
    identityKind: 'guest',
    identityExpiresAt: created + 8 * 3600_000,
    refreshExpiresAt: created + 8 * 3600_000,
    expiresAt: created + 15 * 60_000,
  });
  expect(f.players.get(first.userId)!.app_id).toBe('xiangqi-five');
  f.at(created + 7 * 3600_000 + 50 * 60_000);
  const refreshed = await identity.refreshSession(first.refreshToken);
  expect(refreshed.userId).toBe(first.userId);
  expect(refreshed.expiresAt).toBe(first.identityExpiresAt);
  f.at(created + 7 * 3600_000 + 55 * 60_000);
  const renewed = await identity.renewGuestSession(refreshed.token);
  expect(renewed.userId).toBe(first.userId);
  expect(renewed.refreshExpiresAt).toBe(first.identityExpiresAt);
  expect(renewed.expiresAt).toBe(first.identityExpiresAt);
  f.at(first.identityExpiresAt!);
  await expect(identity.refreshSession(first.refreshToken)).rejects.toMatchObject({
    code: 'REFRESH_EXPIRED',
  });
  await expect(identity.renewGuestSession(renewed.token)).rejects.toMatchObject({
    code: 'SESSION_EXPIRED',
  });
  expect(f.players.size).toBe(1);
});
it('preserves persistent guest lifetimes, rejects unknown guest app IDs and never scopes platform app IDs', async () => {
  const f = fixture(),
    identity = createCompetitionIdentities(f.db, f.now);
  const legacy = await identity.guestSession(),
    v2 = await identity.guestSession(undefined, 2);
  expect(legacy.expiresAt - f.now()).toBe(180 * 86400_000);
  expect(v2.expiresAt - f.now()).toBe(86400_000);
  expect(legacy.identityMode).toBe('persistent');
  const row = f.players.get(v2.userId)!;
  row.app_id = 'unexpected';
  await expect(identity.auth(v2.token)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  await expect(identity.refreshSession(v2.refreshToken)).rejects.toMatchObject({
    code: 'SESSION_EXPIRED',
  });
  await expect(identity.renewGuestSession(v2.token)).rejects.toMatchObject({
    code: 'SESSION_EXPIRED',
  });
  row.platform = 'taptap';
  row.app_id = 'cops-robbers';
  expect((await identity.auth(v2.token)).guestGameScope).toBe(null);
});
it('freezes initial scope across upgrade and rechecks revoked bearer under the player lock', async () => {
  const f = fixture(),
    identity = createCompetitionIdentities(f.db, f.now);
  const first = await identity.guestSession(undefined, 2, 'cops-robbers');
  const auth = await identity.auth(first.token);
  expect(Object.isFrozen(auth)).toBe(true);
  expect(JSON.stringify(auth)).not.toMatch(/token|hash|proof|subject/i);
  f.players.get(first.userId)!.platform = 'taptap';
  f.sessions.delete(createHash('sha256').update(first.token).digest('hex'));
  expect(() => assertGameScope(auth, 'xiangqi-five')).toThrow('IDENTITY_SCOPE_MISMATCH');
  await expect(
    f.db.transaction((tx) => assertResourceAuth(tx, auth, 'cops-robbers', f.now())),
  ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  expect(f.queries.at(-2)!.sql).toContain('for no key update');
});
it('strict ephemeral HTTP admission accepts only the three exact games and no owner/install overrides', async () => {
  const f = fixture(),
    store = createCompetitionStore(f.db, new Map(), f.now),
    app = Fastify();
  await registerCompetition(app, store, {});
  try {
    for (const game of EPHEMERAL_GAMES) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/competition/v1/sessions/guest',
        payload: { identityVersion: 2, identityMode: 'ephemeral', game },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().game).toBe(game);
    }
    for (const extra of [
      { game: 'carrom-club' },
      { game: 'cops-robbers/' },
      { identityVersion: 1 },
      { installationId: '00000000-0000-4000-8000-000000000001' },
      { userId: 'victim' },
      { identityMode: 'persistent' },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/competition/v1/sessions/guest',
        payload: { identityVersion: 2, identityMode: 'ephemeral', game: 'cops-robbers', ...extra },
      });
      expect(response.statusCode).toBe(422);
    }
    expect(f.players.size).toBe(3);
  } finally {
    await app.close();
  }
});
it.each(EPHEMERAL_GAMES)(
  'denies %s credentials across actual resources and all fast paths',
  async (game) => {
    const f = fixture();
    const rules = new Map(
      EPHEMERAL_GAMES.map((id) => [
        id,
        {
          id,
          version: 'fixture',
          title: id,
          durationMs: 1000,
          initial: () => ({}),
          action: (s) => s,
          view: (s) => s,
          result: () => ({ finished: false, eligible: false, score: 0, secondary: 0 }),
        } satisfies Rule,
      ]),
    );
    const store = createCompetitionStore(f.db, rules, f.now),
      guest = await store.guestSession(undefined, 2, game);
    const ranked = createRankedStore(
      f.db,
      new Map([
        [
          'cage-rescue',
          {
            id: 'cage-rescue',
            title: 'fixture',
            version: 'v1',
            boards: [
              {
                id: 'solo',
                title: 'solo',
                description: 'fixture',
                guestAllowed: true,
                scoreUnit: 'score',
                secondaryUnit: 'milliseconds',
              },
            ],
            create: () => ({}),
            apply: (s) => s,
            result: () => ({ complete: false, eligible: false, score: 0, secondary: 0 }),
          },
        ],
      ]),
      store.identityDetails,
      f.now,
    );
    const carrom = createCarromStore(f.db, {} as CarromEngine, [], f.now);
    const tct = createThreeChooseTwoStore(f.db, {} as TctEngine, f.now);
    const app = Fastify(),
      key = 'k'.repeat(32),
      headers = { authorization: `Bearer ${guest.token}` };
    await registerCompetition(app, store, { COMPETITION_INTERNAL_KEY: key }, tct, carrom, ranked);
    const other = EPHEMERAL_GAMES.find((id) => id !== game)!;
    const code = 'AABBCCDDEEFF',
      id = '00000000-0000-4000-8000-000000000001';
    f.rooms.set(code, {
      game: other,
      version: 'fixture',
      status: 'finished',
      players: [{ id: guest.userId }],
      results: [],
      code,
    });
    f.tct({ id, playerId: guest.userId, status: 'finished', settlement: { pendingReview: true } });
    try {
      const attempts: [string, string, unknown?][] = [
        ['GET', `/boards/${other}`],
        ['POST', '/rooms', { game: other }],
        ['GET', `/rooms/${code}`],
        ['POST', '/rooms/join', { code }],
        ['GET', `/games/${other}`],
        ['GET', `/games/${other}/leaderboards/versus`],
        ['GET', '/games/cage-rescue/leaderboards/solo'],
        ['GET', `/games/${game}/rooms/${code}`],
        ['POST', `/games/${game}/rooms/join`, { code }],
        ['POST', '/games/cage-rescue/runs', { board: 'solo', version: 'v1' }],
        ['GET', `/games/cage-rescue/runs/${id}`],
        [
          'POST',
          `/games/cage-rescue/runs/${id}/actions`,
          { seq: 1, frames: [{ ticks: 1, input: {} }] },
        ],
        ['POST', `/games/cage-rescue/runs/${id}/finish`, { seq: 0 }],
        ['POST', '/carrom/rooms', {}],
        ['POST', '/carrom/rooms/join', { code }],
        ['GET', `/carrom/rooms/${code}`],
        ['POST', '/three-choose-two/session', {}],
        ['GET', `/three-choose-two/session/${id}`],
        [
          'POST',
          `/three-choose-two/session/${id}/actions`,
          { seq: 1, group: 1, slot: 0, x: 0, y: 0 },
        ],
        ['POST', `/three-choose-two/session/${id}/finish`, {}],
        ['GET', '/three-choose-two/board'],
      ];
      for (const op of ['ready', 'leave', 'rematch', 'actions', 'role', 'initiative']) {
        const body =
          op === 'actions'
            ? { seq: 1, action: {} }
            : op === 'role'
              ? { role: 'pursuer' }
              : op === 'initiative'
                ? { initiative: 'pursuer' }
                : {};
        attempts.push(
          ['POST', `/rooms/${code}/${op}`, body],
          ['POST', `/games/${game}/rooms/${code}/${op}`, body],
        );
      }
      if (game !== 'cops-robbers-realtime') {
        const query =
          'version=street-solo-v2&mode=challenge&role=cop&level=1&rule=standard&first=simultaneous';
        attempts.push(
          ['GET', `/runs/cops-robbers-realtime?${query}`],
          ['POST', `/runs/cops-robbers-realtime?${query}`, { ticks: 1, orders: [] }],
          ['POST', `/runs/cops-robbers-realtime/start?${query}`, {}],
        );
      }
      for (const [method, path, payload] of attempts) {
        const response = await app.inject({
          method: method as 'GET' | 'POST',
          url: '/api/competition/v1' + path,
          headers,
          ...(payload ? { payload } : {}),
        });
        expect(response.statusCode, `${method} ${path}: ${response.body}`).toBe(403);
        expect(response.json().error).toBe('IDENTITY_SCOPE_MISMATCH');
      }
      for (const [path, payload] of [
        ['/internal/verify', { token: guest.token }],
        [
          '/internal/kart-results',
          {
            matchId: id,
            board: 'carding-car-seaside-v1',
            entries: [{ playerId: guest.userId, elapsedMs: 1000 }],
            startedAt: f.now() - 2000,
            finishedAt: f.now(),
          },
        ],
        [
          `/internal/three-choose-two/sessions/${id}/review`,
          { decision: 'approve', reason: 'scope fixture' },
        ],
      ] as const) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/competition/v1' + path,
          headers: { 'x-competition-internal-key': key },
          payload,
        });
        expect(response.statusCode, response.body).toBe(403);
        expect(response.json().error).toBe('IDENTITY_SCOPE_MISMATCH');
      }
      const audit = await app.inject({
        method: 'GET',
        url: `/api/competition/v1/internal/three-choose-two/sessions/${id}`,
        headers: { 'x-competition-internal-key': key },
      });
      expect(audit.statusCode).toBe(403);
      expect(
        f.queries.filter((q) =>
          /insert into runtime.competition_results|update runtime.competition_rooms|update runtime.three_choose_two_sessions/.test(
            q.sql,
          ),
        ),
      ).toHaveLength(0);
    } finally {
      await app.close();
    }
  },
);
