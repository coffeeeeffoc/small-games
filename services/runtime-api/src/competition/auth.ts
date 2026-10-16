import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { CompetitionError } from './types.js';

export const EPHEMERAL_GAMES = ['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'] as const;
export const COMPETITION_AUTHORITY_PROTOCOL = Object.freeze({ control: 1, ephemeralGuestScope: 1 });
export type EphemeralGame = (typeof EPHEMERAL_GAMES)[number];
export const EPHEMERAL_IDENTITY_MS = 8 * 60 * 60_000;
export const EPHEMERAL_ACCESS_MS = 15 * 60_000;
export type AuthContext = Readonly<{
  playerId: string;
  guestGameScope: EphemeralGame | null;
  identityExpiresAt: number | null;
}>;
const proofs = new WeakMap<AuthContext, Readonly<{ tokenHash: string; expiresAt: number }>>();
// String IDs are retained for trusted in-process domain callers, never HTTP bearer authorization.
export type PlayerAuth = string | AuthContext;
type Executor = Pick<ReturnType<typeof openDatabase>['db'], 'execute'>;
export function playerIdOf(auth: PlayerAuth) {
  return typeof auth === 'string' ? auth : auth.playerId;
}
export function authExpiresAt(auth: AuthContext) {
  const captured = proofs.get(auth);
  if (!captured) throw new CompetitionError('SESSION_EXPIRED', 401);
  return Math.min(captured.expiresAt, auth.identityExpiresAt ?? Infinity);
}
export function guestScope(row: Record<string, unknown>, now: number) {
  if (row.platform !== 'guest' || row.app_id === '')
    return { game: null, expiresAt: null } as const;
  if (!EPHEMERAL_GAMES.includes(row.app_id as EphemeralGame))
    throw new CompetitionError('SESSION_EXPIRED', 401);
  const createdAt = Number(row.created_at),
    expiresAt = createdAt + EPHEMERAL_IDENTITY_MS;
  if (
    !Number.isSafeInteger(createdAt) ||
    createdAt < 0 ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= now
  )
    throw new CompetitionError('IDENTITY_EXPIRED', 401);
  return { game: row.app_id as EphemeralGame, expiresAt };
}
export function assertGameScope(auth: PlayerAuth | null, game: string) {
  if (auth && typeof auth !== 'string' && auth.guestGameScope && auth.guestGameScope !== game)
    throw new CompetitionError('IDENTITY_SCOPE_MISMATCH', 403);
}
export async function authenticate(
  executor: Executor,
  token: string,
  now: number,
): Promise<AuthContext> {
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const rows = await executor.execute(sql`select p.id,p.platform,p.app_id,p.created_at,s.expires_at
    from runtime.competition_sessions s join runtime.competition_players p on p.id=s.player_id
    where s.token_hash=${tokenHash} and s.expires_at>${now}`);
  if (!rows[0]) throw new CompetitionError('SESSION_EXPIRED', 401);
  const scope = guestScope(rows[0], now);
  const auth = {
    playerId: String(rows[0].id),
    guestGameScope: scope.game,
    identityExpiresAt: scope.expiresAt,
  };
  proofs.set(auth, Object.freeze({ tokenHash, expiresAt: Number(rows[0].expires_at) }));
  return Object.freeze(auth);
}
/** Called after control/resource locks and before every shortcut, advance, receipt or write. */
export async function assertResourceAuth(
  executor: Executor,
  auth: PlayerAuth,
  game: string,
  now: number,
) {
  assertGameScope(auth, game);
  if (typeof auth === 'string') return;
  const captured = proofs.get(auth);
  if (!captured || captured.expiresAt <= now) throw new CompetitionError('SESSION_EXPIRED', 401);
  if (auth.identityExpiresAt !== null && auth.identityExpiresAt <= now)
    throw new CompetitionError('IDENTITY_EXPIRED', 401);
  await assertStoredPlayerGame(executor, auth.playerId, game, now);
  const valid = await executor.execute(sql`select 1 from runtime.competition_sessions
    where token_hash=${captured.tokenHash} and player_id=${auth.playerId} and expires_at>${now}`);
  if (!valid[0]) throw new CompetitionError('SESSION_EXPIRED', 401);
}
/** Internal result/audit routes have IDs rather than bearers; persisted guest scope still applies. */
export async function assertStoredPlayerGame(
  executor: Executor,
  playerId: string,
  game: string,
  now: number,
) {
  const rows = await executor.execute(
    // Serialize with upgrade/refresh without blocking result/best FK KEY SHARE locks.
    sql`select id,platform,app_id,created_at from runtime.competition_players where id=${playerId} for no key update`,
  );
  if (!rows[0]) throw new CompetitionError('SESSION_EXPIRED', 401);
  const scope = guestScope(rows[0], now);
  if (scope.game && scope.game !== game) throw new CompetitionError('IDENTITY_SCOPE_MISMATCH', 403);
}
