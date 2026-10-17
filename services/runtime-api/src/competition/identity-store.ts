import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { CONTROL_GAME_IDS, type openDatabase } from '@coffeeeeffoc/service-kit';
import { CompetitionError } from './types.js';
import { publicProfile, profilePatchSchema, avatarPolicy, type ProfilePatch } from './profile.js';
import { z } from 'zod';
import { anonymousProfile } from './profile.js';
export const guestSessionSchema = z.object({ game: z.enum(CONTROL_GAME_IDS) }).strict();
import {
  authenticate,
  assertResourceAuth,
  assertAuthenticatedPlayer,
  assertStoredPlayerGame,
  authExpiresAt,
  playerIdOf,
  type PlayerAuth,
} from './auth.js';

type Database = ReturnType<typeof openDatabase>['db'];
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('hex');
const day = 86400_000;

export function createCompetitionIdentities(db: Database, now = Date.now) {
  async function identity(token: string) {
    return (await authenticate(db, token, now())).playerId;
  }
  async function ownProfile(playerId: string, executor: Database | Tx = db, game?: string) {
    const rows =
      await executor.execute(sql`select id,platform,display_name,profile,app_id,created_at
      from runtime.competition_players where id=${playerId}`);
    assertAuthenticatedPlayer(rows[0]);
    const provider = String(rows[0]!.platform);
    return {
      ...publicProfile(rows[0]!),
      avatarPolicy,
      playerId,
      identityKind: provider === 'guest' ? ('guest' as const) : ('platform' as const),
      provider,
      identityMode: 'persistent' as const,
      game,
      identityExpiresAt: null,
    };
  }
  async function issue(
    tx: Tx,
    playerId: string,
    game: string,
    refreshExpiresAt = now() + 180 * day,
    grant = true,
    familyId: string = randomUUID(),
  ) {
    if (!(CONTROL_GAME_IDS as readonly string[]).includes(game))
      throw new CompetitionError('IDENTITY_SCOPE_MISMATCH', 403);
    const profile = await ownProfile(playerId, tx, game);
    if (grant)
      await tx.execute(sql`insert into runtime.player_game_access(player_id,game)
      values(${playerId},${game}) on conflict do nothing`);
    const token = secret(),
      refreshToken = secret(),
      expiresAt = Math.min(now() + 15 * 60_000, refreshExpiresAt);
    await tx.execute(sql`insert into runtime.competition_sessions(token_hash,player_id,expires_at,game,family_id,family_expires_at)
      values(${hash(token)},${playerId},${expiresAt},${game},${familyId},${refreshExpiresAt})`);
    await tx.execute(sql`insert into runtime.competition_refresh_tokens(token_hash,player_id,expires_at,game,session_hash)
      values(${hash(refreshToken)},${playerId},${refreshExpiresAt},${game},${hash(token)})`);
    return { ...profile, token, expiresAt, refreshToken, refreshExpiresAt, sessionId: familyId };
  }
  async function guestSession(input: unknown) {
    const { game } = guestSessionSchema.parse(input);
    return db.transaction(async (tx) => {
      const playerId = randomUUID(),
        profile = anonymousProfile();
      await tx.execute(sql`insert into runtime.competition_players(id,platform,app_id,created_at,display_name,profile)
        values(${playerId},'guest',${game},${now()},${profile.nickname},${JSON.stringify({ avatarId: profile.avatarId, source: 'default' })}::jsonb)`);
      return issue(tx, playerId, game);
    });
  }
  async function session(platform: string, appId: string, subject: string, game: string) {
    if (
      !['wechat', 'bilibili', 'douyin', 'kuaishou', 'taptap'].includes(platform) ||
      !appId ||
      !subject
    )
      throw new CompetitionError('PLATFORM_LOGIN_FAILED', 401);
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${JSON.stringify(['identity', platform, appId, subject])}))`,
      );
      const rows =
        await tx.execute(sql`insert into runtime.competition_players(id,platform,app_id,subject,created_at,profile)
        values(${randomUUID()},${platform},${appId},${subject},${now()},'{"source":"default"}'::jsonb)
        on conflict(platform,app_id,subject) do update set subject=excluded.subject returning id`);
      return issue(tx, String(rows[0]!.id), game);
    });
  }
  async function refreshSession(refreshToken: string) {
    return db.transaction(async (tx) => {
      const rows = await tx.execute(sql`select p.id from runtime.competition_players p
        join runtime.competition_refresh_tokens r on r.player_id=p.id
        where r.token_hash=${hash(refreshToken)} for no key update of p`);
      if (!rows[0]) throw new CompetitionError('REFRESH_EXPIRED', 401);
      // Recheck under the same owner lock used by logout; each refresh is single-use.
      const valid =
        await tx.execute(sql`select r.expires_at,r.game,r.session_hash,p.platform,s.family_id from runtime.competition_refresh_tokens r
        join runtime.competition_players p on p.id=r.player_id
        join runtime.competition_sessions s on s.token_hash=r.session_hash and s.player_id=r.player_id and s.game=r.game
        where r.token_hash=${hash(refreshToken)} and r.expires_at>${now()} and s.family_expires_at>${now()}`);
      if (!valid[0] || !valid[0].session_hash) throw new CompetitionError('REFRESH_EXPIRED', 401);
      assertAuthenticatedPlayer(valid[0]);
      await assertStoredPlayerGame(tx, String(rows[0].id), String(valid[0].game), now());
      const refreshExpiresAt = now() + 180 * day;
      await tx.execute(sql`update runtime.competition_sessions set family_expires_at=${refreshExpiresAt}
        where player_id=${String(rows[0].id)} and family_id=${String(valid[0].family_id)}`);
      // Old access is unusable for business requests, but remains a logout-only family proof.
      await tx.execute(
        sql`update runtime.competition_sessions set expires_at=0 where token_hash=${String(valid[0].session_hash)}`,
      );
      await tx.execute(
        sql`delete from runtime.competition_refresh_tokens where token_hash=${hash(refreshToken)}`,
      );
      return issue(
        tx,
        String(rows[0].id),
        String(valid[0].game),
        refreshExpiresAt,
        false,
        String(valid[0].family_id),
      );
    });
  }
  async function logout(token: string) {
    return db.transaction(async (tx) => {
      const rows = await tx.execute(sql`select p.id from runtime.competition_players p
        join runtime.competition_sessions s on s.player_id=p.id
        where s.token_hash=${hash(token)} for no key update of p`);
      if (!rows[0]) throw new CompetitionError('SESSION_EXPIRED', 401);
      const valid = await tx.execute(sql`select family_id from runtime.competition_sessions
        where token_hash=${hash(token)} and player_id=${String(rows[0].id)} and family_expires_at>${now()}`);
      if (!valid[0]) throw new CompetitionError('SESSION_EXPIRED', 401);
      await tx.execute(sql`delete from runtime.competition_sessions
        where player_id=${String(rows[0].id)} and family_id=${String(valid[0].family_id)}`);
      return { ok: true };
    });
  }
  async function profile(auth: PlayerAuth, patch?: string | ProfilePatch) {
    const playerId = playerIdOf(auth);
    if (patch === undefined)
      return db.transaction(async (tx) => {
        await assertResourceAuth(tx, auth, typeof auth === 'string' ? '' : auth.game, now());
        return ownProfile(playerId, tx, typeof auth === 'string' ? undefined : auth.game);
      });
    const input = profilePatchSchema.parse(typeof patch === 'string' ? { name: patch } : patch);
    return db.transaction(async (tx) => {
      await assertResourceAuth(tx, auth, typeof auth === 'string' ? '' : auth.game, now());
      const rows = await tx.execute(
        sql`select profile from runtime.competition_players where id=${playerId} for update`,
      );
      if (!rows[0]) throw new CompetitionError('SESSION_EXPIRED', 401);
      const previous = rows[0].profile as Record<string, unknown> | null;
      const updated = {
        ...previous,
        ...(input.avatarId !== undefined ? { avatarId: input.avatarId, avatarUrl: '' } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl, avatarId: null } : {}),
        ...(input.region !== undefined ? { region: input.region } : {}),
        source: input.source ?? 'self-reported',
        updatedAt: now(),
      };
      await tx.execute(sql`update runtime.competition_players set
        display_name=coalesce(${input.nickname ?? input.name ?? null},display_name),profile=${JSON.stringify(updated)}::jsonb where id=${playerId}`);
      return ownProfile(playerId, tx, typeof auth === 'string' ? undefined : auth.game);
    });
  }
  async function identityDetails(auth: PlayerAuth | null) {
    if (!auth)
      return {
        kind: 'anonymous',
        authenticated: false,
        provider: null,
        playerId: null,
        userId: null,
        name: null,
      };
    const own = await profile(auth);
    return { ...own, kind: own.identityKind, authenticated: own.identityKind === 'platform' };
  }
  return {
    identity,
    auth: (token: string) => authenticate(db, token, now()),
    verifyKart: (token: string) =>
      db.transaction(async (tx) => {
        const auth = await authenticate(tx, token, now());
        await assertResourceAuth(tx, auth, 'carding-car', now());
        return { playerId: auth.playerId, expiresAt: authExpiresAt(auth) };
      }),
    session,
    guestSession,
    logout,
    refreshSession,
    profile,
    identityDetails,
  };
}
