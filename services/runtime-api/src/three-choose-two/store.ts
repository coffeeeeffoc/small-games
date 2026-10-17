import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { CompetitionError } from '../competition/types.js';
import { createRankedLedger } from './ledger.js';
import { assertGameControl, gamePolicy, type CompetitionControl } from '../competition/control.js';
import {
  assertGameScope,
  assertResourceAuth,
  assertStoredPlayerGame,
  playerIdOf,
  type PlayerAuth,
} from '../competition/auth.js';
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
  control?: CompetitionControl,
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
      ...(session.cancelled ? { cancelled: true, error: 'GAME_CANCELLED' } : {}),
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
  async function storedSession(tx: Transaction, id: string) {
    const preview = await tx.execute(
      sql`select data from runtime.three_choose_two_sessions where id=${id}`,
    );
    if (!preview[0]) throw new CompetitionError('SESSION_NOT_FOUND', 404);
    const playerId = (preview[0].data as RankedSession).playerId;
    // Creation already locks player before active session; every other path keeps that order.
    await assertStoredPlayerGame(tx, playerId, 'three-choose-two', now());
    return locked(tx, id, playerId);
  }
  async function expire(
    tx: Transaction,
    session: RankedSession,
    policy?: Awaited<ReturnType<typeof gamePolicy>>,
  ) {
    if (session.status === 'active' && session.expiresAt <= now()) {
      if (
        policy &&
        (policy.state === 'disabled' || (session.killEpoch ?? 0) !== policy.killEpoch)
      ) {
        session.status = 'finished';
        session.cancelled = true;
        // Persist a cancellation with no result; do not throw it away by rolling back.
        await save(tx, session);
        return;
      }
      await ledger.settle(tx, session, true);
      await save(tx, session);
    }
  }
  async function create(auth: PlayerAuth, token?: string) {
    assertGameScope(auth, 'three-choose-two');
    const playerId = playerIdOf(auth);
    return db.transaction(async (tx) => {
      const policy = await gamePolicy(control, tx, 'three-choose-two');
      assertGameControl(policy, policy?.killEpoch, true);
      // Serialize creation across devices; the partial unique index is an additional guard.
      await tx.execute(
        sql`select id from runtime.competition_players where id=${playerId} for update`,
      );
      await assertResourceAuth(tx, auth, 'three-choose-two', now());
      // Logout revokes session credentials under this same player lock.
      if (token) {
        const valid = await tx.execute(sql`select 1 from runtime.competition_sessions
          where player_id=${playerId} and token_hash=${createHash('sha256').update(token).digest('hex')}
          and expires_at>${now()}`);
        if (!valid[0]) throw new CompetitionError('SESSION_EXPIRED', 401);
      }
      const canRank = await eligible(playerId, tx);
      const rows = await tx.execute(
        sql`select data from runtime.three_choose_two_sessions where player_id=${playerId} and status='active' for update`,
      );
      if (rows[0]) {
        const active = rows[0].data as RankedSession;
        if (policy && (active.killEpoch ?? 0) !== policy.killEpoch) {
          active.status = 'finished';
          active.cancelled = true;
          await save(tx, active);
        } else await expire(tx, active, policy);
        if (active.status === 'active') return view(active, tx);
      }
      const session: RankedSession = {
        killEpoch: policy?.killEpoch ?? 0,
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
  async function get(auth: PlayerAuth, id: string) {
    assertGameScope(auth, 'three-choose-two');
    const playerId = playerIdOf(auth);
    return db.transaction(async (tx) => {
      const policy = await gamePolicy(control, tx, 'three-choose-two');
      await assertResourceAuth(tx, auth, 'three-choose-two', now());
      const session = await locked(tx, id, playerId);
      if (session.status === 'active') assertGameControl(policy, session.killEpoch ?? 0);
      await expire(tx, session, policy);
      return view(session, tx);
    });
  }
  async function action(auth: PlayerAuth, id: string, input: Placement) {
    assertGameScope(auth, 'three-choose-two');
    const playerId = playerIdOf(auth);
    return db.transaction(async (tx) => {
      const policy = await gamePolicy(control, tx, 'three-choose-two');
      await assertResourceAuth(tx, auth, 'three-choose-two', now());
      const session = await locked(tx, id, playerId);
      const actionHash = hash(input);
      const duplicate = await tx.execute(
        sql`select action_hash from runtime.three_choose_two_actions where session_id=${id} and seq=${input.seq}`,
      );
      if (duplicate[0]) {
        if (duplicate[0].action_hash !== actionHash) throw new CompetitionError('ACTION_CONFLICT');
        return view(session, tx);
      }
      if (session.status !== 'active') return view(session, tx);
      assertGameControl(policy, session.killEpoch ?? 0);
      await expire(tx, session, policy);
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
  async function finish(auth: PlayerAuth, id: string) {
    assertGameScope(auth, 'three-choose-two');
    const playerId = playerIdOf(auth);
    return db.transaction(async (tx) => {
      const policy = await gamePolicy(control, tx, 'three-choose-two');
      await assertResourceAuth(tx, auth, 'three-choose-two', now());
      const session = await locked(tx, id, playerId);
      if (session.status === 'finished') return view(session, tx);
      assertGameControl(policy, session.killEpoch ?? 0);
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
        const policy = await gamePolicy(control, tx, 'three-choose-two');
        const session = await storedSession(tx, String(row.id));
        await expire(tx, session, policy);
      });
    }
  }
  async function board(auth: PlayerAuth, version = engine.RULE_VERSION) {
    assertGameScope(auth, 'three-choose-two');
    const playerId = playerIdOf(auth);
    await db.transaction((tx) => assertResourceAuth(tx, auth, 'three-choose-two', now()));
    await expireDue();
    const result = await ledger.ranking(version, playerId);
    return { ...result, reason: (await eligible(playerId)) ? result.reason : LOGIN_REASON };
  }
  async function audit(id: string) {
    return db.transaction(async (tx) => {
      const policy = await gamePolicy(control, tx, 'three-choose-two');
      const session = await storedSession(tx, id);
      assertGameControl(policy, session.killEpoch ?? 0);
      const actions = await tx.execute(
        sql`select seq,action,created_at as "createdAt" from runtime.three_choose_two_actions where session_id=${id} order by seq`,
      );
      return { session, actions, replayed: await ledger.replay(tx, session) };
    });
  }
  async function review(id: string, decision: 'approve' | 'reject', reason: string) {
    return db.transaction(async (tx) => {
      const policy = await gamePolicy(control, tx, 'three-choose-two');
      const session = await storedSession(tx, id);
      assertGameControl(policy, session.killEpoch ?? 0);
      await ledger.review(tx, session, decision, reason);
      await save(tx, session);
      return view(session, tx);
    });
  }
  return { create, get, action, finish, board, expireDue, audit, review };
}
