import { sql } from 'drizzle-orm';
import { saveRecordSchema, type SaveRecord, type SaveWrite } from '@coffeeeeffoc/release-contract';
import type { openDatabase } from '@coffeeeeffoc/service-kit';

export class SaveUnauthorized extends Error {}

export class SaveConflict extends Error {
  constructor(readonly actualVersion: string | null) {
    super('Cloud save version conflict');
  }
}

type Executor = Pick<ReturnType<typeof openDatabase>['db'], 'execute'>;

async function sessionScope(executor: Executor, sessionId: string) {
  const rows = await executor.execute(
    sql`select player_id as "playerId", game_id as "gameId" from runtime.game_sessions where session_id = ${sessionId}`,
  );
  const row = rows[0];
  if (!row || typeof row.playerId !== 'string' || typeof row.gameId !== 'string')
    throw new SaveUnauthorized();
  return { playerId: row.playerId, gameId: row.gameId };
}

function record(row: unknown): SaveRecord | null {
  return row ? saveRecordSchema.parse(row) : null;
}

/** Player saves are scoped by the server-issued Game Session, never caller-supplied identity. */
export function createSaveStore(db: ReturnType<typeof openDatabase>['db']) {
  return {
    async read(sessionId: string, key: string): Promise<SaveRecord | null> {
      const scope = await sessionScope(db, sessionId);
      const rows = await db.execute(
        sql`select value, version::text as version from runtime.cloud_saves where player_id = ${scope.playerId} and game_id = ${scope.gameId} and save_key = ${key}`,
      );
      return record(rows[0]);
    },
    async write(
      sessionId: string,
      key: string,
      value: SaveWrite['value'],
      expectedVersion: string | null,
    ): Promise<SaveRecord> {
      return db.transaction(async (tx) => {
        const scope = await sessionScope(tx, sessionId);
        let rows;
        if (expectedVersion === null) {
          rows = await tx.execute(
            sql`insert into runtime.cloud_saves (player_id, game_id, save_key, value, version, updated_at) values (${scope.playerId}, ${scope.gameId}, ${key}, ${JSON.stringify(value)}::jsonb, 1, ${Date.now()}) on conflict do nothing returning value, version::text as version`,
          );
        } else {
          rows = await tx.execute(
            sql`update runtime.cloud_saves set value = ${JSON.stringify(value)}::jsonb, version = version + 1, updated_at = ${Date.now()} where player_id = ${scope.playerId} and game_id = ${scope.gameId} and save_key = ${key} and version = ${expectedVersion}::bigint returning value, version::text as version`,
          );
        }
        const saved = record(rows[0]);
        if (saved) return saved;
        const current = await tx.execute(
          sql`select version::text as version from runtime.cloud_saves where player_id = ${scope.playerId} and game_id = ${scope.gameId} and save_key = ${key}`,
        );
        throw new SaveConflict(typeof current[0]?.version === 'string' ? current[0].version : null);
      });
    },
  };
}
