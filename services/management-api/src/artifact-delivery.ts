import { sql } from 'drizzle-orm';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import type { FastifyInstance } from 'fastify';
import { publishedVersionSchema, versionIdSchema } from '@coffeeeeffoc/release-contract';
import type { createArtifactRepository } from './artifact-repository.js';

/** Resolves only snapshots acknowledged as published, including retained historical versions. */
export function createPublishedArtifactReader(
  db: ReturnType<typeof openDatabase>['db'],
  repository: ReturnType<typeof createArtifactRepository>,
) {
  return async (id: string) => {
    const rows = await db.execute(
      sql`select snapshot from management.game_versions v where v.id = ${id} and exists (select 1 from management.release_outbox o where o.delivered and o.payload->'version'->>'id' = v.id)`,
    );
    if (!rows[0]) return undefined;
    const version = publishedVersionSchema.parse(rows[0].snapshot);
    const artifact = await repository.read(version.artifact.id);
    return artifact.resources.get(artifact.descriptor.manifest.remoteEntry);
  };
}

/** Read-only public byte delivery; S3 stays private and no Management drafts enter responses. */
export function registerArtifactDelivery(
  app: FastifyInstance,
  read: ReturnType<typeof createPublishedArtifactReader>,
  shellOrigin: string,
) {
  app.get<{ Params: { id: string } }>('/published/:id/remote-entry.js', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    if (request.headers.origin && request.headers.origin !== shellOrigin)
      return reply.code(403).send({ error: 'ORIGIN_REJECTED' });
    const id = versionIdSchema.safeParse(request.params.id);
    if (!id.success) return reply.code(404).send({ error: 'NOT_FOUND' });
    try {
      const bytes = await read(id.data);
      if (!bytes) return reply.code(404).send({ error: 'NOT_PUBLISHED' });
      return reply
        .header('access-control-allow-origin', shellOrigin)
        .header('access-control-expose-headers', 'content-security-policy')
        .header('vary', 'Origin')
        .header('x-content-type-options', 'nosniff')
        .header(
          'content-security-policy',
          `default-src 'none'; script-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-ancestors ${shellOrigin}`,
        )
        .type('text/javascript; charset=utf-8')
        .send(Buffer.from(bytes));
    } catch {
      return reply.code(503).send({ error: 'ARTIFACT_UNAVAILABLE' });
    }
  });
}
