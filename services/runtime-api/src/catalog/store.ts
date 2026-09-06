import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import {
  catalogSchema,
  publishedVersionSchema,
  type SessionRequest,
} from '@coffeeeeffoc/release-contract';

/** A missing published target or unsupported capability never silently selects another remote Game. */
export class CatalogUnavailable extends Error {}
export class CatalogUnauthorized extends Error {}

/** Stable cohort number; assignments persist within one stable/canary snapshot pair. */
export function canaryBucket(playerId: string, gameId: string): number {
  return (
    createHash('sha256')
      .update(JSON.stringify([playerId, gameId]))
      .digest()
      .readUInt32BE(0) % 100
  );
}

/** Published-only SQL boundary; this module never references Management data. */
export function createCatalogStore(db: ReturnType<typeof openDatabase>['db']) {
  return {
    async catalog() {
      return catalogSchema.parse(
        await db.execute(
          sql`select c.game_id as "gameId", c.channel, c.revision, v.id as "versionId", v.snapshot->'artifact'->'manifest'->'game' as manifest from runtime.release_channels c join runtime.game_versions v on v.id = c.version_id order by c.game_id, c.channel limit 256`,
        ),
      );
    },
    async session(request: SessionRequest, canaryPercent = 10, credential?: string) {
      return db.transaction(async (tx) => {
        if (!credential) throw new CatalogUnauthorized('Missing player credential');
        const credentialHash = createHash('sha256').update(credential).digest('hex');
        const channels = await tx.execute(
          sql`select channel, version_id from runtime.release_channels where game_id = ${request.gameId}`,
        );
        const stable = channels.find((row) => row.channel === 'stable')?.version_id;
        const candidate = channels.find((row) => row.channel === request.channel)?.version_id;
        let versionId = request.versionId ?? candidate;
        if (!request.versionId && request.channel === 'canary') {
          versionId =
            candidate && (!stable || canaryBucket(request.playerId, request.gameId) < canaryPercent)
              ? candidate
              : stable;
          if (typeof versionId !== 'string') throw new CatalogUnavailable('No published Channel');
          const epoch = `${typeof stable === 'string' ? stable : 'no-stable'}:${typeof candidate === 'string' ? candidate : 'no-canary'}`;
          await tx.execute(
            sql`insert into runtime.canary_assignments (player_id, game_id, stable_epoch, version_id) values (${request.playerId}, ${request.gameId}, ${epoch}, ${versionId}) on conflict do nothing`,
          );
          const assignments = await tx.execute(
            sql`select version_id from runtime.canary_assignments where player_id = ${request.playerId} and game_id = ${request.gameId} and stable_epoch = ${epoch}`,
          );
          versionId = assignments[0]?.version_id;
        }
        if (typeof versionId !== 'string') throw new CatalogUnavailable('No published Channel');
        const versions = await tx.execute(
          sql`select snapshot from runtime.game_versions where id = ${versionId} and game_id = ${request.gameId}`,
        );
        if (!versions[0]) throw new CatalogUnavailable('Published version not found');
        const version = publishedVersionSchema.parse(versions[0].snapshot);
        const manifest = version.artifact.manifest.game;
        if (
          !manifest.loadModes.includes('iframe') ||
          manifest.capabilities.some((value) => !request.capabilities.includes(value))
        )
          throw new CatalogUnavailable('Incompatible Game');
        await tx.execute(
          sql`insert into runtime.players (player_id, credential_hash, created_at) values (${request.playerId}, ${credentialHash}, ${Date.now()}) on conflict do nothing`,
        );
        const players = await tx.execute(
          sql`select player_id from runtime.players where player_id = ${request.playerId} and credential_hash = ${credentialHash}`,
        );
        if (!players[0]) throw new CatalogUnauthorized('Invalid player credential');
        const session = {
          gameId: version.gameId,
          gameVersion: manifest.version,
          publishedVersionId: version.id,
          releaseChannel: request.channel,
          // Advertising authority stays server-owned: only an enabled published plan opts in.
          adAuthority: (version.advertising?.enabled ? 'managed' : 'none') as 'managed' | 'none',
          sessionId: randomUUID(),
          locale: request.locale,
          capabilities: [...manifest.capabilities],
        };
        await tx.execute(
          sql`insert into runtime.game_sessions (session_id, player_id, game_id, version_id, context, created_at) values (${session.sessionId}, ${request.playerId}, ${session.gameId}, ${version.id}, ${JSON.stringify(session)}::jsonb, ${Date.now()})`,
        );
        return { session, version };
      });
    },
  };
}
