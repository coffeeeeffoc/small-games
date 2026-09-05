import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { SigningKey } from '@coffeeeeffoc/game-artifact';
import { projectionSchema, validatePublishedVersion } from '@coffeeeeffoc/release-contract';
import { ProjectionConflict, type createReleaseStore } from './store.js';

/** Internal server-to-server endpoint; neither signing secrets nor draft data are accepted. */
export function registerReleaseProjection(
  app: FastifyInstance,
  store: ReturnType<typeof createReleaseStore>,
  configuration?: { token: string; publicKey: SigningKey },
) {
  app.post('/internal/v1/releases', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    if (!configuration) return reply.code(503).send({ error: 'Publication is not configured' });
    const digest = (value: string) => createHash('sha256').update(value).digest();
    if (
      !timingSafeEqual(
        digest(request.headers.authorization ?? ''),
        digest(`Bearer ${configuration.token}`),
      )
    ) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const parsed = projectionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid projection' });
    try {
      await validatePublishedVersion(parsed.data.version, configuration.publicKey);
    } catch {
      return reply.code(422).send({ error: 'Unverified published snapshot' });
    }
    try {
      return await store.apply(parsed.data);
    } catch (error) {
      return reply
        .code(error instanceof ProjectionConflict ? 409 : 503)
        .send({ error: 'Projection not committed' });
    }
  });
}
