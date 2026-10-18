import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { CONTROL_GAME_IDS, type openDatabase } from '@coffeeeeffoc/service-kit';
import { CompetitionError } from './types.js';

export const COMPETITION_AUTHORITY_PROTOCOL = Object.freeze({
  control: 1,
  authenticatedGameScope: 1,
});
export type AuthContext = Readonly<{ playerId: string; game: string }>;
const proofs = new WeakMap<AuthContext, Readonly<{ tokenHash: string; expiresAt: number }>>();
// IDs are for trusted in-process domain callers only; HTTP always requires a session proof.
export type PlayerAuth = string | AuthContext;
type Executor = Pick<ReturnType<typeof openDatabase>['db'], 'execute'>;
export function playerIdOf(auth: PlayerAuth) {
  return typeof auth === 'string' ? auth : auth.playerId;
}
export function authExpiresAt(auth: AuthContext) {
  const proof = proofs.get(auth);
  if (!proof) throw new CompetitionError('SESSION_EXPIRED', 401);
  return proof.expiresAt;
}
export function assertAuthenticatedPlayer(row: Record<string, unknown> | undefined) {
  if (
    !row ||
    !['guest', 'wechat', 'bilibili', 'douyin', 'kuaishou', 'taptap'].includes(String(row.platform))
  )
    throw new CompetitionError('LOGIN_REQUIRED', 401);
}
export function assertGameScope(auth: PlayerAuth | null, game: string) {
  if (!auth) throw new CompetitionError('LOGIN_REQUIRED', 401);
  if (typeof auth !== 'string' && auth.game !== game)
    throw new CompetitionError('IDENTITY_SCOPE_MISMATCH', 403);
}
export async function authenticate(
  executor: Executor,
  token: string,
  now: number,
): Promise<AuthContext> {
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const rows = await executor.execute(sql`select p.id,p.platform,s.game,s.expires_at
    from runtime.competition_sessions s join runtime.competition_players p on p.id=s.player_id
    where s.token_hash=${tokenHash} and s.expires_at>${now}`);
  if (!rows[0]) throw new CompetitionError('SESSION_EXPIRED', 401);
  assertAuthenticatedPlayer(rows[0]);
  if (!(CONTROL_GAME_IDS as readonly string[]).includes(String(rows[0].game)))
    throw new CompetitionError('SESSION_EXPIRED', 401);
  const auth = Object.freeze({ playerId: String(rows[0].id), game: String(rows[0].game) });
  proofs.set(auth, Object.freeze({ tokenHash, expiresAt: Number(rows[0].expires_at) }));
  return auth;
}
/** Recheck after resource/control locks, including retries and already-finished shortcuts. */
export async function assertResourceAuth(
  executor: Executor,
  auth: PlayerAuth,
  game: string,
  now: number,
) {
  assertGameScope(auth, game);
  if (typeof auth === 'string') return;
  const proof = proofs.get(auth);
  if (!proof || proof.expiresAt <= now) throw new CompetitionError('SESSION_EXPIRED', 401);
  await assertStoredPlayerGame(executor, auth.playerId, game, now);
  const valid = await executor.execute(sql`select 1 from runtime.competition_sessions
    where token_hash=${proof.tokenHash} and player_id=${auth.playerId} and game=${game} and expires_at>${now}`);
  if (!valid[0]) throw new CompetitionError('SESSION_EXPIRED', 401);
}
/** Internal result ingestion must recheck durable per-game authorization. */
export async function assertStoredPlayerGame(
  executor: Executor,
  playerId: string,
  game: string,
  _now: number,
) {
  void _now; // Kept for existing internal result callers; durable grants have no bearer lifetime.
  const rows = await executor.execute(sql`select p.id,p.platform from runtime.competition_players p
    where p.id=${playerId} for no key update of p`);
  assertAuthenticatedPlayer(rows[0]);
  if (!(CONTROL_GAME_IDS as readonly string[]).includes(game))
    throw new CompetitionError('IDENTITY_SCOPE_MISMATCH', 403);
  // Fresh snapshot after waiting for the owner; retain the grant until this operation commits.
  const grants = await executor.execute(sql`select 1 from runtime.player_game_access
    where player_id=${playerId} and game=${game} for key share`);
  if (!grants[0]) throw new CompetitionError('IDENTITY_SCOPE_MISMATCH', 403);
}
