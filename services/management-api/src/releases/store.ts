import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { canonicalBytes, sha256 } from '@coffeeeeffoc/game-artifact';
import {
  publishedVersionSchema,
  projectionSchema,
  projectionReceiptSchema,
  type PublishedVersion,
  type ReleaseProjection,
  type ProjectionReceipt,
} from '@coffeeeeffoc/release-contract';

/** A stale draft/Channel or changed retry must be re-read, never silently overwritten. */
export class ReleaseConflict extends Error {}

/** Schema-scoped publication and durable outbox; no Runtime database access. */
export function createPublicationStore(db: ReturnType<typeof openDatabase>['db']) {
  return {
    async getRequest(eventId: string, actorId: string, request: unknown) {
      const rows = await db.execute(
        sql`select request_hash, payload from management.release_outbox where event_id = ${eventId}`,
      );
      if (!rows[0]) return undefined;
      if (rows[0].request_hash !== (await sha256(canonicalBytes({ actorId, request }))))
        throw new ReleaseConflict('Request identity already used');
      return projectionSchema.parse(rows[0].payload);
    },
    async status(gameId: string) {
      const channels = await db.execute(
        sql`select channel, revision, version_id as "versionId" from management.release_channels where game_id = ${gameId}`,
      );
      const versions = await db.execute(
        sql`select id, snapshot, created_at as "createdAt" from management.game_versions where game_id = ${gameId} order by created_at desc`,
      );
      const events = await db.execute(
        sql`select event_id as "eventId", channel, revision, attempts, last_error as "lastError", delivered from management.release_outbox where game_id = ${gameId} order by created_at desc limit 50`,
      );
      return { channels: [...channels], versions: [...versions], events: [...events] };
    },
    async getVersion(id: string) {
      const rows = await db.execute(
        sql`select snapshot from management.game_versions where id = ${id}`,
      );
      return rows[0] ? publishedVersionSchema.parse(rows[0].snapshot) : undefined;
    },
    async enqueue(input: {
      eventId: string;
      channel: ReleaseProjection['channel'];
      expectedRevision: number;
      actorId: string;
      version: PublishedVersion;
      draft?: { id: string; revision: number };
      confirmation: true;
      request: unknown;
    }) {
      const hash = await sha256(canonicalBytes({ actorId: input.actorId, request: input.request }));
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`insert into management.release_channels (game_id, channel) values (${input.version.gameId}, ${input.channel}) on conflict do nothing`,
        );
        const channels = await tx.execute(
          sql`select revision, version_id from management.release_channels where game_id = ${input.version.gameId} and channel = ${input.channel} for update`,
        );
        const existing = await tx.execute(
          sql`select request_hash, payload from management.release_outbox where event_id = ${input.eventId}`,
        );
        if (existing[0]) {
          if (existing[0].request_hash !== hash)
            throw new ReleaseConflict('Request identity already used');
          return projectionSchema.parse(existing[0].payload);
        }
        if (channels[0]?.revision !== input.expectedRevision)
          throw new ReleaseConflict('Channel revision changed');
        const pending = await tx.execute(
          sql`select event_id from management.release_outbox where game_id = ${input.version.gameId} and channel = ${input.channel} and not delivered`,
        );
        if (pending.length) throw new ReleaseConflict('Channel has a pending transition');
        if (input.draft) {
          const drafts = await tx.execute(
            sql`select revision from management.content_drafts where id = ${input.draft.id} for share`,
          );
          if (drafts[0]?.revision !== input.draft.revision)
            throw new ReleaseConflict('Draft revision changed');
        }
        const event = projectionSchema.parse({
          formatVersion: 1,
          eventId: input.eventId,
          channel: input.channel,
          revision: input.expectedRevision + 1,
          version: input.version,
        });
        const now = Date.now();
        await tx.execute(
          sql`insert into management.game_versions (id, game_id, snapshot, created_at) values (${input.version.id}, ${input.version.gameId}, ${JSON.stringify(input.version)}::jsonb, ${now}) on conflict do nothing`,
        );
        await tx.execute(
          sql`insert into management.release_outbox (event_id, game_id, channel, revision, request_hash, payload, created_at) values (${event.eventId}, ${input.version.gameId}, ${event.channel}, ${event.revision}, ${hash}, ${JSON.stringify(event)}::jsonb, ${now})`,
        );
        await tx.execute(
          sql`insert into management.audit_log (id, actor_id, action, details, created_at) values (${randomUUID()}, ${input.actorId}, ${input.draft ? 'release.publish' : 'release.rollback'}, ${JSON.stringify({ eventId: event.eventId, channel: event.channel, previousVersionId: channels[0]?.version_id, targetVersionId: input.version.id, draft: input.draft, confirmation: true })}::jsonb, ${now})`,
        );
        return event;
      });
    },
    async deliverOne(
      deliver: (event: ReleaseProjection) => Promise<ProjectionReceipt>,
      gameId?: string,
    ) {
      return db.transaction(async (tx) => {
        const rows = await tx.execute(
          sql`select event_id, payload from management.release_outbox where not delivered and (${gameId ?? null}::text is null or game_id = ${gameId ?? null}) order by attempts, created_at for update skip locked limit 1`,
        );
        if (!rows[0]) return false;
        const event = projectionSchema.parse(rows[0].payload);
        try {
          const receipt = projectionReceiptSchema.parse(await deliver(event));
          if (
            receipt.eventId !== event.eventId ||
            receipt.revision !== event.revision ||
            receipt.versionId !== event.version.id
          )
            throw new Error('Receipt mismatch');
        } catch {
          await tx.execute(
            sql`update management.release_outbox set attempts = attempts + 1, last_error = 'Projection acknowledgment unavailable; retry scheduled' where event_id = ${event.eventId}`,
          );
          return true;
        }
        await tx.execute(
          sql`update management.release_channels set revision = ${event.revision}, version_id = ${event.version.id} where game_id = ${event.version.gameId} and channel = ${event.channel}`,
        );
        await tx.execute(
          sql`update management.release_outbox set delivered = true, attempts = attempts + 1, last_error = null where event_id = ${event.eventId}`,
        );
        return true;
      });
    },
  };
}
