import { sql } from 'drizzle-orm';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { CompetitionError } from '../competition/types.js';
import { createCarromRooms } from './rooms.js';
import type { Engine, Level, Repository, Room } from './types.js';

type Database = ReturnType<typeof openDatabase>['db'];
/** Reuse durable room storage and identity; serialize every mutation under a row lock. */
export function createCarromStore(db: Database, engine: Engine, levels: Level[], now = Date.now) {
  const repository: Repository = {
    async name(playerId) {
      const rows = await db.execute(
        sql`select coalesce(display_name,'棋友') as name from runtime.competition_players where id=${playerId}`,
      );
      if (!rows[0]) throw new CompetitionError('SESSION_EXPIRED', 401);
      return String(rows[0].name);
    },
    async create(room) {
      await db.execute(
        sql`insert into runtime.competition_rooms values(${room.code},${JSON.stringify(room)}::jsonb,${room.deadline})`,
      );
    },
    async mutate(code, change) {
      return db.transaction(async (tx) => {
        const rows = await tx.execute(
          sql`select data from runtime.competition_rooms where code=${code} for update`,
        );
        if (!rows[0]) throw new CompetitionError('INVITATION_NOT_FOUND', 404);
        const room = rows[0].data as Room;
        const result = change(room);
        await tx.execute(
          sql`update runtime.competition_rooms set data=${JSON.stringify(room)}::jsonb,expires_at=${room.deadline} where code=${code}`,
        );
        return result;
      });
    },
  };
  return createCarromRooms(repository, engine, levels, now);
}
