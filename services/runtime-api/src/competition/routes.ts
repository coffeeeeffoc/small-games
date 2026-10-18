import type { FastifyInstance } from 'fastify';
import { registerCors } from '@coffeeeeffoc/service-kit';
import { readCompetitionCors } from '../config.js';
import rateLimit from '@fastify/rate-limit';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { registerCarromRoutes } from '../carrom/routes.js';
import type { createCarromStore } from '../carrom/store.js';
import { CompetitionError } from './types.js';
import { platformConfigSchema } from './platform-login.js';
import { registerRunRoutes } from './run-routes.js';
import {
  registerThreeChooseTwoRoutes,
  registerThreeChooseTwoInternalRoutes,
} from '../three-choose-two/routes.js';
import type { createThreeChooseTwoStore } from '../three-choose-two/store.js';
import type { createCompetitionStore } from './store.js';
import { registerGameRoutes } from './game-routes.js';
import type { createRankedStore } from './ranked-store.js';
import type { CompetitionControl } from './control.js';
import { registerIdentityRoutes } from './session-routes.js';

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const codeSchema = z.string().regex(/^[A-F0-9]{12}$/);
const gameSchema = z.enum([
  'cops-robbers',
  'cops-robbers-realtime',
  'letters-words2',
  'vibeJam-myself-history-guess',
  'xiangqi-five',
  'flick-arena',
  'carrom-club',
]);
export async function registerCompetition(
  app: FastifyInstance,
  store: ReturnType<typeof createCompetitionStore>,
  env: Record<string, string | undefined>,
  threeChooseTwo?: ReturnType<typeof createThreeChooseTwoStore>,
  carrom?: ReturnType<typeof createCarromStore>,
  ranked?: ReturnType<typeof createRankedStore>,
  control?: CompetitionControl,
) {
  const cors = readCompetitionCors(env);
  const platforms = platformConfigSchema.parse(JSON.parse(env.COMPETITION_PLATFORM_CONFIG ?? '[]'));
  const internalKey = env.COMPETITION_INTERNAL_KEY;
  if (internalKey) z.string().min(32).parse(internalKey);
  await app.register(
    async (routes) => {
      await routes.register(rateLimit, {
        global: true,
        max: 1200,
        timeWindow: '1 minute',
        keyGenerator: (request) => {
          const token = request.headers.authorization;
          return /^Bearer [a-f0-9]{64}$/.test(token ?? '')
            ? createHash('sha256').update(token!).digest('hex')
            : request.ip;
        },
      });
      // Route-specific rate-limit onRequest hooks precede preValidation, avoiding rejected DB reads.
      registerCors(
        routes,
        control ? () => control.publicCors() : cors,
        undefined,
        control ? 'preValidation' : 'onRequest',
      );
      routes.addHook('onRequest', async (request, reply) => {
        reply.header('cache-control', 'no-store');
      });
      routes.setErrorHandler((error, request, reply) => {
        if (error instanceof CompetitionError)
          return reply.code(error.status).send({ error: error.code });
        if (error instanceof z.ZodError) return reply.code(422).send({ error: 'INVALID_INPUT' });
        if (error instanceof Error && 'statusCode' in error && error.statusCode === 429)
          return reply.code(429).send({ error: 'RATE_LIMITED' });
        request.log.warn({ code: 'COMPETITION_UNAVAILABLE' }, 'Competition operation failed');
        return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE' });
      });
      const player = async (authorization: string | undefined) => {
        if (!authorization || !/^Bearer [a-f0-9]{64}$/.test(authorization))
          throw new CompetitionError('SESSION_EXPIRED', 401);
        const auth = await store.auth(authorization.slice(7));
        if (!auth || typeof auth === 'string') throw new CompetitionError('SESSION_EXPIRED', 401);
        return auth;
      };
      registerIdentityRoutes(routes, store, platforms, player);
      routes.get('/boards/:game', async (request) => {
        const game = z
          .string()
          .max(80)
          .parse((request.params as { game: string }).game);
        return store.board(game, await player(request.headers.authorization));
      });
      registerRunRoutes(routes, store, player);
      if (ranked) registerGameRoutes(routes, store, ranked, player);
      if (threeChooseTwo) registerThreeChooseTwoRoutes(routes, threeChooseTwo, player);
      if (carrom) registerCarromRoutes(routes, carrom, player);
      routes.post('/rooms', { bodyLimit: 2048 }, async (request) => {
        const input = z
          .object({
            game: gameSchema,
            mode: z.string().max(40).optional(),
            role: z.enum(['pursuer', 'runner']).optional(),
            initiative: z.enum(['pursuer', 'runner', 'random']).optional(),
          })
          .strict()
          .parse(request.body);
        return store.create(await player(request.headers.authorization), input.game, input);
      });
      routes.post('/rooms/join', { bodyLimit: 2048 }, async (request) => {
        const input = z
          .object({ code: codeSchema, game: gameSchema.optional() })
          .strict()
          .parse(request.body);
        return store.roomAction(
          await player(request.headers.authorization),
          input.code,
          'join',
          input,
        );
      });
      routes.get('/rooms/:code', async (request) =>
        store.roomAction(
          await player(request.headers.authorization),
          codeSchema.parse((request.params as { code: string }).code),
          'get',
        ),
      );
      for (const operation of ['ready', 'leave', 'rematch', 'actions', 'role', 'initiative']) {
        routes.post(`/rooms/:code/${operation}`, { bodyLimit: 8192 }, async (request) => {
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
                    .object({ role: z.enum(['pursuer', 'runner']) })
                    .strict()
                    .parse(request.body)
                : operation === 'initiative'
                  ? z
                      .object({ initiative: z.enum(['pursuer', 'runner', 'random']) })
                      .strict()
                      .parse(request.body)
                  : {};
          if (
            'action' in input &&
            input.action &&
            typeof input.action === 'object' &&
            Object.keys(input.action).some((key) =>
              ['score', 'elapsed', 'elapsedMs', 'moves', 'playerId'].includes(key),
            )
          )
            throw new CompetitionError('ILLEGAL_ACTION', 422);
          return store.roomAction(
            await player(request.headers.authorization),
            codeSchema.parse((request.params as { code: string }).code),
            operation,
            input,
          );
        });
      }
      const internal = (request: { ip: string; headers: Record<string, unknown> }) => {
        const provided = request.headers['x-competition-internal-key'];
        if (
          !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.ip) ||
          !internalKey ||
          typeof provided !== 'string' ||
          Buffer.byteLength(provided) !== Buffer.byteLength(internalKey) ||
          !timingSafeEqual(Buffer.from(provided), Buffer.from(internalKey))
        )
          throw new CompetitionError('INTERNAL_UNAUTHORIZED', 403);
      };
      if (threeChooseTwo) registerThreeChooseTwoInternalRoutes(routes, threeChooseTwo, internal);
      routes.post('/internal/verify', { bodyLimit: 2048 }, async (request) => {
        internal(request);
        const { token } = z.object({ token: tokenSchema }).strict().parse(request.body);
        return store.verifyKart(token);
      });
      routes.post('/internal/control', { bodyLimit: 1024 }, async (request) => {
        internal(request);
        z.object({})
          .strict()
          .parse(request.body ?? {});
        return control
          ? control.kartLease()
          : {
              controlEnabled: false,
              gameId: 'carding-car',
              state: 'enabled',
              killEpoch: 0,
              version: 0,
              digest: null,
              validForMs: 2000,
            };
      });
      routes.post('/internal/control-observation', { bodyLimit: 1024 }, async (request) => {
        internal(request);
        const input = z
          .object({
            instanceId: z
              .string()
              .min(1)
              .max(128)
              .regex(/^[^\p{Cc}]+$/u),
            version: z.number().int().positive(),
            digest: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict()
          .parse(request.body);
        if (!control) throw new CompetitionError('CONTROL_UNAVAILABLE', 503);
        await control.observeKart(input);
        return { applied: true };
      });
      routes.post('/internal/kart-results', { bodyLimit: 8192 }, async (request) => {
        internal(request);
        const input = z
          .object({
            matchId: z.uuid(),
            board: z.literal('carding-car-seaside-v1'),
            entries: z
              .array(
                z
                  .object({ playerId: z.uuid(), elapsedMs: z.number().int().min(1000).max(600000) })
                  .strict(),
              )
              .max(2),
            startedAt: z.number().int().positive(),
            finishedAt: z.number().int().positive(),
            killEpoch: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
          })
          .strict()
          .parse(request.body);
        if (new Set(input.entries.map((e) => e.playerId)).size !== input.entries.length)
          throw new CompetitionError('DUPLICATE_PLAYER', 422);
        return store.kartResults(input);
      });
    },
    { prefix: '/api/competition/v1' },
  );
}
