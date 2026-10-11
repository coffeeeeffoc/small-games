import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { createCarromStore } from './store.js';

const code = z.string().regex(/^[A-F0-9]{12}$/);
const revision = z.number().int().positive();
const settings = z
  .object({
    mode: z.enum(['singles', 'doubles', 'colors']).optional(),
    board: z.enum(['ordinary', 'level', 'random']).optional(),
    levelId: z.string().max(50).nullable().optional(),
    maxPlayers: z.number().int().min(2).max(4).optional(),
  })
  .strict();
const shot = z
  .object({
    position: z.number().min(235).max(765),
    dx: z.number().min(-2000).max(2000),
    dy: z.number().min(-2000).max(2000),
    power: z.number().min(0.025).max(1),
  })
  .strict()
  .refine((value) => Math.hypot(value.dx, value.dy) >= 0.001);
const operations = {
  settings: z.object({ revision, settings }).strict(),
  ready: z.object({ revision, ready: z.boolean() }).strict(),
  start: z.object({ revision }).strict(),
  rematch: z.object({ revision }).strict(),
  leave: z.object({}).strict(),
  shoot: z
    .object({
      round: z.number().int().positive(),
      expectedTurnNumber: z.number().int().positive(),
      seq: z.number().int().positive().max(1_000_000),
      shot,
    })
    .strict(),
};
export function registerCarromRoutes(
  routes: FastifyInstance,
  store: ReturnType<typeof createCarromStore>,
  player: (authorization: string | undefined) => Promise<string>,
) {
  routes.post(
    '/carrom/rooms',
    { bodyLimit: 2048, config: { rateLimit: { max: 12, timeWindow: '1 minute' } } },
    async (request) =>
      store.create(await player(request.headers.authorization), settings.parse(request.body)),
  );
  routes.post('/carrom/rooms/join', { bodyLimit: 1024 }, async (request) => {
    const input = z.object({ code }).strict().parse(request.body);
    return store.action(await player(request.headers.authorization), input.code, 'join');
  });
  routes.get('/carrom/rooms/:code', async (request) =>
    store.action(
      await player(request.headers.authorization),
      code.parse((request.params as { code: string }).code),
      'get',
    ),
  );
  for (const [operation, schema] of Object.entries(operations)) {
    routes.post(`/carrom/rooms/:code/${operation}`, { bodyLimit: 2048 }, async (request) =>
      store.action(
        await player(request.headers.authorization),
        code.parse((request.params as { code: string }).code),
        operation,
        schema.parse(request.body),
      ),
    );
  }
}
