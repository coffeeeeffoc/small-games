import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { authenticatedOperator, requireRole } from '../auth/access.js';
import type { AuthStore } from '../auth/model.js';
import type { GenerationJobStore, GenerationTarget } from './model.js';

const requestSchema = z.object({ input: z.string().trim().min(1).max(4000) }).strict();

export async function registerGenerationJobs(
  app: FastifyInstance,
  auth: AuthStore,
  store: GenerationJobStore,
  origin: string,
  target: GenerationTarget,
) {
  await app.register(
    async (routes) => {
      routes.addHook('onRequest', async (request, reply) => {
        reply.header('Cache-Control', 'no-store');
        if (request.method !== 'GET' && request.headers.origin !== origin)
          return reply.code(403).send({ error: 'ORIGIN_REJECTED' });
      });
      routes.addHook('onRequest', requireRole(auth, 'creator'));
      routes.get('/', () => store.list());
      routes.post('/', async (request, reply) => {
        const input = requestSchema.safeParse(request.body);
        if (!input.success) return reply.code(422).send({ error: 'INVALID_INPUT' });
        const operator = await authenticatedOperator(auth, request);
        if (!operator) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
        return reply.code(202).send(
          await store.enqueue({
            id: randomUUID(),
            operatorId: operator.id,
            gameId: target.manifest.gameId,
            schemaVersion: target.manifest.contentSchemaVersion,
            input: input.data.input,
            inputHash: createHash('sha256').update(input.data.input).digest('hex'),
            attempt: 1,
            status: 'queued',
            disposition: 'pending',
          }),
        );
      });
      routes.post('/:id/retry', async (request, reply) => {
        const id = z.uuid().safeParse((request.params as { id?: unknown }).id);
        if (!id.success) return reply.code(422).send({ error: 'INVALID_INPUT' });
        const previous = await store.get(id.data);
        const operator = await authenticatedOperator(auth, request);
        if (!previous || !operator) return reply.code(404).send({ error: 'NOT_FOUND' });
        const retried = await store.retry(id.data, {
          id: randomUUID(),
          operatorId: operator.id,
          attempt: previous.attempt + 1,
          status: 'queued',
          disposition: 'pending',
        });
        return retried
          ? reply.code(202).send(retried)
          : reply.code(409).send({ error: 'NOT_FAILED' });
      });
    },
    { prefix: '/api/generation-jobs' },
  );
}
