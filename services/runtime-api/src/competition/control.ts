import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  CONTROL_GAME_IDS,
  controlPublicationSchema,
  normalizeControlSnapshot,
  gameControlPolicySchema,
  type ControlGameId,
  type CorsPolicy,
  type GameControlPolicy,
  type openControlDatabase,
  type ControlDatabaseExecutor,
} from '@coffeeeeffoc/service-kit';
import { CompetitionError } from './types.js';

export type ControlExecutor = ControlDatabaseExecutor;
type Publication = { version: number; digest: string | null; policy: CorsPolicy };
const unavailable = () => new CompetitionError('CONTROL_UNAVAILABLE', 503);
export function assertGameControl(
  policy: GameControlPolicy | undefined,
  epoch = 0,
  admission = false,
) {
  if (!policy) return;
  if (policy.state === 'disabled') throw new CompetitionError('GAME_DISABLED');
  if (epoch !== policy.killEpoch) throw new CompetitionError('GAME_CANCELLED');
  if (admission && policy.state !== 'enabled') throw new CompetitionError('GAME_DRAINING');
}
export type CompetitionControl = ReturnType<typeof createCompetitionControl>;

/** The Runtime identity can only read the published projection/policy and append observations. */
export function createCompetitionControl(
  database: ReturnType<typeof openControlDatabase>,
  fallback: CorsPolicy,
  now = Date.now,
  instanceId: string = randomUUID(),
) {
  if (!instanceId || instanceId.length > 128 || /[\p{Cc}]/u.test(instanceId)) throw unavailable();
  let reported: string | undefined;
  let reportedAt = 0;
  function budget(started = now()) {
    return () => {
      const remaining = Math.floor(started + 2000 - now());
      if (remaining <= 0) throw unavailable();
      return remaining;
    };
  }
  async function execute(
    tx: ControlExecutor,
    query: Parameters<ControlExecutor['execute']>[0],
    remaining: () => number,
  ) {
    const ms = remaining();
    await tx.execute(sql`select set_config('statement_timeout',${`${ms}ms`},true),
      set_config('lock_timeout',${`${Math.min(1500, ms)}ms`},true)`);
    remaining();
    const rows = await tx.execute(query);
    remaining();
    return rows;
  }
  async function read(tx: ControlExecutor, remaining: () => number) {
    try {
      const publications = await execute(
        tx,
        sql`select version,digest,snapshot from game_control.published_config`,
        remaining,
      );
      const rows = await execute(
        tx,
        sql`select game_id,state,kill_epoch,revision from game_control.current_policy order by game_id`,
        remaining,
      );
      const policies = rows.map((row) =>
        gameControlPolicySchema.parse({
          gameId: row.game_id,
          state: row.state,
          killEpoch: Number(row.kill_epoch),
          revision: Number(row.revision),
        }),
      );
      if (
        policies.length !== CONTROL_GAME_IDS.length ||
        new Set(policies.map((p) => p.gameId)).size !== CONTROL_GAME_IDS.length
      )
        throw unavailable();
      remaining();
      if (!publications.length) {
        if (
          policies.some(
            (p) =>
              p.revision !== 0 ||
              p.killEpoch !== 0 ||
              p.state !==
                (['night-overwatch', 'tetracube'].includes(p.gameId) ? 'disabled' : 'enabled'),
          )
        )
          throw unavailable();
        return { version: 0, digest: null, policy: fallback, policies };
      }
      if (publications.length !== 1) throw unavailable();
      const publication = controlPublicationSchema.parse({
        version: Number(publications[0]!.version),
        digest: publications[0]!.digest,
        snapshot: publications[0]!.snapshot,
      });
      const snapshot = normalizeControlSnapshot(publication.snapshot);
      if (
        policies.some(
          (p) => p.revision !== publication.version || p.state !== snapshot.games[p.gameId],
        )
      )
        throw unavailable();
      // Only origins come from the control plane. Existing methods/headers/credentials stay bounded.
      return {
        version: publication.version,
        digest: publication.digest,
        policy: { ...fallback, origins: publication.snapshot.apiOrigins },
        policies,
      };
    } catch {
      throw unavailable();
    }
  }
  async function lock(tx: ControlExecutor, game: string) {
    const remaining = budget();
    if (!(CONTROL_GAME_IDS as readonly string[]).includes(game)) throw unavailable();
    // EXACT same 64-bit key as Management's sorted exclusive publication locks.
    try {
      // This executor belongs to the caller's business transaction. The control
      // budget must not change that transaction's later SQL timeout settings.
      const [timeouts] =
        await tx.execute(sql`select current_setting('statement_timeout') as statement,
        current_setting('lock_timeout') as lock`);
      remaining();
      if (typeof timeouts?.statement !== 'string' || typeof timeouts.lock !== 'string')
        throw unavailable();
      await execute(
        tx,
        sql`select pg_advisory_xact_lock_shared(hashtextextended('game-control:' || ${game},0))`,
        remaining,
      );
      const current = await read(tx, remaining);
      remaining();
      await tx.execute(sql`select set_config('statement_timeout',${timeouts.statement},true),
        set_config('lock_timeout',${timeouts.lock},true)`);
      remaining();
      return current.policies.find((p) => p.gameId === game)!;
    } catch {
      throw unavailable();
    }
  }
  async function projection(tx: ControlExecutor, remaining: () => number) {
    // PostgreSQL evaluates this volatile output after sorting, preserving publication lock order.
    const games = [...CONTROL_GAME_IDS]
      .sort()
      .map((game, index) => sql`(${game}::text,${index}::int)`);
    await execute(
      tx,
      sql`select pg_advisory_xact_lock_shared(hashtextextended('game-control:' || game_id,0))
        from (values ${sql.join(games, sql`,`)}) as games(game_id, position) order by position`,
      remaining,
    );
    return read(tx, remaining);
  }
  async function cors(): Promise<Publication> {
    try {
      return await database.transaction(projection);
    } catch {
      throw unavailable();
    }
  }
  async function appendObservation(
    tx: ControlExecutor,
    remaining: () => number,
    publication: Pick<Publication, 'version' | 'digest'>,
    consumer = 'runtime',
    instance = instanceId,
  ) {
    if (!publication.version || !publication.digest) return;
    if (
      !['runtime', 'kart'].includes(consumer) ||
      !instance ||
      instance.length > 128 ||
      /[\p{Cc}]/u.test(instance)
    )
      throw unavailable();
    const key = `${consumer}:${instance}:${publication.version}:${publication.digest}`;
    if (consumer === 'runtime' && reported === key && now() - reportedAt < 20_000) return;
    await execute(
      tx,
      sql`insert into game_control.application_observations(id,consumer,instance_id,version,digest,status,observed_at)
      values(${randomUUID()},${consumer},${instance},${publication.version},${publication.digest},'applied',${now()})`,
      remaining,
    );
    // Caller runs this only after the transaction's COMMIT completed within the budget.
    return consumer === 'runtime'
      ? () => {
          reported = key;
          reportedAt = now();
        }
      : undefined;
  }
  async function kartLease() {
    return database.transaction(async (tx, remaining) => {
      await execute(
        tx,
        sql`select pg_advisory_xact_lock_shared(hashtextextended('game-control:' || ${'carding-car'},0))`,
        remaining,
      );
      const current = await read(tx, remaining);
      const policy = current.policies.find((p) => p.gameId === 'carding-car')!;
      return {
        controlEnabled: true as const,
        gameId: 'carding-car' as const,
        state: policy.state,
        killEpoch: policy.killEpoch,
        version: current.version,
        digest: current.digest,
        validForMs: remaining(),
      };
    });
  }
  async function publicCors() {
    try {
      const applied = await database.transaction(async (tx, remaining) => {
        const publication = await projection(tx, remaining);
        const committed = await appendObservation(tx, remaining, publication);
        return { policy: publication.policy, committed };
      });
      applied.committed?.();
      return applied.policy;
    } catch {
      throw unavailable();
    }
  }
  async function observeKart(input: { version: number; digest: string; instanceId: string }) {
    return database.transaction(async (tx, remaining) => {
      const current = await projection(tx, remaining);
      if (current.version !== input.version || current.digest !== input.digest)
        throw new CompetitionError('CONTROL_VERSION_CHANGED');
      await appendObservation(tx, remaining, input, 'kart', input.instanceId);
    });
  }
  return { lock, cors, publicCors, observeKart, kartLease, instanceId, close: database.close };
}
export async function gamePolicy(
  control: CompetitionControl | undefined,
  tx: ControlExecutor,
  game: ControlGameId | string,
) {
  return control?.lock(tx, game);
}
