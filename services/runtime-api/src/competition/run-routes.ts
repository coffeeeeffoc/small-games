import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { createCompetitionStore } from './store.js';

export function registerRunRoutes(
  routes: FastifyInstance,
  store: ReturnType<typeof createCompetitionStore>,
  player: (authorization: string | undefined) => Promise<string>,
) {
  const config = (query: unknown) =>
    z
      .object({
        version: z.literal('street-solo-v1'),
        mode: z.enum(['challenge', 'classic', 'escape', 'quick']),
        role: z.enum(['cop', 'robber']),
        level: z.coerce.number().int().min(1).max(100),
        rule: z.enum(['standard', 'relay']),
        first: z.enum(['cop', 'robber', 'simultaneous']),
      })
      .strict()
      .parse(query);
  routes.get('/runs/cops-robbers-realtime', async (request) =>
    store.streetRuns(await player(request.headers.authorization), config(request.query)),
  );
  routes.post(
    '/runs/cops-robbers-realtime',
    {
      bodyLimit: 160000,
      config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
    },
    async (request) =>
      store.streetRuns(
        await player(request.headers.authorization),
        config(request.query),
        request.body,
      ),
  );
}
