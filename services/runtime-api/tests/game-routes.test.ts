import Fastify from 'fastify';
import { afterEach, expect, it, vi } from 'vitest';
import { registerCompetition } from '../src/competition/routes.js';
import { CompetitionError } from '../src/competition/types.js';
import type { createCompetitionStore } from '../src/competition/store.js';
import { createRankedRuns } from '../src/competition/ranked-runs.js';
import type { RankedRule } from '../src/competition/ranked-types.js';
import { memoryRuns } from './ranked-fixture.js';

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
const token = 'a'.repeat(64);
it.each(['carding-car', 'wulong-city'])(
  'basic %s metadata does not invent ranked rules',
  async (game) => {
    const { app } = await setup(false, false, game);
    const headers = { authorization: 'Bearer ' + token };
    const result = await app.inject({ url: '/api/competition/v1/games/' + game, headers });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({
      game,
      boards: [],
      capabilities: { identity: true, leaderboards: false, multiplayer: false },
    });
    const board = await app.inject({
      url: `/api/competition/v1/games/${game}/leaderboards/versus`,
      headers,
    });
    expect(board.statusCode).toBe(404);
    const run = await app.inject({
      method: 'POST',
      url: `/api/competition/v1/games/${game}/runs`,
      headers,
      payload: { board: 'versus' },
    });
    expect(run.statusCode).toBe(404);
  },
);
async function setup(dual = false, conflict = false, scope = 'tower-brake') {
  const url = new URL('../rules/ranked-games.mjs', import.meta.url).href;
  const imported = (await import(url)) as { rankedRules: RankedRule[] };
  const rankedRules = imported.rankedRules.map((rule) => ({ ...rule, boards: [...rule.boards] }));
  if (conflict)
    rankedRules[1] = {
      ...rankedRules[1]!,
      boards: [...rankedRules[1]!.boards, { ...rankedRules[1]!.boards[0]!, id: 'versus' }],
    };
  const ranked = createRankedRuns(
    memoryRuns().repository,
    new Map(rankedRules.map((rule) => [rule.id, rule])),
    async () => ({ authenticated: true }),
  );
  const identity = vi.fn(async (value: string) => {
    if (value !== token) throw new CompetitionError('SESSION_EXPIRED', 401);
    return { playerId: 'member-player', game: scope };
  });
  const roomAction = vi.fn(async (_player, _code, _operation, input) => ({ game: input.game }));
  const ranking = vi.fn(async () => ({ top: [], me: null }));
  const board = vi.fn(async () => ({ top: [], me: null }));
  const store = {
    auth: identity,
    create: vi.fn(async () => ({ code: '123456' })),
    roomAction,
    ranking,
    board,
    identityDetails: async (id: string | null) => ({
      kind: id ? 'guest' : 'anonymous',
      authenticated: true,
      provider: null,
      playerId: id,
    }),
    gameDefinitions: () => [
      { id: 'duel', title: 'Duel', version: 'v1' },
      ...(dual ? [{ id: 'tower-brake', title: 'Tower', version: 'duel-v1' }] : []),
    ],
  } as unknown as ReturnType<typeof createCompetitionStore>;
  const app = Fastify();
  apps.push(app);
  await registerCompetition(app, store, {}, undefined, undefined, ranked);
  return { app, roomAction, ranking, board };
}
it('limits password room routes before the store without throttling action polling', async () => {
  const { app, roomAction } = await setup(true);
  const base = '/api/competition/v1/games/tower-brake';
  const headers = { authorization: 'Bearer ' + token };
  for (const [url, payload] of [
    ['/rooms', { visibility: 'private', password: 'secret' }],
    ['/rooms/join', { code: '123456', password: 'secret' }],
    ['/rooms/123456/spectate', { password: 'secret' }],
  ] as const) {
    for (let i = 0; i < 20; i++)
      expect(
        (await app.inject({ method: 'POST', url: base + url, headers, payload })).statusCode,
      ).toBe(200);
    const denied = await app.inject({ method: 'POST', url: base + url, headers, payload });
    expect(denied.statusCode).toBe(429);
    expect(denied.json()).toEqual({ error: 'RATE_LIMITED' });
  }
  expect(roomAction).toHaveBeenCalledTimes(40);
  for (let seq = 1; seq <= 25; seq++)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: base + '/rooms/123456/actions',
          headers,
          payload: { seq, action: { commands: [] } },
        })
      ).statusCode,
    ).toBe(200);
});
it('public metadata and boards distinguish anonymous identity; expired credentials are not silently anonymous', async () => {
  const { app, ranking } = await setup();
  const path = '/api/competition/v1/games/tower-brake';
  expect((await app.inject({ url: path })).statusCode).toBe(401);
  const metadata = await app.inject({ url: path, headers: { authorization: 'Bearer ' + token } });
  expect(metadata.statusCode).toBe(200);
  expect(metadata.json().identity).toMatchObject({ kind: 'guest', authenticated: true });
  expect(metadata.json().boards.map((board: { id: string }) => board.id)).toEqual([
    'campaign',
    'endless',
  ]);
  expect(
    (await app.inject({ url: path, headers: { authorization: 'Bearer ' + token } })).json().identity
      .kind,
  ).toBe('guest');
  expect(
    (await app.inject({ url: path, headers: { authorization: 'Bearer ' + 'b'.repeat(64) } }))
      .statusCode,
  ).toBe(401);
  expect(
    (
      await app.inject({
        url: path + '/leaderboards/endless',
        headers: { authorization: 'Bearer ' + token },
      })
    ).statusCode,
  ).toBe(200);
  expect(ranking).toHaveBeenCalledWith('tower-brake:endless:tower-ranked-v2', {
    playerId: 'member-player',
    game: 'tower-brake',
  });
  expect(
    (
      await app.inject({
        url: path + '/leaderboards/forged',
        headers: { authorization: 'Bearer ' + token },
      })
    ).statusCode,
  ).toBe(404);
});
it('a game can combine solo boards and multiplayer through one gateway, with explicit board conflict rejection', async () => {
  const { app, board, roomAction } = await setup(true);
  const base = '/api/competition/v1/games/tower-brake';
  const response = await app.inject({ url: base, headers: { authorization: 'Bearer ' + token } });
  expect(response.json().capabilities).toEqual({
    identity: true,
    leaderboards: true,
    multiplayer: true,
  });
  expect(response.json().versions).toEqual({ ranked: 'tower-ranked-v2', multiplayer: 'duel-v1' });
  expect(response.json().boards.map((item: { id: string }) => item.id)).toEqual([
    'campaign',
    'endless',
    'versus',
  ]);
  expect(
    (
      await app.inject({
        url: base + '/leaderboards/versus',
        headers: { authorization: 'Bearer ' + token },
      })
    ).statusCode,
  ).toBe(200);
  expect(board).toHaveBeenCalledWith('tower-brake', {
    playerId: 'member-player',
    game: 'tower-brake',
  });
  expect(
    (
      await app.inject({
        url: base + '/rooms/ABCDEF123456',
        headers: { authorization: 'Bearer ' + token },
      })
    ).statusCode,
  ).toBe(200);
  expect(roomAction).toHaveBeenCalledWith(
    { playerId: 'member-player', game: 'tower-brake' },
    'ABCDEF123456',
    'get',
    {
      game: 'tower-brake',
    },
  );
  const conflicting = await setup(true, true);
  expect(
    (
      await conflicting.app.inject({ url: base, headers: { authorization: 'Bearer ' + token } })
    ).json(),
  ).toEqual({
    error: 'BOARD_CONFIGURATION_CONFLICT',
  });
});
it('writes require identity, refuse client result fields and expose game-scoped room aliases', async () => {
  const { app, roomAction } = await setup();
  const path = '/api/competition/v1/games/tower-brake';
  expect(
    (await app.inject({ method: 'POST', url: path + '/runs', payload: { board: 'endless' } }))
      .statusCode,
  ).toBe(401);
  const headers = { authorization: 'Bearer ' + token };
  expect(
    (
      await app.inject({
        method: 'POST',
        url: path + '/runs',
        headers,
        payload: { board: 'endless', score: 9999 },
      })
    ).statusCode,
  ).toBe(422);
  const created = await app.inject({
    method: 'POST',
    url: path + '/runs',
    headers,
    payload: { board: 'endless', version: 'tower-ranked-v2' },
  });
  expect(created.statusCode).toBe(200);
  const action = path + '/runs/' + created.json().id + '/actions';
  expect(
    (
      await app.inject({
        method: 'POST',
        url: action,
        headers,
        payload: { seq: 1, frames: [{ ticks: 0, input: { brake: true } }] },
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: action,
        headers,
        payload: { seq: 2, frames: [{ ticks: 0, input: { revive: true } }] },
      })
    ).statusCode,
  ).toBe(422);
  const response = await app.inject({
    method: 'POST',
    url: '/api/competition/v1/games/duel/rooms/ABCDEF123456/ready',
    headers,
    payload: {},
  });
  expect(response.statusCode).toBe(200);
  expect(roomAction).toHaveBeenCalledWith(
    { playerId: 'member-player', game: 'tower-brake' },
    'ABCDEF123456',
    'ready',
    {
      game: 'duel',
    },
  );
  expect(
    (await app.inject({ method: 'POST', url: path + '/rooms', headers, payload: {} })).statusCode,
  ).toBe(404);
});

it('ranked HTTP creation rejects legacy, mismatched and missing versions with an update error', async () => {
  const headers = { authorization: 'Bearer ' + token };
  for (const [game, version] of [
    ['cage-rescue', 'rescue-ranked-v2'],
    ['tower-brake', 'tower-ranked-v2'],
  ]) {
    const { app } = await setup(false, false, game);
    const url = `/api/competition/v1/games/${game}/runs`;
    for (const clientVersion of [undefined, '', `${version}-old`, `${version}-new`]) {
      const response = await app.inject({
        method: 'POST',
        url,
        headers,
        payload: {
          board: 'endless',
          ...(clientVersion === undefined ? {} : { version: clientVersion }),
        },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'RULE_VERSION_CHANGED' });
    }
    const response = await app.inject({
      method: 'POST',
      url,
      headers,
      payload: { board: 'endless', version },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().version).toBe(version);
  }
});
