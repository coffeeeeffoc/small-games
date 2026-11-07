import { sql } from 'drizzle-orm';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { assertResourceAuth, playerIdOf, type PlayerAuth } from './auth.js';
import { assertGameControl, gamePolicy, type CompetitionControl } from './control.js';

export function createNightPresence(
  db: ReturnType<typeof openDatabase>['db'],
  now: () => number,
  control?: CompetitionControl,
) {
  return (auth: PlayerAuth) =>
    db.transaction(async (tx) => {
      const policy = await gamePolicy(control, tx, 'night-overwatch');
      await assertResourceAuth(tx, auth, 'night-overwatch', now());
      assertGameControl(policy, policy?.killEpoch, true);
      const at = now();
      await tx.execute(sql`insert into runtime.night_presence(player_id,seen_at)
      values(${playerIdOf(auth)},${at}) on conflict(player_id)
      do update set seen_at=greatest(runtime.night_presence.seen_at,excluded.seen_at)`);
      const rows = await tx.execute(sql`select count(*)::int as count from runtime.night_presence
      where seen_at>${at - 20000}`);
      return { onlineCount: Number(rows[0]!.count) };
    });
}
