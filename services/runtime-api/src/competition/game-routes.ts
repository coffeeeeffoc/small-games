import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CompetitionError } from './types.js';
import type { createCompetitionStore } from './store.js';
import type { createRankedStore } from './ranked-store.js';
import { assertGameScope, type PlayerAuth } from './auth.js';
import { basicServiceGames } from './service-games.js';

const gameId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,79}$/);
const roomCode = z.string().regex(/^[A-F0-9]{12}$/);
const gameParams = (params: unknown) => z.object({ game: gameId }).parse(params);
const runParams = (params: unknown) => z.object({ game: gameId, id: z.uuid() }).parse(params);
const frame = z
  .object({ ticks: z.number().int().min(0).max(2400), input: z.record(z.string(), z.unknown()) })
  .strict();

/** Shared gateway boundary: only the registered game adapter owns rules or simulation. */
export function registerGameRoutes(
  routes: FastifyInstance,
  store: ReturnType<typeof createCompetitionStore>,
  ranked: ReturnType<typeof createRankedStore>,
  player: (authorization: string | undefined) => Promise<PlayerAuth>,
) {
  function definition(game: string) {
    const solo = ranked.rules.get(game);
    const multiplayer = store.gameDefinitions().find((rule) => rule.id === game);
    const basic = Object.hasOwn(basicServiceGames, game) ? basicServiceGames[game] : undefined;
    if (!solo && !multiplayer && !basic) throw new CompetitionError('GAME_UNAVAILABLE', 404);
    const boards = [
      ...(solo?.boards ?? []),
      ...(multiplayer && !multiplayer.unrated
        ? [
            {
              id: 'versus',
              title: '好友对战榜',
              guestAllowed: true,
              description: multiplayer.description,
              scoreUnit: '分',
              secondaryUnit: 'rule-defined',
            },
          ]
        : []),
    ];
    if (new Set(boards.map((board) => board.id)).size !== boards.length)
      throw new CompetitionError('BOARD_CONFIGURATION_CONFLICT', 500);
    return {
      game,
      title: solo?.title ?? multiplayer?.title ?? basic,
      version: solo?.version ?? multiplayer?.version ?? 'identity-v1',
      versions: { ranked: solo?.version ?? null, multiplayer: multiplayer?.version ?? null },
      capabilities: { identity: true, leaderboards: boards.length > 0, multiplayer: !!multiplayer },
      boards,
    };
  }
  routes.get('/games/:game', async (request) => {
    const { game } = gameParams(request.params);
    const auth = await player(request.headers.authorization);
    assertGameScope(auth, game);
    return {
      ...definition(game),
      identity: await store.identityDetails(auth),
    };
  });
  routes.get('/games/:game/leaderboards/:board', async (request) => {
    const { game, board } = z.object({ game: gameId, board: gameId }).parse(request.params);
    const playerId = await player(request.headers.authorization);
    assertGameScope(playerId, game);
    definition(game);
    if (ranked.rules.get(game)?.boards.some((item) => item.id === board)) {
      const { key, rule, definition: boardDefinition } = ranked.boardFor(game, board);
      return {
        game,
        boardType: board,
        version: rule.version,
        ...boardDefinition,
        ...(await store.ranking(key, playerId)),
      };
    }
    if (!definition(game).boards.some((item) => item.id === board))
      throw new CompetitionError('BOARD_UNAVAILABLE', 404);
    return { ...(await store.board(game, playerId)), boardType: board };
  });
  routes.post(
    '/games/:game/runs',
    { bodyLimit: 2048, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const { game } = gameParams(request.params);
      const { board, levelId, version } = z
        .object({
          board: gameId,
          levelId: z.string().max(100).optional(),
          version: z.string().max(100).optional(),
        })
        .strict()
        .parse(request.body);
      return ranked.create(
        await player(request.headers.authorization),
        game,
        board,
        levelId,
        version,
      );
    },
  );
  routes.get('/games/:game/runs/:id', async (request) => {
    const { game, id } = runParams(request.params);
    return ranked.get(await player(request.headers.authorization), game, id);
  });
  routes.post('/games/:game/runs/:id/actions', { bodyLimit: 160000 }, async (request) => {
    const { game, id } = runParams(request.params);
    const input = z
      .object({
        seq: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        frames: z.array(frame).min(1).max(1200),
      })
      .strict()
      .parse(request.body);
    return ranked.actions(await player(request.headers.authorization), game, id, input);
  });
  routes.post('/games/:game/runs/:id/finish', { bodyLimit: 1024 }, async (request) => {
    const { game, id } = runParams(request.params);
    const { seq } = z
      .object({ seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) })
      .strict()
      .parse(request.body);
    return ranked.finish(await player(request.headers.authorization), game, id, seq);
  });
  const multiplayerGame = (params: unknown) => {
    const { game } = gameParams(params);
    if (!definition(game).capabilities.multiplayer)
      throw new CompetitionError('MULTIPLAYER_UNAVAILABLE', 404);
    return game;
  };
  routes.post('/games/:game/match', { bodyLimit: 1024 }, async (request) => {
    const game = multiplayerGame(request.params);
    z.object({})
      .strict()
      .parse(request.body ?? {});
    return store.match(await player(request.headers.authorization), game);
  });
  routes.post('/games/:game/rooms', { bodyLimit: 2048 }, async (request) => {
    const game = multiplayerGame(request.params);
    const input = z
      .object({
        mode: z.string().max(40).optional(),
        role: z.string().max(40).optional(),
        initiative: z.string().max(40).optional(),
      })
      .strict()
      .parse(request.body ?? {});
    return store.create(await player(request.headers.authorization), game, input);
  });
  routes.post('/games/:game/rooms/join', { bodyLimit: 1024 }, async (request) => {
    const game = multiplayerGame(request.params);
    const { code } = z.object({ code: roomCode }).strict().parse(request.body);
    return store.roomAction(await player(request.headers.authorization), code, 'join', { game });
  });
  routes.get('/games/:game/rooms/:code', async (request) => {
    const game = multiplayerGame(request.params);
    const { code } = z.object({ code: roomCode }).parse(request.params);
    return store.roomAction(await player(request.headers.authorization), code, 'get', { game });
  });
  for (const operation of ['ready', 'leave', 'rematch', 'actions', 'role', 'initiative']) {
    routes.post(`/games/:game/rooms/:code/${operation}`, { bodyLimit: 8192 }, async (request) => {
      const game = multiplayerGame(request.params);
      const { code } = z.object({ code: roomCode }).parse(request.params);
      const input =
        operation === 'actions'
          ? z
              .object({
                seq: z.number().int().positive().max(100000),
                action: z.record(z.string(), z.unknown()),
              })
              .strict()
              .parse(request.body)
          : operation === 'role'
            ? z
                .object({ role: z.string().max(40) })
                .strict()
                .parse(request.body)
            : operation === 'initiative'
              ? z
                  .object({ initiative: z.string().max(40) })
                  .strict()
                  .parse(request.body)
              : z
                  .object({})
                  .strict()
                  .parse(request.body ?? {});
      if (
        'action' in input &&
        Object.keys(input.action).some((key) =>
          ['score', 'elapsed', 'elapsedMs', 'moves', 'playerId'].includes(key),
        )
      )
        throw new CompetitionError('ILLEGAL_ACTION', 422);
      return store.roomAction(await player(request.headers.authorization), code, operation, {
        ...input,
        game,
      });
    });
  }
}
