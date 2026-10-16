import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { CompetitionError } from './types.js';
import { publicProfile, profilePatchSchema, avatarPolicy, type ProfilePatch } from './profile.js';

type Database = ReturnType<typeof openDatabase>['db'];
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('hex');
const day = 86400_000;

/** The existing immutable player UUID is the authority for every competition game. */
export function createCompetitionIdentities(db: Database, now = Date.now) {
  async function identity(token: string) {
    const rows = await db.execute(sql`select player_id from runtime.competition_sessions
      where token_hash=${hash(token)} and expires_at>${now()}`);
    if (!rows[0]) throw new CompetitionError('SESSION_EXPIRED', 401);
    return String(rows[0].player_id);
  }
  async function ownProfile(playerId: string, executor: Database | Tx = db) {
    const rows = await executor.execute(sql`select id,platform,display_name,profile
      from runtime.competition_players where id=${playerId}`);
    if (!rows[0]) throw new CompetitionError('SESSION_EXPIRED', 401);
    const provider = String(rows[0].platform);
    return {
      ...publicProfile(rows[0]),
      avatarPolicy,
      playerId,
      identityKind: provider === 'guest' ? ('guest' as const) : ('platform' as const),
      provider: provider === 'guest' ? null : provider,
    };
  }
  async function issue(tx: Tx, playerId: string, ttl = day) {
    const token = secret(),
      expiresAt = now() + ttl;
    await tx.execute(sql`insert into runtime.competition_sessions(token_hash,player_id,expires_at)
      values(${hash(token)},${playerId},${expiresAt})`);
    return { ...(await ownProfile(playerId, tx)), token, expiresAt };
  }
  async function guestSession(installationId?: string, identityVersion?: 2) {
    return db.transaction(async (tx) => {
      const playerId = randomUUID();
      await tx.execute(sql`insert into runtime.competition_players(id,platform,app_id,created_at,profile)
        values(${playerId},'guest','',${now()},'{"source":"default"}'::jsonb)`);
      const refreshToken = secret(),
        refreshExpiresAt = now() + 180 * day;
      await tx.execute(sql`insert into runtime.competition_refresh_tokens(token_hash,player_id,expires_at,installation_id)
        values(${hash(refreshToken)},${playerId},${refreshExpiresAt},${installationId ?? null})`);
      // Old clients cannot refresh; preserve their existing access lifetime explicitly.
      return {
        ...(await issue(tx, playerId, identityVersion === 2 ? day : 180 * day)),
        refreshToken,
        refreshExpiresAt,
      };
    });
  }
  async function session(platform = 'guest', appId = '', subject?: string) {
    if (platform === 'guest') return guestSession();
    if (!appId || !subject) throw new CompetitionError('PLATFORM_LOGIN_FAILED', 401);
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${JSON.stringify(['identity', platform, appId, subject])}))`,
      );
      const rows =
        await tx.execute(sql`insert into runtime.competition_players(id,platform,app_id,subject,created_at,profile)
        values(${randomUUID()},${platform},${appId},${subject},${now()},'{"source":"default"}'::jsonb)
        on conflict(platform,app_id,subject) do update set subject=excluded.subject returning id`);
      return issue(tx, String(rows[0]!.id));
    });
  }
  async function refreshSession(refreshToken: string) {
    return db.transaction(async (tx) => {
      const rows = await tx.execute(sql`select p.id from runtime.competition_players p
        join runtime.competition_refresh_tokens r on r.player_id=p.id
        where r.token_hash=${hash(refreshToken)} for update of p`);
      if (!rows[0]) throw new CompetitionError('REFRESH_EXPIRED', 401);
      const playerId = String(rows[0].id);
      // Recheck after the player lock: an upgrade may have revoked the waiting refresh.
      const valid =
        await tx.execute(sql`select r.expires_at from runtime.competition_refresh_tokens r
        join runtime.competition_players p on p.id=r.player_id where r.token_hash=${hash(refreshToken)}
        and r.expires_at>${now()} and p.platform='guest'`);
      if (!valid[0]) throw new CompetitionError('REFRESH_EXPIRED', 401);
      return {
        ...(await issue(tx, playerId)),
        refreshToken,
        refreshExpiresAt: Number(valid[0].expires_at),
      };
    });
  }
  async function renewGuestSession(token: string) {
    return db.transaction(async (tx) => {
      const rows = await tx.execute(sql`select p.id from runtime.competition_players p
        join runtime.competition_sessions s on s.player_id=p.id
        where s.token_hash=${hash(token)} and s.expires_at>${now()} for update of p`);
      if (!rows[0]) throw new CompetitionError('SESSION_EXPIRED', 401);
      const playerId = String(rows[0].id);
      const valid = await tx.execute(sql`select 1 from runtime.competition_sessions s
        join runtime.competition_players p on p.id=s.player_id
        where s.token_hash=${hash(token)} and s.expires_at>${now()} and p.platform='guest'`);
      if (!valid[0]) throw new CompetitionError('SESSION_EXPIRED', 401);
      const refreshToken = secret(),
        refreshExpiresAt = now() + 180 * day;
      await tx.execute(sql`insert into runtime.competition_refresh_tokens(token_hash,player_id,expires_at)
        values(${hash(refreshToken)},${playerId},${refreshExpiresAt})`);
      return { ...(await issue(tx, playerId)), refreshToken, refreshExpiresAt };
    });
  }
  async function upgrade(token: string, platform: string, appId: string, subject: string) {
    if (platform === 'guest' || !appId || !subject)
      throw new CompetitionError('PLATFORM_LOGIN_FAILED', 401);
    return db
      .transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${JSON.stringify(['identity', platform, appId, subject])}))`,
        );
        const rows = await tx.execute(sql`select p.id,p.platform from runtime.competition_players p
        join runtime.competition_sessions s on s.player_id=p.id
        where s.token_hash=${hash(token)} and s.expires_at>${now()} for update of p`);
        if (!rows[0]) throw new CompetitionError('SESSION_EXPIRED', 401);
        const playerId = String(rows[0].id);
        const valid = await tx.execute(sql`select 1 from runtime.competition_sessions
        where token_hash=${hash(token)} and expires_at>${now()}`);
        if (!valid[0]) throw new CompetitionError('SESSION_EXPIRED', 401);
        if (rows[0].platform !== 'guest')
          throw new CompetitionError('IDENTITY_UPGRADE_NOT_ALLOWED');
        const existing = await tx.execute(sql`select id from runtime.competition_players
        where platform=${platform} and app_id=${appId} and subject=${subject}`);
        if (existing.length) throw new CompetitionError('IDENTITY_ALREADY_BOUND');
        await tx.execute(sql`update runtime.competition_players set platform=${platform},app_id=${appId},subject=${subject}
        where id=${playerId}`);
        await tx.execute(sql`delete from runtime.competition_sessions where player_id=${playerId}`);
        await tx.execute(
          sql`delete from runtime.competition_refresh_tokens where player_id=${playerId}`,
        );
        return issue(tx, playerId);
      })
      .catch((error: unknown) => {
        // The unique constraint also protects a rolling deployment with an older writer.
        let cause = error;
        for (let depth = 0; depth < 4 && cause && typeof cause === 'object'; depth++) {
          if (
            'code' in cause &&
            cause.code === '23505' &&
            'constraint' in cause &&
            cause.constraint === 'competition_players_platform_app_id_subject_key'
          )
            throw new CompetitionError('IDENTITY_ALREADY_BOUND');
          cause = 'cause' in cause ? cause.cause : undefined;
        }
        throw error;
      });
  }
  async function profile(playerId: string, patch?: string | ProfilePatch) {
    if (patch === undefined) return ownProfile(playerId);
    const input = profilePatchSchema.parse(typeof patch === 'string' ? { name: patch } : patch);
    return db.transaction(async (tx) => {
      const rows = await tx.execute(
        sql`select profile from runtime.competition_players where id=${playerId} for update`,
      );
      if (!rows[0]) throw new CompetitionError('SESSION_EXPIRED', 401);
      const previous = rows[0].profile as Record<string, unknown> | null;
      const updated = {
        ...previous,
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
        ...(input.region !== undefined ? { region: input.region } : {}),
        source: input.source ?? 'self-reported',
        updatedAt: now(),
      };
      await tx.execute(sql`update runtime.competition_players set
        display_name=coalesce(${input.nickname ?? input.name ?? null},display_name),profile=${JSON.stringify(updated)}::jsonb where id=${playerId}`);
      return ownProfile(playerId, tx);
    });
  }
  async function identityDetails(playerId: string | null) {
    if (!playerId)
      return {
        kind: 'anonymous',
        authenticated: false,
        provider: null,
        playerId: null,
        userId: null,
        name: null,
      };
    const own = await ownProfile(playerId);
    return { ...own, kind: own.identityKind, authenticated: own.identityKind === 'platform' };
  }
  return {
    identity,
    session,
    guestSession,
    refreshSession,
    renewGuestSession,
    upgrade,
    profile,
    identityDetails,
  };
}
