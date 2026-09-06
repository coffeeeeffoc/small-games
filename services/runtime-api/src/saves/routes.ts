import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { saveKeySchema, saveRecordSchema, saveWriteSchema } from '@coffeeeeffoc/release-contract';
import { SaveConflict, SaveUnauthorized, type createSaveStore } from './store.js';

/** Cloud-save transport is private to Game Host and scoped by a server-issued Game Session. */
export async function registerSaves(
  app: FastifyInstance,
  store: ReturnType<typeof createSaveStore>,
  shellOrigin: string,
) {
  await app.register(
    async (routes) => {
      await routes.register(rateLimit, { global: false });
      routes.addHook('onRequest', async (request, reply) => {
        request.log.info({ adapter: 'cloud-save' }, 'Cloud save adapter request');
        reply.header('cache-control', 'no-store');
        reply.header('access-control-allow-origin', shellOrigin).header('vary', 'Origin');
        if (request.method !== 'OPTIONS' && request.headers.origin !== shellOrigin)
          return reply.code(403).send({ error: 'ORIGIN_REJECTED' });
      });
      routes.setErrorHandler((error, _request, reply) => {
        if (error instanceof SaveConflict)
          return reply
            .code(409)
            .send({ error: 'SAVE_CONFLICT', actualVersion: error.actualVersion });
        if (error instanceof SaveUnauthorized)
          return reply.code(401).send({ error: 'INVALID_GAME_SESSION' });
        return reply.code(503).send({ error: 'SAVE_UNAVAILABLE' });
      });
      routes.options('/saves/:key', async (_request, reply) =>
        reply
          .header('access-control-allow-methods', 'GET, PUT')
          .header('access-control-allow-headers', 'content-type, x-game-session-id')
          .code(204)
          .send(),
      );
      routes.get('/saves/:key', async (request, reply) => {
        const key = saveKeySchema.safeParse((request.params as { key?: unknown }).key);
        const sessionId = z.uuid().safeParse(request.headers['x-game-session-id']);
        if (!key.success || !sessionId.success)
          return reply.code(422).send({ error: 'INVALID_SAVE_REQUEST' });
        const saved = await store.read(sessionId.data, key.data);
        return saved
          ? saveRecordSchema.parse(saved)
          : reply.code(404).send({ error: 'SAVE_NOT_FOUND' });
      });
      routes.put(
        '/saves/:key',
        { bodyLimit: 131_072, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
        async (request, reply) => {
          const key = saveKeySchema.safeParse((request.params as { key?: unknown }).key);
          const sessionId = z.uuid().safeParse(request.headers['x-game-session-id']);
          const input = saveWriteSchema.safeParse(request.body);
          if (!key.success || !sessionId.success || !input.success)
            return reply.code(422).send({ error: 'INVALID_SAVE_REQUEST' });
          return saveRecordSchema.parse(
            await store.write(
              sessionId.data,
              key.data,
              input.data.value,
              input.data.expectedVersion,
            ),
          );
        },
      );
    },
    { prefix: '/api/runtime' },
  );
}
