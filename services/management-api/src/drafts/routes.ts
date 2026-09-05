import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  defaultCultivationEnvelope,
  normalizeCultivationContent,
} from '@coffeeeeffoc/game-cultivation/content';
import type { AuthStore } from '../auth/model.js';
import { requireRole } from '../auth/access.js';
import { draftSchema, type DraftStore } from './model.js';

/** All draft operations require the creator role; writes also require the configured origin. */
export async function registerDrafts(
  app: FastifyInstance,
  auth: AuthStore,
  store: DraftStore,
  origin: string,
) {
  await app.register(
    async (routes) => {
      routes.addHook('onRequest', async (request, reply) => {
        reply.header('Cache-Control', 'no-store');
        if (request.method !== 'GET' && request.headers.origin !== origin)
          return reply.code(403).send({ error: 'ORIGIN_REJECTED' });
      });
      routes.addHook('onRequest', requireRole(auth, 'creator'));
      routes.setErrorHandler((_error, _request, reply) => {
        routes.log.warn('Draft operation failed');
        return reply.code(503).send({ error: 'DRAFT_UNAVAILABLE' });
      });
      routes.get('/', () => store.list());
      routes.get('/:id', async (request, reply) => {
        const input = z.object({ id: z.uuid() }).safeParse(request.params);
        if (!input.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
        return (await store.get(input.data.id)) ?? reply.code(404).send({ error: 'NOT_FOUND' });
      });
      routes.post('/validate', async (request, reply) => {
        const result = normalizeCultivationContent(request.body);
        return result.success ? result : reply.code(422).send(result);
      });
      routes.post('/', async (request, reply) => {
        const input = draftSchema.pick({ name: true }).safeParse(request.body);
        if (!input.success) return reply.code(422).send({ issues: input.error.issues });
        return reply.code(201).send(
          await store.create({
            id: randomUUID(),
            name: input.data.name,
            revision: 0,
            envelope: { ...structuredClone(defaultCultivationEnvelope), revision: 0 },
          }),
        );
      });
      routes.put('/:id', async (request, reply) => {
        const params = z.object({ id: z.uuid() }).safeParse(request.params);
        const input = draftSchema.omit({ id: true }).safeParse(request.body);
        if (!params.success || !input.success)
          return reply.code(422).send({
            issues: !input.success
              ? input.error.issues
              : [{ path: ['id'], message: 'Invalid draft ID' }],
          });
        const result = normalizeCultivationContent(input.data.envelope);
        if (!result.success) return reply.code(422).send(result);
        const saved = await store.save({
          ...input.data,
          id: params.data.id,
          envelope: { ...result.data, revision: input.data.revision + 1 },
        });
        return saved ?? reply.code(409).send({ error: 'CONFLICT' });
      });
    },
    { prefix: '/api/drafts' },
  );
}
