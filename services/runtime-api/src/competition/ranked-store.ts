import { sql } from 'drizzle-orm';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { CompetitionError } from './types.js';
import { createRankedRuns } from './ranked-runs.js';
import type { RankedRule, RankedRun, Receipt, RunRepository } from './ranked-types.js';

type Database = ReturnType<typeof openDatabase>['db'];
/** Namespaced match rows hold checkpoints and small durable idempotency receipts. */
export function createRankedStore(
  db: Database,
  rules: Map<string, RankedRule>,
  identity: (playerId: string) => Promise<{ authenticated: boolean }>,
  now = Date.now,
) {
  const repository: RunRepository = {
    async create(run) {
      await db.execute(sql`insert into runtime.competition_matches(id,board,data,created_at)
        values(${`ranked-run:${run.id}`},${run.boardKey},${JSON.stringify(run)}::jsonb,${run.createdAt})`);
    },
    async mutate(id, change) {
      return db.transaction(async (tx) => {
        const rows = await tx.execute(
          sql`select data from runtime.competition_matches where id=${`ranked-run:${id}`} for update`,
        );
        const run = rows[0]?.data as RankedRun | undefined;
        if (!run || run.kind !== 'ranked-run-v1') throw new CompetitionError('RUN_NOT_FOUND', 404);
        const result = await change({
          run,
          async receipt(seq) {
            const receipts = await tx.execute(
              sql`select data from runtime.competition_matches where id=${`ranked-action:${id}:${seq}`}`,
            );
            return receipts[0]?.data as Receipt | undefined;
          },
          async saveReceipt(seq, receipt) {
            await tx.execute(sql`insert into runtime.competition_matches(id,board,data,created_at)
              values(${`ranked-action:${id}:${seq}`},${run.boardKey},${JSON.stringify(receipt)}::jsonb,${now()})`);
          },
          async record(settlement) {
            const matchId = `ranked-result:${id}:${run.board}`;
            await tx.execute(sql`insert into runtime.competition_results(match_id,board,player_id,score,secondary,created_at)
              values(${matchId},${run.boardKey},${run.playerId},${settlement.score},${settlement.secondary},${now()}) on conflict do nothing`);
            await tx.execute(sql`insert into runtime.competition_best(board,player_id,score,secondary,match_id,updated_at)
              values(${run.boardKey},${run.playerId},${settlement.score},${settlement.secondary},${matchId},${now()})
              on conflict(board,player_id) do update set score=excluded.score,secondary=excluded.secondary,match_id=excluded.match_id,updated_at=excluded.updated_at
              where excluded.score>runtime.competition_best.score or
              (excluded.score=runtime.competition_best.score and excluded.secondary<runtime.competition_best.secondary)`);
          },
        });
        await tx.execute(
          sql`update runtime.competition_matches set data=${JSON.stringify(run)}::jsonb where id=${`ranked-run:${id}`}`,
        );
        return result;
      });
    },
  };
  return createRankedRuns(repository, rules, identity, now);
}
