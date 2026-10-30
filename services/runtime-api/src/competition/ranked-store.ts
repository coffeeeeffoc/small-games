import {
  backfillNightClears,
  nightBoard,
  nightLedgerLock,
  nightSummary,
  refreshNightClears,
} from './night-ledger.js';
import { sql } from 'drizzle-orm';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { CompetitionError } from './types.js';
import { createRankedRuns } from './ranked-runs.js';
import type { RankedRule, RankedRun, Receipt, RunRepository } from './ranked-types.js';
import { assertGameControl, gamePolicy, type CompetitionControl } from './control.js';
import { awardNightClear, checkNightLoadout, useNightCoolant } from './night-wallet.js';
import { assertResourceAuth } from './auth.js';

type Database = ReturnType<typeof openDatabase>['db'];
/** Namespaced match rows hold checkpoints and small durable idempotency receipts. */
export function createRankedStore(
  db: Database,
  rules: Map<string, RankedRule>,
  identity: (playerId: string) => Promise<{ authenticated: boolean }>,
  now = Date.now,
  control?: CompetitionControl,
) {
  const repository: RunRepository = {
    async create(run, auth) {
      return db.transaction(async (tx) => {
        const policy = await gamePolicy(control, tx, run.game);
        await assertResourceAuth(tx, auth ?? run.playerId, run.game, now());
        const existing = await tx.execute(
          sql`select data from runtime.competition_matches where id=${`ranked-run:${run.id}`} for update`,
        );
        if (existing[0]) {
          const stored = existing[0].data as RankedRun;
          assertGameControl(policy, stored.killEpoch ?? 0);
          return stored;
        }
        assertGameControl(policy, policy?.killEpoch, true);
        if (run.loadout?.length)
          await checkNightLoadout(tx, run.playerId, run.loadout, false, now());
        run.killEpoch = policy?.killEpoch ?? 0;
        await tx.execute(sql`insert into runtime.competition_matches(id,board,data,created_at)
          values(${`ranked-run:${run.id}`},${run.boardKey},${JSON.stringify(run)}::jsonb,${run.createdAt}) on conflict(id) do nothing`);
        const rows = await tx.execute(
          sql`select data from runtime.competition_matches where id=${`ranked-run:${run.id}`} for update`,
        );
        return rows[0]!.data as RankedRun;
      });
    },
    async mutate(id, change, auth) {
      return db.transaction(async (tx) => {
        let policy: Awaited<ReturnType<typeof gamePolicy>>;
        if (control) {
          const preview = await tx.execute(
            sql`select data from runtime.competition_matches where id=${`ranked-run:${id}`}`,
          );
          if (!preview[0]) throw new CompetitionError('RUN_NOT_FOUND', 404);
          policy = await gamePolicy(control, tx, (preview[0].data as RankedRun).game);
        }
        const rows = await tx.execute(
          sql`select data from runtime.competition_matches where id=${`ranked-run:${id}`} for update`,
        );
        const run = rows[0]?.data as RankedRun | undefined;
        if (!run || run.kind !== 'ranked-run-v1') throw new CompetitionError('RUN_NOT_FOUND', 404);
        if (policy && policy.gameId !== run.game) throw new CompetitionError('WRONG_GAME');
        if (auth) await assertResourceAuth(tx, auth, run.game, now());
        if (
          !new Set([
            `${run.game}:${run.board}:${rules.get(run.game)?.boardVersionFor?.(run.board) ?? rules.get(run.game)?.boardVersion ?? run.version}`,
            `${run.game}:${run.board}:${rules.get(run.game)?.boardVersion ?? run.version}`,
            `${run.game}:${run.board}:${run.version}`,
          ]).has(run.boardKey) ||
          !rules.get(run.game)?.boards.some((board) => board.id === run.board)
        )
          throw new CompetitionError('WRONG_GAME');
        const original = JSON.stringify(run);
        const result = await change({
          run,
          assertControl: () => assertGameControl(policy, run.killEpoch ?? 0),
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
          async useCoolant() {
            if (run.game !== 'night-overwatch') throw new CompetitionError('WRONG_GAME');
            await useNightCoolant(tx, run.playerId, run.id, now());
          },
          async record(settlement) {
            if (run.game === 'night-overwatch') {
              await backfillNightClears(tx, now());
              await nightLedgerLock(tx);
            }
            const matchId = `ranked-result:${id}:${run.board}`;
            const eventBoard =
              run.game === 'night-overwatch' ? nightBoard(`clear-${run.levelId}`) : run.boardKey;
            const inserted =
              await tx.execute(sql`insert into runtime.competition_results(match_id,board,player_id,score,secondary,created_at)
              values(${matchId},${eventBoard},${run.playerId},${settlement.score},${settlement.secondary},${now()}) on conflict do nothing returning player_id`);
            if (!inserted.length) return;
            if (settlement.fastestEligible !== false)
              await tx.execute(sql`insert into runtime.competition_best(board,player_id,score,secondary,match_id,updated_at)
              values(${run.boardKey},${run.playerId},${settlement.score},${settlement.secondary},${matchId},${now()})
              on conflict(board,player_id) do update set score=excluded.score,secondary=excluded.secondary,match_id=excluded.match_id,updated_at=excluded.updated_at
              where excluded.score>runtime.competition_best.score or
              (excluded.score=runtime.competition_best.score and excluded.secondary<runtime.competition_best.secondary)`);
            if (run.game === 'night-overwatch') {
              settlement.coins = await awardNightClear(
                tx,
                run.playerId,
                run.id,
                run.levelId!,
                now(),
              );
              await refreshNightClears(tx, now(), run.playerId);
              const rows = await tx.execute(
                sql`select score from runtime.competition_best where player_id=${run.playerId} and board=${nightBoard('clears')}`,
              );
              settlement.clears = Number(rows[0]!.score);
              const summary = await nightSummary(tx, run.playerId);
              settlement.wins = summary.wins;
              settlement.games = summary.games;
            }
          },
        });
        if (JSON.stringify(run) !== original)
          await tx.execute(
            sql`update runtime.competition_matches set data=${JSON.stringify(run)}::jsonb where id=${`ranked-run:${id}`}`,
          );
        return result;
      });
    },
  };
  return createRankedRuns(repository, rules, identity, now);
}
