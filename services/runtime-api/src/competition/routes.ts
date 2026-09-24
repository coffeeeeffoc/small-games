import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { CompetitionError } from './types.js';
import type { createCompetitionStore } from './store.js';

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const codeSchema = z.string().regex(/^[A-F0-9]{12}$/);
const gameSchema = z.enum([
  'cops-robbers',
  'cops-robbers-realtime',
  'letters-words2',
  'vibeJam-myself-history-guess',
  'xiangqi-five',
]);
const platformConfig = z.array(
  z.object({
    platform: z.enum(['wechat', 'bilibili']),
    appId: z.string().min(1),
    secret: z.string().min(16),
  }),
);

export async function registerCompetition(
  app: FastifyInstance,
  store: ReturnType<typeof createCompetitionStore>,
  env: Record<string, string | undefined>,
) {
  const origins = (env.COMPETITION_ORIGINS ?? '')
    .split(',')
    .filter(Boolean)
    .map((origin) => z.url().parse(origin));
  const platforms = platformConfig.parse(JSON.parse(env.COMPETITION_PLATFORM_CONFIG ?? '[]'));
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
      routes.addHook('onRequest', async (request, reply) => {
        reply.header('cache-control', 'no-store');
        const origin = request.headers.origin;
        if (origin && !origins.includes(origin))
          return reply.code(403).send({ error: 'ORIGIN_REJECTED' });
        if (origin) reply.header('access-control-allow-origin', origin).header('vary', 'Origin');
      });
      routes.options('/*', async (_request, reply) =>
        reply
          .header('access-control-allow-methods', 'GET,POST,OPTIONS')
          .header('access-control-allow-headers', 'authorization,content-type')
          .code(204)
          .send(),
      );
      routes.setErrorHandler((error, request, reply) => {
        if (error instanceof CompetitionError)
          return reply.code(error.status).send({ error: error.code });
        if (error instanceof z.ZodError) return reply.code(422).send({ error: 'INVALID_INPUT' });
        if (error instanceof Error && 'statusCode' in error && error.statusCode === 429)
          return reply.code(429).send({ error: 'RATE_LIMITED' });
        request.log.warn({ code: 'COMPETITION_UNAVAILABLE' }, 'Competition operation failed');
        return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE' });
      });
      const player = (authorization: string | undefined) => {
        if (!authorization || !/^Bearer [a-f0-9]{64}$/.test(authorization))
          throw new CompetitionError('SESSION_EXPIRED', 401);
        return store.identity(authorization.slice(7));
      };
      routes.post(
        '/sessions/guest',
        {
          bodyLimit: 1024,
          config: {
            rateLimit: { max: 20, timeWindow: '1 minute', keyGenerator: (request) => request.ip },
          },
        },
        async () => store.session(),
      );
      routes.post(
        '/sessions/platform',
        {
          bodyLimit: 4096,
          config: {
            rateLimit: { max: 20, timeWindow: '1 minute', keyGenerator: (request) => request.ip },
          },
        },
        async (request) => {
          const input = z
            .object({
              platform: z.enum(['wechat', 'bilibili']),
              appId: z.string().max(100),
              code: z.string().min(1).max(512),
            })
            .strict()
            .parse(request.body);
          const configured = platforms.find(
            (p) => p.platform === input.platform && p.appId === input.appId,
          );
          if (!configured) throw new CompetitionError('PLATFORM_NOT_CONFIGURED', 503);
          const endpoint = new URL(
            input.platform === 'wechat'
              ? 'https://api.weixin.qq.com/sns/jscode2session'
              : 'https://miniapp.bilibili.com/api/sns/jscode2session',
          );
          endpoint.search = new URLSearchParams({
            appid: input.appId,
            secret: configured.secret,
            js_code: input.code,
            grant_type: 'authorization_code',
          }).toString();
          const response = await fetch(endpoint, {
            signal: AbortSignal.timeout(5000),
            redirect: 'error',
          });
          if (!response.ok) throw new CompetitionError('PLATFORM_LOGIN_FAILED', 401);
          const data = (await response.json()) as {
            openid?: unknown;
            openId?: unknown;
            errcode?: number;
          };
          const subject = data.openid;
          if (data.errcode || typeof subject !== 'string' || !subject)
            throw new CompetitionError('PLATFORM_LOGIN_FAILED', 401);
          return store.session(input.platform, input.appId, subject);
        },
      );
      routes.get('/me', async (request) =>
        store.profile(await player(request.headers.authorization)),
      );
      routes.post(
        '/me',
        { bodyLimit: 1024, config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
        async (request) => {
          const { name } = z
            .object({
              name: z
                .string()
                .max(100)
                .transform((value) => value.normalize('NFKC').trim().replace(/\s+/g, ' '))
                .refine(
                  (value) =>
                    Array.from(value).length >= 2 &&
                    Array.from(value).length <= 16 &&
                    /^[\p{L}\p{N} ·_-]+$/u.test(value),
                  'INVALID_NAME',
                ),
            })
            .strict()
            .parse(request.body);
          return store.profile(await player(request.headers.authorization), name);
        },
      );
      routes.get('/boards/:game', async (request) => {
        const game = z
          .string()
          .max(80)
          .parse((request.params as { game: string }).game);
        return store.board(game, await player(request.headers.authorization));
      });
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
      routes.post('/internal/verify', { bodyLimit: 2048 }, async (request) => {
        internal(request);
        const { token } = z.object({ token: tokenSchema }).strict().parse(request.body);
        return { playerId: await store.identity(token) };
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
