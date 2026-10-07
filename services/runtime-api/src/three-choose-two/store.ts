import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { CompetitionError } from '../competition/types.js';
import { createRankedLedger } from './ledger.js';
import {
  LOGIN_REASON,
  publicState,
  type Database,
  type Engine,
  type Placement,
  type RankedSession,
  type Transaction,
} from './types.js';

const hash = (value: Placement) =>
  createHash('sha256')
    .update(JSON.stringify([value.seq, value.group, value.slot, value.x, value.y]))
    .digest('hex');

export function createThreeChooseTwoStore(
  db: Database,
  engine: Engine,
  now = Date.now,
  reviewScore = 100_000,
) {
  const ledger = createRankedLedger(db, engine, now, reviewScore);
  async function save(tx: Transaction, session: RankedSession) {
    await tx.execute(
      sql`update runtime.three_choose_two_sessions set status=${session.status},data=${JSON.stringify(session)}::jsonb where id=${session.id}`,
    );
  }
  async function eligible(playerId: string, executor: Database | Transaction = db) {
    const rows = await executor.execute(
      sql`select platform,subject from runtime.competition_players where id=${playerId}`,
    );
    if (!rows[0]) throw new CompetitionError('SESSION_EXPIRED', 401);
    return (
      ['wechat', 'bilibili'].includes(String(rows[0].platform)) &&
      typeof rows[0].subject === 'string' &&
      !!rows[0].subject
    );
  }
  async function view(session: RankedSession, executor: Database | Transaction = db) {
    const rows = await executor.execute(
      sql`select score::float8 as score from runtime.three_choose_two_best where version=${session.version} and player_id=${session.playerId}`,
    );
    const personalBest = Number(rows[0]?.score ?? 0);
    const board = session.settlement
      ? await ledger.ranking(session.version, session.playerId, executor)
      : null;
    return {
      id: session.id,
      version: session.version,
      shapeVersion: session.shapeVersion,
      difficultyVersion: session.difficultyVersion,
      scoringVersion: session.scoringVersion,
      randomVersion: session.randomVersion,
      status: session.status,
      seq: session.seq,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      serverNow: now(),
      eligible: session.eligible,
      rankingReason: session.eligible ? null : LOGIN_REASON,
      personalBest,
      state: publicState(session.state),
      settlement: session.settlement
        ? { ...session.settlement, personalBest, rank: board?.me?.rank ?? null }
        : null,
    };
  }
  async function locked(tx: Transaction, id: string, playerId?: string) {
    const rows = await tx.execute(
      sql`select data from runtime.three_choose_two_sessions where id=${id} for update`,
    );
    if (!rows[0]) throw new CompetitionError('SESSION_NOT_FOUND', 404);
    const session = rows[0].data as RankedSession;
    if (playerId && session.playerId !== playerId) throw new CompetitionError('NOT_A_MEMBER', 403);
    return session;
  }
  async function expire(tx: Transaction, session: RankedSession) {
    if (session.status === 'active' && session.expiresAt <= now()) {
      await ledger.settle(tx, session, true);
      await save(tx, session);
    }
  }
  async function create(playerId: string) {
    return db.transaction(async (tx) => {
      // Serialize creation across devices; the partial unique index is an additional guard.
      await tx.execute(
        sql`select id from runtime.competition_players where id=${playerId} for update`,
      );
      const canRank = await eligible(playerId, tx);
      const rows = await tx.execute(
        sql`select data from runtime.three_choose_two_sessions where player_id=${playerId} and status='active' for update`,
      );
      if (rows[0]) {
        const active = rows[0].data as RankedSession;
        await expire(tx, active);
        if (active.status === 'active') return view(active, tx);
      }
      const session: RankedSession = {
        id: randomUUID(),
        playerId,
        version: engine.RULE_VERSION,
        shapeVersion: engine.SHAPES_VERSION,
        difficultyVersion: engine.DIFFICULTY_VERSION,
        scoringVersion: engine.SCORING_VERSION,
        randomVersion: engine.RANDOM_VERSION,
        seed: randomBytes(32).toString('hex'),
        seq: 0,
        status: 'active',
        createdAt: now(),
        expiresAt: now() + 86_400_000,
        eligible: canRank,
        state: {} as RankedSession['state'],
        settlement: null,
      };
      session.state = engine.createEndless(session.seed, { ranked: true });
      await tx.execute(sql`insert into runtime.three_choose_two_sessions(id,player_id,version,status,data,created_at,expires_at)
        values(${session.id},${playerId},${session.version},${session.status},${JSON.stringify(session)}::jsonb,${session.createdAt},${session.expiresAt})`);
      return view(session, tx);
    });
  }
  async function get(playerId: string, id: string) {
    return db.transaction(async (tx) => {
      const session = await locked(tx, id, playerId);
      await expire(tx, session);
      return view(session, tx);
    });
  }
  async function action(playerId: string, id: string, input: Placement) {
    return db.transaction(async (tx) => {
      const session = await locked(tx, id, playerId);
      await expire(tx, session);
      const actionHash = hash(input);
      const duplicate = await tx.execute(
        sql`select action_hash from runtime.three_choose_two_actions where session_id=${id} and seq=${input.seq}`,
      );
      if (duplicate[0]) {
        if (duplicate[0].action_hash !== actionHash) throw new CompetitionError('ACTION_CONFLICT');
        return view(session, tx);
      }
      if (session.status !== 'active') return view(session, tx);
      if (session.version !== engine.RULE_VERSION)
        throw new CompetitionError('RULE_VERSION_CHANGED');
      if (input.seq !== session.seq + 1) throw new CompetitionError('SEQUENCE_CONFLICT');
      if (input.group !== session.state.group) throw new CompetitionError('GROUP_CONFLICT');
      const next = engine.place(session.state, input.slot, input.x, input.y);
      if (next === session.state) throw new CompetitionError('ILLEGAL_ACTION', 422);
      session.state = next;
      session.seq = input.seq;
      await tx.execute(sql`insert into runtime.three_choose_two_actions(session_id,seq,action_hash,action,created_at)
        values(${id},${input.seq},${actionHash},${JSON.stringify(input)}::jsonb,${now()})`);
      if (next.status !== 'playing') await ledger.settle(tx, session);
      await save(tx, session);
      return view(session, tx);
    });
  }
  async function finish(playerId: string, id: string) {
    return db.transaction(async (tx) => {
      const session = await locked(tx, id, playerId);
      await ledger.settle(tx, session, session.expiresAt <= now());
      await save(tx, session);
      return view(session, tx);
    });
  }
  async function expireDue() {
    const rows = await db.execute(
      sql`select id from runtime.three_choose_two_sessions where status='active' and expires_at<=${now()} order by expires_at limit 100`,
    );
    for (const row of rows) {
      await db.transaction(async (tx) => {
        const session = await locked(tx, String(row.id));
        await expire(tx, session);
      });
    }
  }
  async function board(playerId: string, version = engine.RULE_VERSION) {
    await expireDue();
    const result = await ledger.ranking(version, playerId);
    return { ...result, reason: (await eligible(playerId)) ? result.reason : LOGIN_REASON };
  }
  async function audit(id: string) {
    return db.transaction(async (tx) => {
      const session = await locked(tx, id);
      const actions = await tx.execute(
        sql`select seq,action,created_at as "createdAt" from runtime.three_choose_two_actions where session_id=${id} order by seq`,
      );
      return { session, actions, replayed: await ledger.replay(tx, session) };
    });
  }
  async function review(id: string, decision: 'approve' | 'reject', reason: string) {
    return db.transaction(async (tx) => {
      const session = await locked(tx, id);
      await ledger.review(tx, session, decision, reason);
      await save(tx, session);
      return view(session, tx);
    });
  }
  return { create, get, action, finish, board, expireDue, audit, review };
}
