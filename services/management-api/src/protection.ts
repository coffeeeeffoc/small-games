import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import type { AuthStore } from './auth/model.js';
import { authenticatedOperator, requireRole } from './auth/access.js';

type Objects = {
  keys(prefix: string): Promise<string[]>;
  deleteKeys(keys: string[]): Promise<void>;
};

export function createProtectionStore(db: ReturnType<typeof openDatabase>['db'], objects: Objects) {
  const artifactImpact = async (artifactId: string) => {
    const versions = await db.execute(
      sql`select id from management.game_versions where snapshot->'artifact'->>'id' = ${artifactId} order by id`,
    );
    const channels = await db.execute(
      sql`select c.game_id as "gameId", c.channel from management.release_channels c join management.game_versions v on v.id = c.version_id where v.snapshot->'artifact'->>'id' = ${artifactId} order by c.game_id, c.channel`,
    );
    const keys = await objects.keys(`artifacts/${artifactId}/`);
    return {
      artifactId,
      objectCount: keys.length,
      versions: versions.map(({ id }) => String(id)),
      channels: [...channels],
      keys,
    };
  };
  return {
    artifactImpact,
    async cleanupArtifact(artifactId: string, actorId: string, confirmation: boolean) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`lock table management.game_versions in share mode`);
        const impact = await artifactImpact(artifactId);
        const blocked = impact.versions.length > 0 || impact.channels.length > 0;
        const action = blocked
          ? 'artifact.cleanup-rejected'
          : confirmation
            ? 'artifact.cleanup'
            : 'artifact.cleanup-rejected';
        await tx.execute(
          sql`insert into management.audit_log (id, actor_id, action, details, created_at) values (${randomUUID()}, ${actorId}, ${action}, ${JSON.stringify({ impact, confirmation })}::jsonb, ${Date.now()})`,
        );
        if (blocked) return { ...impact, blocked: true as const };
        if (!confirmation) return { ...impact, confirmationRequired: true as const };
        await objects.deleteKeys(impact.keys);
        return { ...impact, removed: true as const };
      });
    },
  };
}

export async function registerProtection(
  app: FastifyInstance,
  auth: AuthStore,
  store: ReturnType<typeof createProtectionStore>,
  origin: string,
) {
  await app.register(
    async (routes) => {
      routes.addHook('onRequest', async (request, reply) => {
        reply.header('cache-control', 'no-store');
        if (request.method !== 'GET' && request.headers.origin !== origin)
          return reply.code(403).send({ error: 'ORIGIN_REJECTED' });
      });
      routes.addHook('onRequest', requireRole(auth, 'admin'));
      routes.post('/artifacts/:id/cleanup', async (request, reply) => {
        const params = z
          .object({ id: z.string().regex(/^[a-f0-9]{64}$/) })
          .safeParse(request.params);
        const input = z
          .object({ confirmation: z.boolean().default(false) })
          .safeParse(request.body ?? {});
        if (!params.success || !input.success)
          return reply.code(422).send({ error: 'INVALID_INPUT' });
        const actor = await authenticatedOperator(auth, request);
        const result = await store.cleanupArtifact(
          params.data.id,
          actor!.id,
          input.data.confirmation,
        );
        return reply.code('blocked' in result ? 409 : 200).send(result);
      });
    },
    { prefix: '/api/protection' },
  );
}
