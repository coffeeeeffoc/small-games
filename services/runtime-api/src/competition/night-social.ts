import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { assertResourceAuth, playerIdOf, type PlayerAuth } from './auth.js';
import { assertGameControl, gamePolicy, type CompetitionControl } from './control.js';
import { publicProfile } from './profile.js';
import { nightPlayerStatus } from './night-presence.js';
import { chatSequence } from './night-chat-input.js';
import { CompetitionError } from './types.js';

const command = z.discriminatedUnion('action', [
  z
    .object({
      action: z.enum(['request', 'accept', 'decline', 'cancel', 'remove']),
      playerId: z.uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal('read'),
      playerId: z.uuid(),
      throughId: chatSequence,
    })
    .strict(),
]);
type Database = ReturnType<typeof openDatabase>['db'];
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export function createNightSocial(db: Database, now: () => number, control?: CompetitionControl) {
  const access = async (tx: Tx, auth: PlayerAuth) => {
    const policy = await gamePolicy(control, tx, 'night-overwatch');
    await assertResourceAuth(tx, auth, 'night-overwatch', now());
    assertGameControl(policy, policy?.killEpoch, true);
  };
  const list = (auth: PlayerAuth) =>
    db.transaction(async (tx) => {
      await access(tx, auth);
      const owner = playerIdOf(auth);
      const related =
        await tx.execute(sql`select f.*,p.id,p.display_name,p.profile,${nightPlayerStatus(sql`p.id`, now())} as status
      from runtime.night_friendships f join runtime.competition_players p
      on p.id=case when f.player_a=${owner} then f.player_b else f.player_a end
      where f.player_a=${owner} or f.player_b=${owner} order by f.accepted desc,f.created_at desc`);
      const profile = (r: Record<string, unknown>) => ({
        playerId: String(r.id),
        nickname: publicProfile(r).nickname,
        online: r.status !== 'offline',
        status: String(r.status),
      });
      const rows = await tx.execute(sql`with own as (
        select *,case when player_id=${owner} then recipient_id else player_id end as peer
        from runtime.night_direct_messages where not removed and (player_id=${owner} or recipient_id=${owner})
      ), latest as (select distinct on(peer) * from own order by peer,seq desc), unread as (select m.peer,count(*)::int as n from own m left join runtime.night_direct_reads r on r.player_id=${owner} and r.peer_id=m.peer where m.recipient_id=${owner} and m.seq>coalesce(r.through_seq,0) group by m.peer)
      select m.*,p.id,p.display_name,p.profile,coalesce(rd.through_seq,0)::text as read_seq,
        coalesce(u.n,0) as unread,sender.display_name as sender_name,sender.profile as sender_profile,recipient.display_name as recipient_name,recipient.profile as recipient_profile
      from latest m join runtime.competition_players p on p.id=m.peer
      join runtime.competition_players sender on sender.id=m.player_id join runtime.competition_players recipient on recipient.id=m.recipient_id left join unread u on u.peer=m.peer
      left join runtime.night_direct_reads rd on rd.player_id=${owner} and rd.peer_id=m.peer order by m.seq desc`);
      return {
        friends: related.filter((r) => r.accepted).map(profile),
        requests: related
          .filter((r) => !r.accepted)
          .map((r) => ({
            ...profile(r),
            direction: r.requested_by === owner ? 'outgoing' : 'incoming',
            createdAt: Number(r.created_at),
          })),
        conversations: rows.map((r) => ({
          playerId: String(r.id),
          nickname: publicProfile(r).nickname,
          unread: Number(r.unread),
          lastReadId: String(r.read_seq),
          lastMessage: {
            id: String(r.seq),
            playerId: String(r.player_id),
            recipientId: String(r.recipient_id),
            nickname: publicProfile({ display_name: r.sender_name, profile: r.sender_profile })
              .nickname,
            recipientNickname: publicProfile({
              display_name: r.recipient_name,
              profile: r.recipient_profile,
            }).nickname,
            text: String(r.body),
            at: Number(r.created_at),
            ...(r.room
              ? { room: { ...(r.room as { code: string; createdAt: number }), canJoin: false } }
              : {}),
          },
        })),
        serverNow: now(),
      };
    });
  return {
    list,
    async act(auth: PlayerAuth, value: unknown) {
      const input = command.parse(value),
        owner = playerIdOf(auth),
        peer = input.playerId;
      if (owner === peer) throw new CompetitionError('RECIPIENT_UNAVAILABLE', 422);
      await db.transaction(async (tx) => {
        await access(tx, auth);
        // One social lock serializes acceptance limits, cross requests and read cursor advancement.
        await tx.execute(sql`select pg_advisory_xact_lock(7142903)`);
        const target = await tx.execute(
          sql`select 1 from runtime.player_game_access where player_id=${peer} and game='night-overwatch'`,
        );
        if (!target[0]) throw new CompetitionError('RECIPIENT_UNAVAILABLE', 422);
        if (input.action === 'read') {
          const message =
            await tx.execute(sql`select seq from runtime.night_direct_messages where seq=${input.throughId}::bigint
          and ((player_id=${owner} and recipient_id=${peer}) or (player_id=${peer} and recipient_id=${owner}))`);
          if (!message[0]) throw new CompetitionError('MESSAGE_NOT_FOUND', 404);
          await tx.execute(sql`insert into runtime.night_direct_reads values(${owner},${peer},${input.throughId}::bigint)
          on conflict(player_id,peer_id) do update set through_seq=greatest(runtime.night_direct_reads.through_seq,excluded.through_seq)`);
          return;
        }
        const [a, b] = [owner, peer].sort();
        const rows = await tx.execute(
            sql`select * from runtime.night_friendships where player_a=${a} and player_b=${b}`,
          ),
          old = rows[0];
        if (input.action === 'request') {
          if (old) return;
          const count =
            await tx.execute(sql`select count(*) filter(where accepted and (player_a=${owner} or player_b=${owner}))::int as friends,
          count(*) filter(where not accepted and requested_by=${owner})::int as outgoing,
          count(*) filter(where not accepted and requested_by<>${peer} and (player_a=${peer} or player_b=${peer}))::int as incoming
          from runtime.night_friendships where player_a in (${owner}::uuid,${peer}::uuid) or player_b in (${owner}::uuid,${peer}::uuid)`);
          if (Number(count[0]!.friends) >= 200) throw new CompetitionError('FRIEND_LIMIT', 422);
          if (Number(count[0]!.outgoing) >= 50)
            throw new CompetitionError('FRIEND_REQUEST_LIMIT', 422);
          if (Number(count[0]!.incoming) >= 100)
            throw new CompetitionError('RECIPIENT_UNAVAILABLE', 422);
          const rate = await tx.execute(
            sql`select last_request from runtime.night_friend_limits where player_id=${owner}`,
          );
          if (rate[0] && now() - Number(rate[0].last_request) < 3000)
            throw new CompetitionError('CHAT_RATE_LIMIT', 429);
          await tx.execute(
            sql`insert into runtime.night_friendships values(${a},${b},${owner},false,${now()})`,
          );
          await tx.execute(
            sql`insert into runtime.night_friend_limits values(${owner},${now()}) on conflict(player_id) do update set last_request=excluded.last_request`,
          );
        } else if (input.action === 'accept') {
          if (old?.accepted) return;
          if (!old || old.requested_by === owner)
            throw new CompetitionError('FRIEND_REQUEST_NOT_FOUND', 404);
          const counts = await tx.execute(sql`select player,count(*)::int as n from (
          select player_a as player from runtime.night_friendships where accepted union all select player_b from runtime.night_friendships where accepted
          ) f where player in (${owner}::uuid,${peer}::uuid) group by player`);
          if (counts.some((r) => Number(r.n) >= 200))
            throw new CompetitionError('FRIEND_LIMIT', 422);
          await tx.execute(
            sql`update runtime.night_friendships set accepted=true where player_a=${a} and player_b=${b}`,
          );
        } else {
          if (!old) return;
          if (
            input.action === 'remove'
              ? !old.accepted
              : old.accepted ||
                (input.action === 'cancel'
                  ? old.requested_by !== owner
                  : old.requested_by === owner)
          )
            throw new CompetitionError('FRIEND_REQUEST_NOT_FOUND', 404);
          await tx.execute(
            sql`delete from runtime.night_friendships where player_a=${a} and player_b=${b}`,
          );
        }
      });
      return list(auth);
    },
  };
}
