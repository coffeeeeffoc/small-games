import { sql } from 'drizzle-orm';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { assertResourceAuth, playerIdOf, type PlayerAuth } from './auth.js';
import { assertGameControl, gamePolicy, type CompetitionControl } from './control.js';
import { publicProfile } from './profile.js';

export const nightPlayerStatus = (id: ReturnType<typeof sql>, at: number) => sql`case
  when not exists(select 1 from runtime.night_presence np where np.player_id=${id} and np.seen_at>${at - 20000}) then 'offline'
  when exists(select 1 from runtime.night_presence np where np.player_id=${id} and np.activity='playing' and np.seen_at>${at - 20000})
    or exists(select 1 from runtime.competition_rooms cr where cr.data->>'game'='night-overwatch'
      and cr.data->>'status'='playing' and cr.expires_at>${at}
      and exists(select 1 from jsonb_array_elements(cr.data->'players') member where member->>'id'=(${id})::text and not coalesce((member->>'takenOver')::boolean,false)))
    then 'playing' else 'available' end`;

export function createNightPresence(
  db: ReturnType<typeof openDatabase>['db'],
  now: () => number,
  control?: CompetitionControl,
) {
  return (auth: PlayerAuth, cursor?: string, activity = 'available') =>
    db.transaction(async (tx) => {
      const policy = await gamePolicy(control, tx, 'night-overwatch');
      await assertResourceAuth(tx, auth, 'night-overwatch', now());
      assertGameControl(policy, policy?.killEpoch, true);
      const at = now();
      await tx.execute(sql`insert into runtime.night_presence(player_id,seen_at,activity)
      values(${playerIdOf(auth)},${at},${activity}) on conflict(player_id)
      do update set seen_at=greatest(runtime.night_presence.seen_at,excluded.seen_at),activity=excluded.activity`);
      const rows = await tx.execute(sql`select count(*)::int as count from runtime.night_presence
      where seen_at>${at - 20000}`);
      const players =
        await tx.execute(sql`select p.id,p.display_name,p.profile,${nightPlayerStatus(sql`p.id`, at)} as status
        from runtime.night_presence n join runtime.competition_players p on p.id=n.player_id
        where n.seen_at>${at - 20000} ${cursor ? sql`and p.id>${cursor}::uuid` : sql``}
        order by p.id limit 51`);
      return {
        onlineCount: Number(rows[0]!.count),
        players: players.slice(0, 50).map((row) => ({
          playerId: String(row.id),
          nickname: publicProfile(row).nickname,
          online: true,
          status: String(row.status),
        })),
        ...(players.length > 50 ? { nextCursor: String(players[49]!.id) } : {}),
      };
    });
}
