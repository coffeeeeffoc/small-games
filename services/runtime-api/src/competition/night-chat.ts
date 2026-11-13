import { publishedNightRelease, type NightRelease } from './night-release.js';
import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { sql } from 'drizzle-orm';
import { chatSendSchema, chatReportSchema, chatModerateSchema } from './night-chat-input.js';
export { chatSendSchema, chatReportSchema, chatModerateSchema } from './night-chat-input.js';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { assertResourceAuth, playerIdOf, type PlayerAuth } from './auth.js';
import { assertGameControl, gamePolicy, type CompetitionControl } from './control.js';
import { publicProfile } from './profile.js';
import { CompetitionError, type Room } from './types.js';
import { nightPlayerStatus } from './night-presence.js';

type Database = ReturnType<typeof openDatabase>['db'];
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const messages = sql`(select *,null::uuid as recipient_id from runtime.night_chat_messages
  union all select seq,request_id,player_id,signature,body,room,created_at,removed,recipient_id
  from runtime.night_direct_messages)`;
/** A single channel lock gives cursors committed order across processes. No transaction is held while waiting. */
export function createNightChat(
  db: Database,
  now: () => number,
  control?: CompetitionControl,
  version?: string,
  release?: NightRelease,
) {
  const access = async (auth: PlayerAuth) =>
    db.transaction(async (tx) => {
      const policy = await gamePolicy(control, tx, 'night-overwatch');
      await assertResourceAuth(tx, auth, 'night-overwatch', now());
      assertGameControl(policy, policy?.killEpoch, true);
      return policy;
    });
  const compatible = (roomVersion: string, buildId?: string, currentRelease = release) =>
    roomVersion === (currentRelease ? currentRelease.client(buildId)?.multiplayer : version) &&
    (!currentRelease || currentRelease.canStartClient('multiplayer', roomVersion, buildId));
  const snapshot = async (
    auth: PlayerAuth,
    buildId?: string,
    direct = false,
    peer?: string,
    before?: string,
  ) =>
    db.transaction(async (tx) => {
      const policy = await gamePolicy(control, tx, 'night-overwatch');
      await assertResourceAuth(tx, auth, 'night-overwatch', now());
      assertGameControl(policy, policy?.killEpoch, true);
      const epoch = policy?.killEpoch;
      const currentRelease = publishedNightRelease(release, policy?.nightOperations);
      const rows =
        await tx.execute(sql`select m.seq,m.body,m.room,m.created_at,m.recipient_id,p.id,p.display_name,p.profile,
      recipient.display_name as recipient_name,recipient.profile as recipient_profile,r.data as current_room
      from (
        (select *,null::uuid as recipient_id from runtime.night_chat_messages
          where ${!peer} and not removed and created_at>${now() - 86400000} order by seq desc limit 100)
        union all
        (select seq,request_id,player_id,signature,body,room,created_at,removed,recipient_id
          from runtime.night_direct_messages where ${direct} and not removed
          and (player_id=${playerIdOf(auth)} or recipient_id=${playerIdOf(auth)})
          ${peer ? sql`and least(player_id,recipient_id)=least(${peer}::uuid,${playerIdOf(auth)}::uuid) and greatest(player_id,recipient_id)=greatest(${peer}::uuid,${playerIdOf(auth)}::uuid)` : sql``}
          ${before ? sql`and seq<${before}::bigint` : sql``} order by seq desc limit ${peer ? 51 : 100})
      ) m join runtime.competition_players p on p.id=m.player_id
      left join runtime.competition_players recipient on recipient.id=m.recipient_id
      left join runtime.competition_rooms r on r.code=m.room->>'code'
      order by m.seq desc`);
      const messages = [...(peer ? rows.slice(0, 50) : rows)].reverse().map((row) => {
        const ref = row.room as { code: string; createdAt: number } | null;
        let room: { code: string; createdAt: number; canJoin: boolean } | undefined;
        if (ref) {
          const data = row.current_room as Room | undefined;
          const occupants =
            data?.players.filter((member) => !member.left && !member.takenOver) ?? [];
          room = {
            ...ref,
            canJoin:
              !!data &&
              data.game === 'night-overwatch' &&
              compatible(data.version, buildId, currentRelease) &&
              occupants.every((member) =>
                compatible(data.version, member.buildId, currentRelease),
              ) &&
              (epoch === undefined || (data.killEpoch ?? 0) === epoch) &&
              data.createdAt === ref.createdAt &&
              data.visibility !== 'private' &&
              ['waiting', 'finished', 'abandoned'].includes(data.status) &&
              (!data.rematchMembers || data.rematchMembers.includes(playerIdOf(auth))) &&
              occupants.length > 0 &&
              occupants.length < 2 &&
              data.deadline > now(),
          };
        }
        const profile = publicProfile(row);
        return {
          id: String(row.seq),
          playerId: String(row.id),
          nickname: profile.nickname,
          text: String(row.body),
          at: Number(row.created_at),
          ...(row.recipient_id
            ? {
                recipientId: String(row.recipient_id),
                recipientNickname: publicProfile({
                  profile: row.recipient_profile,
                  display_name: row.recipient_name,
                }).nickname,
              }
            : {}),
          ...(room ? { room } : {}),
        };
      });
      return {
        messages,
        cursor: hash(messages),
        reset: true,
        serverNow: now(),
        ...(peer && rows.length > 50 ? { nextBefore: String(rows[49]!.seq) } : {}),
      };
    });
  return {
    async list(
      auth: PlayerAuth,
      cursor?: string,
      waitMs = 0,
      cancelled = () => false,
      buildId?: string,
      direct = false,
    ) {
      const until = Date.now() + Math.min(5000, Math.max(0, waitMs));
      let result = await snapshot(auth, buildId, direct);
      while (cursor === result.cursor && Date.now() < until && !cancelled()) {
        await setTimeout(Math.min(500, until - Date.now()));
        result = await snapshot(auth, buildId, direct);
      }
      return result;
    },
    history(auth: PlayerAuth, peer: string, before?: string, buildId?: string) {
      if (peer === playerIdOf(auth)) throw new CompetitionError('INVALID_INPUT', 422);
      return snapshot(auth, buildId, true, peer, before);
    },
    async send(auth: PlayerAuth, value: unknown, buildId?: string, direct = false) {
      const input = chatSendSchema.parse(value),
        owner = playerIdOf(auth),
        signature = hash(input);
      await db.transaction(async (tx) => {
        const policy = await gamePolicy(control, tx, 'night-overwatch');
        if (input.roomCode)
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended('competition-match:night-overwatch',0))`,
          );
        await tx.execute(sql`select pg_advisory_xact_lock(7142902)`);
        await assertResourceAuth(tx, auth, 'night-overwatch', now());
        assertGameControl(policy, policy?.killEpoch, true);
        const previous = await tx.execute(
          sql`select signature from ${messages} m where player_id=${owner} and request_id=${input.requestId}`,
        );
        if (previous[0]) {
          if (previous[0].signature !== signature)
            throw new CompetitionError('REQUEST_ID_CONFLICT');
          return;
        }
        await tx.execute(
          sql`insert into runtime.night_chat_limits(player_id) values(${owner}) on conflict do nothing`,
        );
        const limits = (
          await tx.execute(
            sql`select * from runtime.night_chat_limits where player_id=${owner} for update`,
          )
        )[0]!;
        if (Number(limits.muted_until) > now()) throw new CompetitionError('CHAT_MUTED', 403);
        if (Number(limits.last_sent) && now() - Number(limits.last_sent) < 3000)
          throw new CompetitionError('CHAT_RATE_LIMIT', 429);
        if (input.recipientId) {
          const recipient = await tx.execute(sql`select 1 from runtime.player_game_access
            where player_id=${input.recipientId} and game='night-overwatch'`);
          if (input.recipientId === owner || !recipient[0])
            throw new CompetitionError('RECIPIENT_UNAVAILABLE', 422);
        }
        let room: { code: string; createdAt: number } | null = null;
        if (input.roomCode) {
          if (input.recipientId) {
            const target = await tx.execute(
              sql`select ${nightPlayerStatus(sql`${input.recipientId}::uuid`, now())} as status`,
            );
            if (target[0]?.status !== 'available')
              throw new CompetitionError('RECIPIENT_BUSY', 422);
          }
          const rows = await tx.execute(
            sql`select data from runtime.competition_rooms where code=${input.roomCode}`,
          );
          const current = rows[0]?.data as Room | undefined;
          const occupants =
            current?.players.filter((member) => !member.left && !member.takenOver) ?? [];
          if (
            !current ||
            current.game !== 'night-overwatch' ||
            !compatible(
              current.version,
              buildId,
              publishedNightRelease(release, policy?.nightOperations),
            ) ||
            (policy && (current.killEpoch ?? 0) !== policy.killEpoch) ||
            current.visibility === 'private' ||
            !['waiting', 'finished', 'abandoned'].includes(current.status) ||
            current.deadline <= now() ||
            occupants.length >= 2 ||
            occupants.some(
              (member) =>
                !compatible(
                  current.version,
                  member.buildId,
                  publishedNightRelease(release, policy?.nightOperations),
                ),
            ) ||
            (current.rematchMembers &&
              (!input.recipientId || !current.rematchMembers.includes(input.recipientId))) ||
            !occupants.some((p) => p.id === owner)
          )
            throw new CompetitionError('INVITATION_UNAVAILABLE', 422);
          room = { code: current.code, createdAt: current.createdAt };
        }
        const table = input.recipientId
          ? sql`runtime.night_direct_messages`
          : sql`runtime.night_chat_messages`;
        await tx.execute(sql`insert into ${table}(request_id,player_id,signature,body,room,created_at${input.recipientId ? sql`,recipient_id` : sql``})
          values(${input.requestId},${owner},${signature},${input.text},${room ? JSON.stringify(room) : null}::jsonb,${now()}${input.recipientId ? sql`,${input.recipientId}` : sql``})`);
        await tx.execute(
          sql`update runtime.night_chat_limits set last_sent=${now()} where player_id=${owner}`,
        );
        // Keep request digests for safe old retries, but remove expired public text and invitations.
        await tx.execute(sql`update runtime.night_chat_messages set removed=true,body='',room=null where not removed and
          (created_at<=${now() - 86400000} or seq<(select min(seq) from (select seq from runtime.night_chat_messages order by seq desc limit 100) recent))`);
      });
      return snapshot(auth, buildId, direct);
    },
    async report(auth: PlayerAuth, value: unknown) {
      const input = chatReportSchema.parse(value);
      await access(auth);
      const owner = playerIdOf(auth);
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(7142902)`);
        await assertResourceAuth(tx, auth, 'night-overwatch', now());
        const old = await tx.execute(
          sql`select 1 from runtime.night_chat_reports where reporter_id=${owner} and message_seq=${input.id}::bigint`,
        );
        if (old[0]) return { reported: true };
        const count = await tx.execute(
          sql`select count(*)::int as n from runtime.night_chat_reports where reporter_id=${owner} and created_at>${now() - 86400000}`,
        );
        if (Number(count[0]?.n) >= 20) throw new CompetitionError('CHAT_RATE_LIMIT', 429);
        const row = (
          await tx.execute(
            sql`select * from ${messages} m where seq=${input.id}::bigint and not removed and (recipient_id is not null or created_at>${now() - 86400000})
              and (recipient_id is null or player_id=${owner} or recipient_id=${owner})`,
          )
        )[0];
        if (!row) throw new CompetitionError('MESSAGE_NOT_FOUND', 404);
        await tx.execute(
          sql`insert into runtime.night_chat_reports(reporter_id,message_seq,evidence,reason,created_at) values(${owner},${input.id}::bigint,${JSON.stringify(row)}::jsonb,${input.reason},${now()})`,
        );
        return { reported: true };
      });
    },
    async moderate(value: unknown) {
      const input = chatModerateSchema.parse(value);
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(7142902)`);
        if (input.kind === 'remove') {
          await tx.execute(
            sql`update runtime.night_chat_messages set removed=true,body='',room=null where seq=${input.id}::bigint`,
          );
          await tx.execute(
            sql`update runtime.night_direct_messages set removed=true,body='',room=null where seq=${input.id}::bigint`,
          );
        } else
          await tx.execute(
            sql`insert into runtime.night_chat_limits(player_id,muted_until) values(${input.playerId},${now() + input.minutes * 60000}) on conflict(player_id) do update set muted_until=excluded.muted_until`,
          );
        return { applied: true };
      });
    },
    async reports() {
      return {
        reports: await db.execute(
          sql`select * from runtime.night_chat_reports order by created_at desc limit 100`,
        ),
      };
    },
  };
}
