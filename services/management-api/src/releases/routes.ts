import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { normalizeCultivationContent } from '@coffeeeeffoc/game-cultivation/content';
import { normalizeManagedAdConfig } from '@coffeeeeffoc/ad-config';
import {
  createPublishedVersion,
  projectionSchema,
  versionIdSchema,
} from '@coffeeeeffoc/release-contract';
import type { AuthStore } from '../auth/model.js';
import { authenticatedOperator, requireRole } from '../auth/access.js';
import type { DraftStore } from '../drafts/model.js';
import type { AdDraftStore } from '../ad-drafts/model.js';
import type { createArtifactRepository } from '../artifact-repository.js';
import { ReleaseConflict, type createPublicationStore } from './store.js';

const transition = z.object({
  eventId: z.uuid(),
  channel: projectionSchema.shape.channel,
  expectedRevision: z.number().int().min(0).max(2147483646),
  confirmation: z.literal(true),
});
const publish = transition
  .extend({
    draftId: z.uuid(),
    draftRevision: z.number().int().nonnegative(),
    artifactId: versionIdSchema,
    adDraftId: z.uuid().optional(),
    adDraftRevision: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine((input) => (input.adDraftId === undefined) === (input.adDraftRevision === undefined), {
    message: 'adDraftId and adDraftRevision must be supplied together',
  });
const rollback = transition.extend({ versionId: versionIdSchema }).strict();

/** Publisher-only transitions require explicit impact confirmation and exact browser Origin. */
export async function registerPublications(
  app: FastifyInstance,
  auth: AuthStore,
  drafts: DraftStore,
  store: ReturnType<typeof createPublicationStore>,
  origin: string,
  artifacts?: Pick<ReturnType<typeof createArtifactRepository>, 'read'>,
  adDrafts?: AdDraftStore,
) {
  await app.register(
    async (routes) => {
      routes.addHook('onRequest', async (request, reply) => {
        reply.header('cache-control', 'no-store');
        if (request.method !== 'GET' && request.headers.origin !== origin)
          return reply.code(403).send({ error: 'ORIGIN_REJECTED' });
      });
      routes.addHook('onRequest', requireRole(auth, 'publisher'));
      routes.setErrorHandler((error, _request, reply) =>
        reply.code(error instanceof ReleaseConflict ? 409 : 503).send({
          error: error instanceof ReleaseConflict ? 'CONFLICT' : 'PUBLICATION_UNAVAILABLE',
        }),
      );
      routes.get('/', () => store.status('cultivation'));
      // Publishing does not imply creator rights; this is the saved, publishable draft inventory.
      routes.get('/drafts', () => drafts.list());
      routes.get('/ad-drafts', () => adDrafts?.list() ?? []);
      routes.post('/publish', async (request, reply) => {
        if (!artifacts) return reply.code(503).send({ error: 'PUBLICATION_NOT_CONFIGURED' });
        const parsed = publish.safeParse(request.body);
        if (!parsed.success) return reply.code(422).send({ error: 'INVALID_INPUT' });
        const input = parsed.data;
        const actor = await authenticatedOperator(auth, request);
        if (!actor || !actor.roles.includes('publisher'))
          return reply.code(403).send({ error: 'FORBIDDEN' });
        const previous = await store.getRequest(input.eventId, actor.id, input);
        if (previous) return reply.code(202).send(previous);
        const draft = await drafts.get(input.draftId);
        if (!draft) return reply.code(404).send({ error: 'DRAFT_NOT_FOUND' });
        if (draft.revision !== input.draftRevision) throw new ReleaseConflict('Draft changed');
        const content = normalizeCultivationContent(draft.envelope);
        if (!content.success) return reply.code(422).send(content);
        let advertising;
        let adDraft;
        if (input.adDraftId) {
          if (!adDrafts) return reply.code(503).send({ error: 'PUBLICATION_NOT_CONFIGURED' });
          const saved = await adDrafts.get(input.adDraftId);
          if (!saved) return reply.code(404).send({ error: 'AD_DRAFT_NOT_FOUND' });
          if (saved.revision !== input.adDraftRevision)
            throw new ReleaseConflict('Managed Ad draft changed');
          const normalized = normalizeManagedAdConfig(saved.envelope);
          if (!normalized.success) return reply.code(422).send(normalized);
          advertising = normalized.data;
          adDraft = { id: saved.id, revision: saved.revision };
        }
        request.log.info(
          { adapter: 'object-store', artifactId: input.artifactId },
          'Artifact read',
        );
        const artifact = await artifacts.read(input.artifactId);
        const version = await createPublishedVersion(
          artifact.descriptor,
          content.data,
          advertising,
        );
        request.log.info(
          { adapter: 'release-outbox', channel: input.channel },
          'Publication queued',
        );
        return reply.code(202).send(
          await store.enqueue({
            eventId: input.eventId,
            channel: input.channel,
            expectedRevision: input.expectedRevision,
            confirmation: true,
            actorId: actor.id,
            request: input,
            version,
            draft: { id: draft.id, revision: draft.revision },
            ...(adDraft ? { adDraft } : {}),
          }),
        );
      });
      routes.post('/rollback', async (request, reply) => {
        if (!artifacts) return reply.code(503).send({ error: 'PUBLICATION_NOT_CONFIGURED' });
        const parsed = rollback.safeParse(request.body);
        if (!parsed.success) return reply.code(422).send({ error: 'INVALID_INPUT' });
        const actor = await authenticatedOperator(auth, request);
        if (!actor || !actor.roles.includes('publisher'))
          return reply.code(403).send({ error: 'FORBIDDEN' });
        const previous = await store.getRequest(parsed.data.eventId, actor.id, parsed.data);
        if (previous) return reply.code(202).send(previous);
        const version = await store.getVersion(parsed.data.versionId);
        if (!version || version.gameId !== 'cultivation')
          return reply.code(404).send({ error: 'VERSION_NOT_FOUND' });
        await artifacts.read(version.artifact.id);
        const input = transition.parse(parsed.data);
        return reply
          .code(202)
          .send(
            await store.enqueue({ ...input, actorId: actor.id, version, request: parsed.data }),
          );
      });
    },
    { prefix: '/api/releases' },
  );
}
