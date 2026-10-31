import { sql } from 'drizzle-orm';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
type Database = ReturnType<typeof openDatabase>['db'];
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
const walletBoard = 'night-overwatch:private-wallet-v1';
const eventId = (owner: string, event: string) => 'night-wallet-event:' + owner + ':' + event;
export async function backfillClearCoins(
  tx: Tx,
  owner: string,
  at: number,
  reward: (level: string, first: boolean) => number,
) {
  const marker = 'migration:first-clear-coins-v2';
  if (
    (
      await tx.execute(
        sql`select id from runtime.competition_matches where id=${eventId(owner, marker)}`,
      )
    ).length
  )
    return;
  const rows =
    await tx.execute(sql`select board from runtime.competition_results where player_id=${owner} and score>0
    union select board from runtime.competition_best where player_id=${owner} and score>0`);
  const levels = [
    ...new Set(
      rows
        .map(
          (row) =>
            String(row.board).match(
              /^night-overwatch:(?:clear|level)-([a-z0-9-]+):(?:night-records-v1|night-input-replay-v[0-9]+)$/,
            )?.[1],
        )
        .filter((id): id is string => !!id && reward(id, true) > 0),
    ),
  ];
  const paid = await tx.execute(
    sql`select data from runtime.competition_matches where board=${walletBoard} and id like ${eventId(owner, 'clear:%')} and data->>'first'='true'`,
  );
  let coins = 0;
  for (const level of levels) {
    const issued = paid.reduce((sum, row) => {
      const data = row.data as { level: string; coins: number };
      return sum + (data.level === level ? data.coins : 0);
    }, 0);
    coins += Math.max(0, reward(level, true) - issued);
    await tx.execute(sql`insert into runtime.competition_matches(id,board,data,created_at)
      values(${eventId(owner, 'first:' + level)},${walletBoard},${JSON.stringify({ level, source: marker })}::jsonb,${at}) on conflict(id) do nothing`);
  }
  return { event: marker, coins, levels };
}
