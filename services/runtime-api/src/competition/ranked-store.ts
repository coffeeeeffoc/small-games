import { retainedRule, type NightRelease } from './night-release.js';
import {
  backfillNightClears,
  nightBoard,
  nightLedgerLock,
  nightPoints,
  nightSummary,
  refreshNightClears,
} from './night-ledger.js';
import { sql } from 'drizzle-orm';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { CompetitionError } from './types.js';
import { createRankedRuns } from './ranked-runs.js';
import type { RankedRule, RankedRun, Receipt, RunRepository } from './ranked-types.js';
import { assertGameControl, gamePolicy, type CompetitionControl } from './control.js';
import { assertResourceAuth, playerIdOf } from './auth.js';
import {
  reserveNightLoadout,
  consumeNightLoadout,
  rewardNightBattle,
  refundNightLoadout,
} from './night-assets.js';

type Database = ReturnType<typeof openDatabase>['db'];
/** Namespaced match rows hold checkpoints and small durable idempotency receipts. */
export function createRankedStore(
  db: Database,
  rules: Map<string, RankedRule>,
  identity: (playerId: string) => Promise<{ authenticated: boolean }>,
  now = Date.now,
  control?: CompetitionControl,
  release?: NightRelease,
) {
  const repository: RunRepository = {
    async create(run, auth, initialize) {
      return db.transaction(async (tx) => {
        const policy = await gamePolicy(control, tx, run.game);
        await assertResourceAuth(tx, auth ?? run.playerId, run.game, now());
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`ranked-run:${run.id}`},0))`,
        );
        const existing = await tx.execute(
          sql`select data from runtime.competition_matches where id=${`ranked-run:${run.id}`} for update`,
        );
        if (existing[0]) {
          const stored = existing[0].data as RankedRun;
          if (stored.status === 'active' && !stored.settlement)
            assertGameControl(policy, stored.killEpoch ?? 0);
          return stored;
        }
        assertGameControl(policy, policy?.killEpoch, true);
        await initialize?.();
        run.killEpoch = policy?.killEpoch ?? 0;
        const rule = retainedRule(rules, run.game, run.version, release?.ranked)!;
        if (run.game === 'night-overwatch' && rule.progression && rule.configure) {
          run.loadout = await reserveNightLoadout(
            tx,
            run.playerId,
            now(),
            `run:${run.id}`,
            'solo',
            rule.progression,
            rules.get(run.game)?.progression,
          );
          run.state = rule.configure(run.state, run.loadout);
        }
        await tx.execute(sql`insert into runtime.competition_matches(id,board,data,created_at)
          values(${`ranked-run:${run.id}`},${run.boardKey},${JSON.stringify(run)}::jsonb,${run.createdAt}) on conflict(id) do nothing`);
        const rows = await tx.execute(
          sql`select data from runtime.competition_matches where id=${`ranked-run:${run.id}`} for update`,
        );
        return rows[0]!.data as RankedRun;
      });
    },
    async mutate<T>(
      id: string,
      change: (tx: import('./ranked-types.js').RunTransaction) => Promise<T>,
      auth?: import('./auth.js').PlayerAuth,
    ) {
      const outcome = await db.transaction(async (tx) => {
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
        const current = retainedRule(rules, run.game, run.version, release?.ranked);
        const invalid = !current
          ? 'RULE_VERSION_CHANGED'
          : policy?.state === 'disabled'
            ? 'GAME_DISABLED'
            : policy && policy.killEpoch !== (run.killEpoch ?? 0)
              ? 'GAME_CANCELLED'
              : undefined;
        const original = JSON.stringify(run);
        let result: T;
        try {
          result = await change({
            run,
            async consumeLoadout() {
              const progression = current?.progression;
              if (run.loadout && !run.loadoutStarted && progression) {
                await consumeNightLoadout(
                  tx,
                  run.playerId,
                  now(),
                  `run:${run.id}`,
                  progression,
                  false,
                  rules.get(run.game)?.progression,
                );
                run.loadoutStarted = true;
              }
            },
            async releaseLoadout() {
              const progression = current?.progression;
              if (run.loadout && !run.loadoutStarted && progression)
                await consumeNightLoadout(
                  tx,
                  run.playerId,
                  now(),
                  `run:${run.id}`,
                  progression,
                  true,
                  rules.get(run.game)?.progression,
                );
            },
            async reward(settlement) {
              const progression = current?.progression;
              if (run.game === 'night-overwatch' && progression)
                Object.assign(
                  settlement,
                  await rewardNightBattle(
                    tx,
                    run.playerId,
                    now(),
                    `run:${run.id}`,
                    progression,
                    {
                      mode: 'solo',
                      outcome: settlement.cleared ? 'win' : 'loss',
                      durationMs: settlement.secondary,
                      valid:
                        settlement.complete &&
                        settlement.participated === true &&
                        run.loadoutStarted === true,
                      levelId: run.levelId,
                      firstClear: settlement.firstClear,
                    },
                    rules.get(run.game)?.progression,
                  ),
                );
            },
            assertControl: () => {
              if (invalid) throw new CompetitionError(invalid);
              if (
                !new Set([
                  current?.boardKey?.(run.board),
                  `${run.game}:${run.board}:${current?.boardVersion ?? run.version}`,
                  `${run.game}:${run.board}:${run.version}`,
                ]).has(run.boardKey) ||
                !current?.boards.some((board) => board.id === run.board)
              )
                throw new CompetitionError('WRONG_GAME');
              assertGameControl(policy, run.killEpoch ?? 0);
            },
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
              if (run.game === 'night-overwatch') {
                await backfillNightClears(tx, now());
                await nightLedgerLock(tx);
                const prior = await tx.execute(
                  sql`select 1 from runtime.competition_results where player_id=${run.playerId} and board=${nightBoard(`clear-${run.levelId}`)} union all select 1 from runtime.competition_best where player_id=${run.playerId} and board=${nightBoard(`level-${run.levelId}`)} limit 1`,
                );
                settlement.firstClear = prior.length === 0;
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
                settlement.points = 100;
                settlement.totalPoints = await nightPoints(
                  tx,
                  `run:${id}`,
                  run.playerId,
                  100,
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
        } catch (error) {
          const progression = current?.progression;
          if (
            run.game !== 'night-overwatch' ||
            !run.loadout ||
            !progression ||
            run.status !== 'active' ||
            run.settlement ||
            !invalid ||
            !(error instanceof CompetitionError) ||
            error.code !== invalid
          )
            throw error;
          if (!auth || run.playerId !== playerIdOf(auth))
            throw new CompetitionError('NOT_A_MEMBER', 403);
          await refundNightLoadout(tx, run.playerId, now(), `run:${run.id}`, progression);
          run.status = 'finished';
          await tx.execute(
            sql`update runtime.competition_matches set data=${JSON.stringify(run)}::jsonb where id=${`ranked-run:${id}`}`,
          );
          return { error };
        }
        if (JSON.stringify(run) !== original)
          await tx.execute(
            sql`update runtime.competition_matches set data=${JSON.stringify(run)}::jsonb where id=${`ranked-run:${id}`}`,
          );
        return { result };
      });
      if ('error' in outcome) throw outcome.error;
      return outcome.result;
    },
  };
  return createRankedRuns(repository, rules, identity, now, release);
}
