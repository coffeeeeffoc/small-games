import { sql } from 'drizzle-orm';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { canonicalBytes, sha256 } from '@coffeeeeffoc/game-artifact';
import { projectionReceiptSchema, type ReleaseProjection } from '@coffeeeeffoc/release-contract';

/** Rejects altered event replays and out-of-order Channel transitions. */
export class ProjectionConflict extends Error {}

/** Commits the snapshot, Channel pointer and replay receipt in one Runtime transaction. */
export function createReleaseStore(db: ReturnType<typeof openDatabase>['db']) {
  return {
    async apply(event: ReleaseProjection) {
      const hash = await sha256(canonicalBytes(event));
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`insert into runtime.release_channels (game_id, channel) values (${event.version.gameId}, ${event.channel}) on conflict do nothing`,
        );
        const channels = await tx.execute(
          sql`select revision from runtime.release_channels where game_id = ${event.version.gameId} and channel = ${event.channel} for update`,
        );
        const existing = await tx.execute(
          sql`select event_hash, receipt from runtime.projection_receipts where event_id = ${event.eventId}`,
        );
        if (existing[0]) {
          if (existing[0].event_hash !== hash)
            throw new ProjectionConflict('Event identity was already used');
          return projectionReceiptSchema.parse(existing[0].receipt);
        }
        if (channels[0]?.revision !== event.revision - 1)
          throw new ProjectionConflict('Channel revision conflict');
        const receipt = {
          eventId: event.eventId,
          revision: event.revision,
          versionId: event.version.id,
        };
        await tx.execute(
          sql`insert into runtime.game_versions (id, game_id, snapshot) values (${event.version.id}, ${event.version.gameId}, ${JSON.stringify(event.version)}::jsonb) on conflict do nothing`,
        );
        await tx.execute(
          sql`update runtime.release_channels set revision = ${event.revision}, version_id = ${event.version.id} where game_id = ${event.version.gameId} and channel = ${event.channel}`,
        );
        await tx.execute(
          sql`insert into runtime.projection_receipts (event_id, event_hash, receipt) values (${event.eventId}, ${hash}, ${JSON.stringify(receipt)}::jsonb)`,
        );
        return receipt;
      });
    },
  };
}
