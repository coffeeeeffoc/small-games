import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { defaultManagedAdConfig, normalizeManagedAdConfig } from '@coffeeeeffoc/ad-config';
import type { AuthStore } from '../auth/model.js';
import { requireRole } from '../auth/access.js';
import { adDraftSchema, type AdDraftStore } from './model.js';

/** Managed Ad drafts follow the same creator-only, origin-checked lifecycle as content drafts. */
export async function registerAdDrafts(
  app: FastifyInstance,
  auth: AuthStore,
  store: AdDraftStore,
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
        routes.log.warn('Managed Ad draft operation failed');
        return reply.code(503).send({ error: 'AD_DRAFT_UNAVAILABLE' });
      });
      routes.get('/', () => store.list());
      routes.get('/:id', async (request, reply) => {
        const input = z.object({ id: z.uuid() }).safeParse(request.params);
        if (!input.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
        return (await store.get(input.data.id)) ?? reply.code(404).send({ error: 'NOT_FOUND' });
      });
      routes.post('/validate', async (request, reply) => {
        const result = normalizeManagedAdConfig(request.body);
        return result.success ? result : reply.code(422).send(result);
      });
      routes.post('/', async (request, reply) => {
        const input = adDraftSchema.pick({ name: true }).safeParse(request.body);
        if (!input.success) return reply.code(422).send({ issues: input.error.issues });
        return reply.code(201).send(
          await store.create({
            id: randomUUID(),
            name: input.data.name,
            revision: 0,
            envelope: defaultManagedAdConfig('cultivation'),
          }),
        );
      });
      routes.put('/:id', async (request, reply) => {
        const params = z.object({ id: z.uuid() }).safeParse(request.params);
        const input = adDraftSchema.omit({ id: true }).safeParse(request.body);
        if (!params.success || !input.success)
          return reply.code(422).send({
            issues: !input.success
              ? input.error.issues
              : [{ path: ['id'], message: 'Invalid draft ID' }],
          });
        const result = normalizeManagedAdConfig(input.data.envelope);
        if (!result.success) return reply.code(422).send(result);
        const saved = await store.save({
          ...input.data,
          id: params.data.id,
          envelope: result.data,
        });
        return saved ?? reply.code(409).send({ error: 'CONFLICT' });
      });
    },
    { prefix: '/api/ad-drafts' },
  );
}
