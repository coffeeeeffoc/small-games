import { publishedNightRelease, type NightRelease } from './night-release.js';
import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { assertResourceAuth, playerIdOf, type PlayerAuth } from './auth.js';
import { assertGameControl, gamePolicy, type CompetitionControl } from './control.js';
import { publicProfile } from './profile.js';
import { CompetitionError, type Room } from './types.js';

type Database = ReturnType<typeof openDatabase>['db'];
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const seq = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine((value) => BigInt(value) <= 9223372036854775807n);
const text = z
  .string()
  .max(1000)
  .transform((value) => value.normalize('NFC').trim())
  .refine((value) => Array.from(value).length <= 120 && !/[\p{Cc}\p{Cf}]/u.test(value));
export const chatSendSchema = z
  .object({
    requestId: z.uuid(),
    text,
    roomCode: z
      .string()
      .regex(/^(?:[0-9]{6}|[A-F0-9]{12})$/)
      .optional(),
  })
  .strict()
  .refine((value) => !!value.text || !!value.roomCode);
export const chatReportSchema = z
  .object({ id: seq, reason: z.string().trim().min(1).max(120) })
  .strict();
export const chatModerateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('remove'), id: seq }).strict(),
  z
    .object({
      kind: z.literal('mute'),
      playerId: z.uuid(),
      minutes: z.number().int().min(0).max(43200),
    })
    .strict(),
]);

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
  const snapshot = async (auth: PlayerAuth, buildId?: string) =>
    db.transaction(async (tx) => {
      const policy = await gamePolicy(control, tx, 'night-overwatch');
      await assertResourceAuth(tx, auth, 'night-overwatch', now());
      assertGameControl(policy, policy?.killEpoch, true);
      const epoch = policy?.killEpoch;
      const currentRelease = publishedNightRelease(release, policy?.nightOperations);
      const rows =
        await tx.execute(sql`select m.seq,m.body,m.room,m.created_at,p.id,p.display_name,p.profile,r.data as current_room
      from runtime.night_chat_messages m join runtime.competition_players p on p.id=m.player_id
      left join runtime.competition_rooms r on r.code=m.room->>'code'
      where not m.removed and m.created_at>${now() - 86400000} order by m.seq desc limit 100`);
      const messages = [...rows].reverse().map((row) => {
        const ref = row.room as { code: string; createdAt: number } | null;
        let room: { code: string; createdAt: number; canJoin: boolean } | undefined;
        if (ref) {
          const data = row.current_room as Room | undefined;
          room = {
            ...ref,
            canJoin:
              !!data &&
              data.game === 'night-overwatch' &&
              compatible(data.version, buildId, currentRelease) &&
              data.players.every((member) =>
                compatible(data.version, member.buildId, currentRelease),
              ) &&
              (epoch === undefined || (data.killEpoch ?? 0) === epoch) &&
              data.createdAt === ref.createdAt &&
              data.visibility !== 'private' &&
              data.status === 'waiting' &&
              data.players.length < 2 &&
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
          ...(room ? { room } : {}),
        };
      });
      return { messages, cursor: hash(messages), reset: true, serverNow: now() };
    });
  return {
    async list(
      auth: PlayerAuth,
      cursor?: string,
      waitMs = 0,
      cancelled = () => false,
      buildId?: string,
    ) {
      const until = Date.now() + Math.min(5000, Math.max(0, waitMs));
      let result = await snapshot(auth, buildId);
      while (cursor === result.cursor && Date.now() < until && !cancelled()) {
        await setTimeout(Math.min(500, until - Date.now()));
        result = await snapshot(auth, buildId);
      }
      return result;
    },
    async send(auth: PlayerAuth, value: unknown, buildId?: string) {
      const input = chatSendSchema.parse(value),
        owner = playerIdOf(auth),
        signature = hash(input);
      await db.transaction(async (tx) => {
        const policy = await gamePolicy(control, tx, 'night-overwatch');
        await tx.execute(sql`select pg_advisory_xact_lock(7142902)`);
        await assertResourceAuth(tx, auth, 'night-overwatch', now());
        assertGameControl(policy, policy?.killEpoch, true);
        const previous = await tx.execute(
          sql`select signature from runtime.night_chat_messages where player_id=${owner} and request_id=${input.requestId}`,
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
        let room: { code: string; createdAt: number } | null = null;
        if (input.roomCode) {
          const rows = await tx.execute(
            sql`select data from runtime.competition_rooms where code=${input.roomCode}`,
          );
          const current = rows[0]?.data as Room | undefined;
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
            current.status !== 'waiting' ||
            current.deadline <= now() ||
            current.players.length >= 2 ||
            !current.players.some((p) => p.id === owner)
          )
            throw new CompetitionError('INVITATION_UNAVAILABLE', 422);
          room = { code: current.code, createdAt: current.createdAt };
        }
        await tx.execute(sql`insert into runtime.night_chat_messages(request_id,player_id,signature,body,room,created_at)
          values(${input.requestId},${owner},${signature},${input.text},${room ? JSON.stringify(room) : null}::jsonb,${now()})`);
        await tx.execute(
          sql`update runtime.night_chat_limits set last_sent=${now()} where player_id=${owner}`,
        );
        // Keep request digests for safe old retries, but remove expired public text and invitations.
        await tx.execute(sql`update runtime.night_chat_messages set removed=true,body='',room=null where not removed and
          (created_at<=${now() - 86400000} or seq<(select min(seq) from (select seq from runtime.night_chat_messages order by seq desc limit 100) recent))`);
      });
      return snapshot(auth, buildId);
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
            sql`select * from runtime.night_chat_messages where seq=${input.id}::bigint and not removed and created_at>${now() - 86400000}`,
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
        if (input.kind === 'remove')
          await tx.execute(
            sql`update runtime.night_chat_messages set removed=true,body='',room=null where seq=${input.id}::bigint`,
          );
        else
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
