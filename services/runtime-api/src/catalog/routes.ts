import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { sessionRequestSchema, publishedSessionSchema } from '@coffeeeeffoc/release-contract';
import { CatalogUnauthorized, CatalogUnavailable, type createCatalogStore } from './store.js';

const playerCredentialSchema = z.string().regex(/^Bearer [a-f0-9]{64}$/);

/** Public published-only API; browser origin and session fields are validated at the boundary. */
export async function registerCatalog(
  app: FastifyInstance,
  store: ReturnType<typeof createCatalogStore>,
  options: { shellOrigin: string; deliveryUrl: string; canaryPercent: number },
) {
  await app.register(
    async (routes) => {
      await routes.register(rateLimit, { global: false });
      routes.addHook('onRequest', async (request, reply) => {
        request.log.info({ adapter: 'runtime-catalog' }, 'Catalog adapter request');
        reply.header('cache-control', 'no-store');
        if (request.headers.origin && request.headers.origin !== options.shellOrigin)
          return reply.code(403).send({ error: 'ORIGIN_REJECTED' });
        reply.header('access-control-allow-origin', options.shellOrigin).header('vary', 'Origin');
        if (request.method === 'POST' && request.headers.origin !== options.shellOrigin)
          return reply.code(403).send({ error: 'ORIGIN_REJECTED' });
      });
      routes.setErrorHandler((error, _request, reply) => {
        if (error instanceof Error && 'statusCode' in error && error.statusCode === 429)
          return reply.code(429).send({ error: 'RATE_LIMITED' });
        if (error instanceof CatalogUnauthorized)
          return reply.code(401).send({ error: 'PLAYER_UNAUTHORIZED' });
        return reply
          .code(error instanceof CatalogUnavailable ? 409 : 503)
          .send({ error: 'CATALOG_UNAVAILABLE' });
      });
      routes.options('/sessions', async (_request, reply) =>
        reply
          .header('access-control-allow-methods', 'POST')
          .header('access-control-allow-headers', 'authorization, content-type')
          .code(204)
          .send(),
      );
      routes.get('/catalog', () => store.catalog());
      routes.post(
        '/sessions',
        { bodyLimit: 8192, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
        async (request, reply) => {
          const input = sessionRequestSchema.safeParse(request.body);
          if (!input.success) return reply.code(422).send({ error: 'INVALID_SESSION_REQUEST' });
          const credential = playerCredentialSchema.safeParse(request.headers.authorization);
          if (!credential.success) return reply.code(401).send({ error: 'PLAYER_UNAUTHORIZED' });
          const result = await store.session(
            input.data,
            options.canaryPercent,
            credential.data.slice('Bearer '.length),
          );
          return reply.code(201).send(
            publishedSessionSchema.parse({
              ...result,
              entryUrl: new URL(
                `/published/${result.version.id}/remote-entry.js`,
                options.deliveryUrl,
              ).href,
            }),
          );
        },
      );
    },
    { prefix: '/api/runtime' },
  );
}
