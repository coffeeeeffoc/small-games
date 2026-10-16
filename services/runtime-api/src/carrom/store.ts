import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { CompetitionError } from '../competition/types.js';
import { createCarromRooms } from './rooms.js';
import type { Engine, Level, Repository, Room } from './types.js';
import { assertGameControl, gamePolicy, type CompetitionControl } from '../competition/control.js';

type Database = ReturnType<typeof openDatabase>['db'];
/** Reuse durable room storage and identity; serialize every mutation under a row lock. */
export function createCarromStore(
  db: Database,
  engine: Engine,
  levels: Level[],
  now = Date.now,
  control?: CompetitionControl,
) {
  const repository: Repository = {
    async name(playerId) {
      const rows = await db.execute(
        sql`select coalesce(display_name,'棋友') as name from runtime.competition_players where id=${playerId}`,
      );
      if (!rows[0]) throw new CompetitionError('SESSION_EXPIRED', 401);
      return String(rows[0].name);
    },
    async create(room) {
      await db.transaction(async (tx) => {
        const policy = await gamePolicy(control, tx, 'carrom-club');
        assertGameControl(policy, policy?.killEpoch, true);
        room.killEpoch = policy?.killEpoch ?? 0;
        await tx.execute(
          sql`insert into runtime.competition_rooms values(${room.code},${JSON.stringify(room)}::jsonb,${room.deadline})`,
        );
      });
    },
    async mutate(code, change, operation, input, playerId) {
      return db.transaction(async (tx) => {
        const policy =
          operation === 'leave' ? undefined : await gamePolicy(control, tx, 'carrom-club');
        const rows = await tx.execute(
          sql`select data from runtime.competition_rooms where code=${code} for update`,
        );
        if (!rows[0]) throw new CompetitionError('INVITATION_NOT_FOUND', 404);
        const room = rows[0].data as Room;
        if (room.game !== 'carrom-club') throw new CompetitionError('WRONG_GAME');
        const finishedRead = operation === 'get' && room.status === 'finished';
        const shotHash =
          operation === 'shoot'
            ? createHash('sha256')
                .update(
                  JSON.stringify({
                    round: input?.round,
                    expectedTurnNumber: input?.expectedTurnNumber,
                    shot: input?.shot,
                  }),
                )
                .digest('hex')
            : undefined;
        const duplicate =
          shotHash &&
          room.players.some(
            (member) =>
              member.id === playerId && member.seq === input?.seq && member.lastHash === shotHash,
          );
        if (operation !== 'leave' && !duplicate && !finishedRead)
          assertGameControl(
            policy,
            room.killEpoch ?? 0,
            ['join', 'ready', 'start', 'rematch'].includes(operation ?? ''),
          );
        const result = change(room);
        if (duplicate || finishedRead) return result;
        await tx.execute(
          sql`update runtime.competition_rooms set data=${JSON.stringify(room)}::jsonb,expires_at=${room.deadline} where code=${code}`,
        );
        return result;
      });
    },
  };
  return createCarromRooms(repository, engine, levels, now);
}
