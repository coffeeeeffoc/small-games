import { sql } from 'drizzle-orm';
import { isDeepStrictEqual } from 'node:util';
import { CompetitionError } from '../competition/types.js';
import {
  LOGIN_REASON,
  publicState,
  type Database,
  type Engine,
  type Placement,
  type RankedSession,
  type Transaction,
} from './types.js';

export function createRankedLedger(
  db: Database,
  engine: Engine,
  now: () => number,
  reviewScore: number,
) {
  async function ranking(version: string, playerId: string, executor: Database | Transaction = db) {
    const rows = await executor.execute(sql`with ranked as (
      select b.player_id as "playerId", coalesce(p.display_name,'新玩家') as name, p.platform,
        b.score::float8 as score, b.achieved_at::float8 as "achievedAt",
        rank() over(order by b.score desc)::int as rank,
        row_number() over(order by b.score desc,b.achieved_at,b.player_id)::int as position,
        count(*) over()::int as total
      from runtime.three_choose_two_best b join runtime.competition_players p on p.id=b.player_id
      where b.version=${version} and p.platform in ('wechat','bilibili') and p.subject is not null
    ) select * from ranked where position<=100 or "playerId"=${playerId}
      or abs(position-(select position from ranked where "playerId"=${playerId}))<=2
      order by position`);
    const me = rows.find((row) => row.playerId === playerId) ?? null;
    return {
      version,
      updatedAt: now(),
      top: rows.filter((row) => Number(row.position) <= 100),
      me,
      around: me
        ? rows.filter((row) => Math.abs(Number(row.position) - Number(me.position)) <= 2)
        : [],
      total: Number(rows[0]?.total ?? 0),
      reason: me ? null : '完成一局无尽挑战后上榜',
    };
  }
  async function recompute(tx: Transaction, version: string, playerId: string) {
    await tx.execute(
      sql`delete from runtime.three_choose_two_best where version=${version} and player_id=${playerId}`,
    );
    await tx.execute(sql`insert into runtime.three_choose_two_best(version,player_id,session_id,score,achieved_at)
      select version,player_id,session_id,score,finished_at from runtime.three_choose_two_results
      where version=${version} and player_id=${playerId} and status='verified'
      order by score desc,finished_at,session_id limit 1`);
  }
  async function replay(tx: Transaction, session: RankedSession) {
    if (session.version !== engine.RULE_VERSION || session.randomVersion !== engine.RANDOM_VERSION)
      throw new CompetitionError('RULE_VERSION_CHANGED');
    const rows = await tx.execute(
      sql`select seq,action from runtime.three_choose_two_actions where session_id=${session.id} order by seq`,
    );
    let state = engine.createEndless(session.seed, { ranked: true });
    for (const [index, row] of rows.entries()) {
      const action = row.action as Placement;
      if (Number(row.seq) !== index + 1 || action.seq !== index + 1 || action.group !== state.group)
        throw new CompetitionError('REPLAY_INVALID', 500);
      const next = engine.place(state, action.slot, action.x, action.y);
      if (next === state) throw new CompetitionError('REPLAY_INVALID', 500);
      state = next;
    }
    if (rows.length !== session.seq) throw new CompetitionError('REPLAY_INVALID', 500);
    return state;
  }
  async function settle(tx: Transaction, session: RankedSession, expired = false) {
    if (session.status === 'finished') return;
    const replayed = await replay(tx, session);
    const mismatch = !isDeepStrictEqual(publicState(replayed), publicState(session.state));
    session.state = engine.finishEndless(replayed);
    if (!Number.isSafeInteger(session.state.score) || session.state.score < 0)
      throw new CompetitionError('INVALID_RESULT', 500);
    session.status = 'finished';
    const status = !session.eligible
      ? 'ineligible'
      : mismatch || session.state.score >= reviewScore
        ? 'pending-review'
        : 'verified';
    const finishedAt = now();
    // All writers take the session row before this board lock, including review/revocation.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`three-choose-two:${session.version}`}))`,
    );
    const previous = await tx.execute(
      sql`select score from runtime.three_choose_two_best where version=${session.version} and player_id=${session.playerId}`,
    );
    const isPersonalBest =
      status === 'verified' && (!previous[0] || session.state.score > Number(previous[0].score));
    const reason = !session.eligible
      ? LOGIN_REASON
      : mismatch
        ? 'REPLAY_MISMATCH'
        : status === 'pending-review'
          ? 'HIGH_SCORE_REVIEW'
          : expired
            ? 'SESSION_EXPIRED'
            : null;
    await tx.execute(sql`insert into runtime.three_choose_two_results(session_id,player_id,version,status,score,finished_at,reason)
      values(${session.id},${session.playerId},${session.version},${status},${session.state.score},${finishedAt},${reason})
      on conflict(session_id) do nothing`);
    if (status === 'verified') await recompute(tx, session.version, session.playerId);
    session.settlement = {
      status,
      reason,
      score: session.state.score,
      stats: session.state.stats,
      finishedAt,
      isPersonalBest,
    };
  }
  async function review(
    tx: Transaction,
    session: RankedSession,
    decision: 'approve' | 'reject',
    reason: string,
  ) {
    if (!session.settlement) throw new CompetitionError('SESSION_ACTIVE');
    if (!session.eligible && decision === 'approve')
      throw new CompetitionError('IDENTITY_INELIGIBLE', 422);
    if (decision === 'approve' && session.settlement.status === 'rejected')
      throw new CompetitionError('RESULT_REVOKED');
    await replay(tx, session);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`three-choose-two:${session.version}`}))`,
    );
    const previous = await tx.execute(
      sql`select score,session_id from runtime.three_choose_two_best where version=${session.version} and player_id=${session.playerId}`,
    );
    const status = decision === 'approve' ? 'verified' : 'rejected';
    await tx.execute(
      sql`update runtime.three_choose_two_results set status=${status},review_reason=${reason},reviewed_at=${now()} where session_id=${session.id}`,
    );
    await recompute(tx, session.version, session.playerId);
    session.settlement.isPersonalBest =
      decision === 'approve' &&
      (!previous[0] ||
        session.settlement.score > Number(previous[0].score) ||
        (previous[0].session_id === session.id && session.settlement.isPersonalBest));
    session.settlement.status = status;
    session.settlement.reason = reason;
  }
  return { ranking, settle, replay, review };
}
