import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  CONTROL_GAME_IDS,
  controlPublicationSchema,
  gameControlPolicySchema,
  type ControlGameId,
  type CorsPolicy,
  type GameControlPolicy,
  type openDatabase,
} from '@coffeeeeffoc/service-kit';
import { CompetitionError } from './types.js';

type Database = ReturnType<typeof openDatabase>['db'];
export type ControlExecutor = Pick<Database, 'execute'>;
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
  db: Database,
  fallback: CorsPolicy,
  now = Date.now,
  instanceId: string = randomUUID(),
) {
  if (!instanceId || instanceId.length > 128 || /[\p{Cc}]/u.test(instanceId)) throw unavailable();
  let reported: string | undefined;
  let reportedAt = 0;
  async function read(tx: ControlExecutor, started: number) {
    try {
      if (now() - started > 2000) throw unavailable();
      const publications = await tx.execute(
        sql`select version,digest,snapshot from game_control.published_config`,
      );
      if (now() - started > 2000) throw unavailable();
      const rows = await tx.execute(
        sql`select game_id,state,kill_epoch,revision from game_control.current_policy order by game_id`,
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
      if (now() - started > 2000) throw unavailable();
      if (!publications.length) {
        if (policies.some((p) => p.revision !== 0 || p.killEpoch !== 0 || p.state !== 'enabled'))
          throw unavailable();
        return { version: 0, digest: null, policy: fallback, policies };
      }
      if (publications.length !== 1) throw unavailable();
      const publication = controlPublicationSchema.parse({
        version: Number(publications[0]!.version),
        digest: publications[0]!.digest,
        snapshot: publications[0]!.snapshot,
      });
      if (
        policies.some(
          (p) =>
            p.revision !== publication.version || p.state !== publication.snapshot.games[p.gameId],
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
    const started = now();
    if (!(CONTROL_GAME_IDS as readonly string[]).includes(game)) throw unavailable();
    // EXACT same 64-bit key as Management's sorted exclusive publication locks.
    try {
      await tx.execute(sql`set local lock_timeout = '1500ms'`);
      await tx.execute(sql`set local statement_timeout = '2000ms'`);
      await tx.execute(
        sql`select pg_advisory_xact_lock_shared(hashtextextended('game-control:' || ${game},0))`,
      );
      const current = await read(tx, started);
      return current.policies.find((p) => p.gameId === game)!;
    } catch {
      throw unavailable();
    }
  }
  async function cors(): Promise<Publication> {
    const started = now();
    return db
      .transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '1500ms'`);
        await tx.execute(sql`set local statement_timeout = '2000ms'`);
        for (const game of [...CONTROL_GAME_IDS].sort())
          await tx.execute(
            sql`select pg_advisory_xact_lock_shared(hashtextextended('game-control:' || ${game},0))`,
          );
        return read(tx, started);
      })
      .catch(() => {
        throw unavailable();
      });
  }
  async function observe(
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
    await db.execute(sql`insert into game_control.application_observations(id,consumer,instance_id,version,digest,status,observed_at)
      values(${randomUUID()},${consumer},${instance},${publication.version},${publication.digest},'applied',${now()})`);
    if (consumer === 'runtime') {
      reported = key;
      reportedAt = now();
    }
  }
  async function kartLease() {
    const started = now();
    return db.transaction(async (tx) => {
      const policy = await lock(tx, 'carding-car');
      const current = await read(tx, started);
      return {
        controlEnabled: true as const,
        gameId: 'carding-car' as const,
        state: policy.state,
        killEpoch: policy.killEpoch,
        version: current.version,
        digest: current.digest,
        validForMs: 2000,
      };
    });
  }
  async function publicCors() {
    const publication = await cors();
    // Shared resolver installs the bounded public policy for both HTTP and readiness consumers.
    const policy = publication.policy;
    await observe(publication);
    return policy;
  }
  return { lock, cors, publicCors, observe, kartLease, instanceId };
}
export async function gamePolicy(
  control: CompetitionControl | undefined,
  tx: ControlExecutor,
  game: ControlGameId | string,
) {
  return control?.lock(tx, game);
}
