/* eslint-disable max-lines -- Room transactions and settlement share lock ordering; keep them visible in one store. */
import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { CompetitionError, type Room, type Rule } from './types.js';
import {
  backfillNightClears,
  nightBoard,
  nightHistory,
  nightSummary,
  prepareNightDuelPoints,
  settleNightRoom,
} from './night-ledger.js';
import {
  checkNightLoadout,
  useNightTrials,
  refundNightTrials,
  nightWallet,
  type NightLoadout,
} from './night-wallet.js';
import { createCompetitionIdentities } from './identity-store.js';
import { publicProfile, publicResult, publicRoomResults } from './profile.js';
import { assertGameControl, gamePolicy, type CompetitionControl } from './control.js';
import {
  assertGameScope,
  assertResourceAuth,
  assertStoredPlayerGame,
  playerIdOf,
  type PlayerAuth,
} from './auth.js';

type Database = ReturnType<typeof openDatabase>['db'];
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type RoomOptions = {
  mode?: string;
  role?: string;
  initiative?: string;
  visibility?: 'public' | 'private';
  password?: string;
};
type RankingRow = ReturnType<typeof publicProfile> & {
  playerId: string;
  score: number;
  secondary: number;
  rank: number;
  position: number;
  total: number;
};
type Ranking = {
  board: string;
  top: RankingRow[];
  me: RankingRow | null;
  previous: RankingRow | null;
  threshold: RankingRow | null | undefined;
  gap: { score: number; secondary: number } | null;
  eligiblePlayers: number;
  reason: string | null;
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const passwordKey = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 32, (error, key) => (error ? reject(error) : resolve(key)));
  });
const spectatorLeaseMs = 30_000;
const json = (value: unknown) => JSON.stringify(value);
const boardOf = (rule: Rule) => `${rule.id}:${rule.version}`;
const ruleSeat = (rule: Rule, room: Room, seat: number) =>
  rule.roles ? rule.roles.indexOf(room.players[seat]!.role!) : seat;

export function createCompetitionStore(
  db: Database,
  rules: Map<string, Rule>,
  now = Date.now,
  control?: CompetitionControl,
) {
  function ruleFor(game: string) {
    const rule = rules.get(game);
    if (!rule) throw new CompetitionError('GAME_UNAVAILABLE', 404);
    return rule;
  }
  async function ranking(
    board: string,
    auth: PlayerAuth | null,
    executor: Database | Tx = db,
    game?: string,
  ): Promise<Ranking> {
    if (auth && typeof auth !== 'string')
      return db.transaction(async (tx) => {
        await assertResourceAuth(
          tx,
          auth,
          game ?? (board === 'carding-car-seaside-v1' ? 'carding-car' : board.split(':')[0]!),
          now(),
        );
        return ranking(board, auth.playerId, tx);
      });
    const playerId = auth;
    const night = board.startsWith('night-overwatch:');
    const order = sql`b.score desc,b.secondary asc${board === nightBoard('clears') ? sql`,coalesce(points.score,0) desc` : sql``}${night ? sql`,b.updated_at asc` : sql``},b.player_id`;
    const rankedRows = await executor.execute(sql`with ranked as (
      select b.player_id as "playerId", p.display_name,p.profile, b.score, b.secondary,
      ${night ? sql`row_number() over(order by ${order})` : sql`rank() over(order by b.score desc,b.secondary asc)`}::int as rank,
      row_number() over(order by ${order})::int as position,
      count(*) over()::int as total from runtime.competition_best b join runtime.competition_players p on p.id=b.player_id
      ${board === nightBoard('clears') ? sql`left join runtime.competition_best points on points.player_id=b.player_id and points.board=${nightBoard('points')}` : sql``}
      where b.board=${board}
    ) select * from ranked where position<=100 or "playerId"=${playerId}
      or position=(select max(position) from ranked where rank<(select rank from ranked where "playerId"=${playerId})) order by position`);
    const rows = await Promise.all(
      rankedRows.map(async (row) => ({
        ...publicProfile(row),
        playerId: String(row.playerId),
        score: Number(row.score),
        secondary: Number(row.secondary),
        rank: Number(row.rank),
        position: Number(row.position),
        total: Number(row.total),
        ...(board === nightBoard('win-rate')
          ? await nightSummary(executor, String(row.playerId))
          : {}),
      })),
    );
    const top = rows.filter((row) => Number(row.position) <= 100);
    const me = rows.find((row) => row.playerId === playerId) ?? null;
    const previous = me
      ? (rows.filter((row) => Number(row.rank) < Number(me.rank)).at(-1) ?? null)
      : null;
    const threshold = top.length === 100 ? top[99] : null;
    const target =
      previous ?? (me && Number(me.rank) > 1 && Number(me.position) > 100 ? threshold : null);
    const gap =
      me && target
        ? {
            score: Number(target.score) - Number(me.score),
            secondary: Number(me.secondary) - Number(target.secondary),
          }
        : null;
    return {
      board,
      top,
      me,
      previous,
      threshold,
      gap,
      eligiblePlayers: Number(rows[0]?.total ?? 0),
      reason: me ? null : '尚无有效成绩',
    };
  }
  async function record(
    tx: Tx,
    matchId: string,
    board: string,
    playerId: string,
    score: number,
    secondary: number,
  ) {
    if (!Number.isFinite(score) || !Number.isFinite(secondary) || secondary < 0)
      throw new CompetitionError('INVALID_RESULT');
    const inserted =
      await tx.execute(sql`insert into runtime.competition_results values(${matchId},${board},${playerId},${score},${secondary},${now()})
      on conflict do nothing returning player_id`);
    if (!inserted.length) return;
    await tx.execute(sql`insert into runtime.competition_best values(${board},${playerId},${score},${secondary},${matchId},${now()})
      on conflict(board,player_id) do update set score=excluded.score,secondary=excluded.secondary,match_id=excluded.match_id,updated_at=excluded.updated_at
      where (excluded.score > runtime.competition_best.score) or
        (excluded.score=runtime.competition_best.score and excluded.secondary<runtime.competition_best.secondary)`);
  }
  async function create(
    auth: PlayerAuth,
    game: string,
    options: RoomOptions = {},
    executor: Database | Tx = db,
  ) {
    const playerId = playerIdOf(auth);
    const rule = ruleFor(game);
    const policy = await gamePolicy(control, executor, game);
    assertGameControl(policy, policy?.killEpoch, true);
    if (rule.lobby) await lockMatch(executor, game);
    await assertResourceAuth(executor, auth, game, now());
    if (options.mode && !rule.modes?.some((mode) => mode.id === options.mode))
      throw new CompetitionError('INVALID_MODE', 422);
    if (options.role && !rule.roles?.includes(options.role))
      throw new CompetitionError('INVALID_ROLE', 422);
    if (
      options.initiative &&
      (!rule.roles || ![...rule.roles, 'random'].includes(options.initiative))
    )
      throw new CompetitionError('INVALID_ROLE', 422);
    if (rule.lobby) {
      await lockMatch(executor, game);
      const own = await activeRoom(executor, game, playerId);
      if (own) {
        if (own.version !== rule.version) throw new CompetitionError('RULE_VERSION_CHANGED');
        return own;
      }
    }
    if (
      options.visibility === 'private' &&
      (!options.password || options.password.length < 4 || options.password.length > 64)
    )
      throw new CompetitionError('PASSWORD_REQUIRED', 422);
    if (options.password && options.visibility !== 'private')
      throw new CompetitionError('INVALID_PASSWORD', 422);
    const salt = options.visibility === 'private' ? randomBytes(16).toString('hex') : undefined;
    const room: Room = {
      id: randomUUID(),
      visibility: options.visibility ?? (rule.lobby ? 'public' : 'private'),
      ...(salt
        ? {
            passwordSalt: salt,
            passwordHash: (await passwordKey(options.password!, salt)).toString('hex'),
          }
        : {}),
      spectators: [],
      spectatorSeenAt: {},
      killEpoch: policy?.killEpoch ?? 0,
      code: rule.lobby
        ? String(randomInt(100000, 1000000))
        : randomBytes(6).toString('hex').toUpperCase(),
      game,
      version: rule.version,
      status: 'waiting',
      seed: randomInt(0x7fffffff),
      mode: options.mode ?? rule.modes?.[0]?.id,
      initiative: rule.roles ? (options.initiative ?? 'random') : undefined,
      players: [
        {
          id: playerId,
          role: options.role ?? rule.roles?.[0],
          ready: false,
          seq: 0,
          state: null,
          ...(rule.lobby ? { leaseId: randomUUID(), seenAt: now() } : {}),
        },
      ],
      createdAt: now(),
      deadline: now() + 15 * 60_000,
    };
    for (let attempt = 0; attempt < 20; attempt++) {
      const inserted = await executor.execute(
        sql`insert into runtime.competition_rooms values(${room.code},${json(room)}::jsonb,${room.deadline}) on conflict do nothing returning code`,
      );
      if (inserted.length) return room;
      room.code = rule.lobby
        ? String(randomInt(100000, 1000000))
        : randomBytes(6).toString('hex').toUpperCase();
    }
    throw new CompetitionError('ROOM_CODES_BUSY', 503);
  }
  async function view(
    room: Room,
    playerId: string,
    executor: Database | Tx = db,
    leaseId?: string,
  ) {
    const rule = ruleFor(room.game);
    const seat = room.players.findIndex((p) => p.id === playerId);
    if (seat < 0 && !room.spectators?.includes(playerId))
      throw new CompetitionError('NOT_A_MEMBER', 403);
    const member = room.players[seat];
    const names = await executor.execute(
      sql`select id,display_name,profile from runtime.competition_players where id in (${sql.join(
        room.players.map((p) => sql`${p.id}::uuid`),
        sql`,`,
      )})`,
    );
    const profileOf = (id: string) => publicProfile(names.find((p) => p.id === id) ?? { id });
    return {
      id: room.id ?? room.code,
      code: room.code,
      game: room.game,
      version: room.version,
      status: room.status,
      mode: room.mode,
      capacity: rule.roomSize?.(room.mode) ?? 2,
      roles: rule.roles,
      initiative: room.initiative,
      firstRole: room.firstRole,
      you: seat,
      spectator: seat < 0,
      visibility: room.visibility ?? 'private',
      leaseId: member?.leaseId === leaseId ? leaseId : undefined,
      settlement: member?.settlement ?? null,
      players: room.players.map(
        ({ id, role, ready, result, disconnected, reconnectUntil, takenOver, settlement }) => ({
          id,
          ...profileOf(id),
          role,
          ready,
          disconnected: !!disconnected,
          reconnectUntil,
          takenOver: !!takenOver,
          settlement,
          result: publicResult(result),
        }),
      ),
      seq: member?.seq ?? 0,
      startedAt: room.startedAt,
      startsAt: room.startedAt,
      deadline: room.deadline,
      serverNow: now(),
      pollMs: rule.pollMs ?? 1200,
      state:
        room.players[0]!.state === null
          ? null
          : rule.view(
              rule.duel ? room.players[0]!.state : (member ?? room.players[0]!).state,
              ruleSeat(rule, room, Math.max(0, seat)),
            ),
      opponent:
        seat >= 0 && room.players.length === 2
          ? publicResult(room.players[1 - seat]?.result ?? null)
          : null,
      results: publicRoomResults(room.results),
      rematch: room.rematch,
    };
  }
  async function finish(room: Room, tx: Tx, timedOut = false) {
    if (room.status !== 'playing') return;
    const rule = ruleFor(room.game);
    for (const [seat, member] of room.players.entries()) {
      member.result = rule.result(
        rule.duel ? room.players[0]!.state : member.state,
        ruleSeat(rule, room, seat),
      );
    }
    if (!timedOut && !room.players.every((p) => p.result?.finished)) return;
    room.status = 'finished';
    if (room.game === 'night-overwatch') {
      await settleNightRoom(tx, room, now(), 'elimination');
      return;
    }
    if (rule.unrated) {
      // Casual multiplayer series settle once in the room, never in the two-player ladder.
      room.results = room.players.map((player) => ({
        userId: player.id,
        playerId: player.id,
        result: player.result,
        rated: false,
        reason: '好友擂台积分仅用于本场比赛',
      }));
      await tx.execute(
        sql`insert into runtime.competition_matches values(${room.code},${boardOf(rule)},${json({ players: room.players.map((p) => ({ id: p.id, result: p.result })), rated: false, timedOut })}::jsonb,${now()}) on conflict do nothing`,
      );
      return;
    }
    // ponytail: serialize settlements per board; use narrower rating locks if measured contention grows.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${boardOf(rule)}))`);
    let rated = true;
    if (rule.duel) {
      const ids = room.players.map((p) => p.id).sort();
      if (room.players.every((p) => p.result?.eligible)) {
        const recorded = await tx.execute(
          sql`insert into runtime.competition_duels values(${boardOf(rule)},${Math.floor(now() / 86400000)},${ids[0]},${ids[1]},${room.code}) on conflict do nothing returning match_id`,
        );
        rated = recorded.length > 0;
      } else rated = false;
    }
    for (const player of room.players) {
      const result = player.result!;
      if (result.finished && result.eligible && rated) {
        const previous = rule.duel ? (await ranking(boardOf(rule), player.id, tx)).me : null;
        await record(
          tx,
          room.code,
          boardOf(rule),
          player.id,
          result.score + Number(previous?.score ?? 0),
          rule.duel ? 0 : result.secondary,
        );
      }
    }
    await tx.execute(
      sql`insert into runtime.competition_matches values(${room.code},${boardOf(rule)},${json({ players: room.players.map((p) => ({ id: p.id, result: p.result })), rated, timedOut })}::jsonb,${now()}) on conflict do nothing`,
    );
    room.results = await Promise.all(
      room.players.map(async (player) => ({
        userId: player.id,
        playerId: player.id,
        result: player.result,
        before: player.before ?? null,
        rated,
        reason: rated
          ? null
          : room.players.every((p) => p.result?.eligible)
            ? '同一对玩家今天已计分，本局仅好友对战'
            : '本局未满足有效成绩条件',
        after: await ranking(boardOf(rule), player.id, tx),
      })),
    );
  }
  async function start(room: Room, tx: Tx) {
    const rule = ruleFor(room.game);
    if (
      room.status !== 'waiting' ||
      room.players.length !== (rule.roomSize?.(room.mode) ?? 2) ||
      !room.players.every((p) => p.ready)
    )
      return;
    if (room.game === 'night-overwatch') {
      room.trialRoundId = randomUUID();
      for (const player of [...room.players].sort((a, b) => a.id.localeCompare(b.id)))
        await useNightTrials(
          tx,
          player.id,
          player.loadout ?? [],
          true,
          now(),
          'room:' + room.trialRoundId,
        );
    }
    room.status = 'playing';
    room.startedAt = now() + (rule.lobby ? 1200 : 0);
    room.deadline = rule.noTimeLimit ? Number.MAX_SAFE_INTEGER : room.startedAt + rule.durationMs;
    room.firstRole =
      room.initiative === 'random' ? rule.roles?.[randomInt(rule.roles.length)] : room.initiative;
    for (const player of room.players) {
      if (rule.lobby) {
        player.seenAt = room.startedAt;
        player.disconnected = false;
        delete player.reconnectUntil;
      }
      player.state = rule.initial(
        room.seed,
        room.mode,
        room.firstRole,
        room.game === 'night-overwatch' ? room.players.map((p) => p.loadout ?? []) : undefined,
      );
      player.before = rule.unrated ? null : (await ranking(boardOf(rule), player.id, tx)).me;
    }
  }
  async function lockMatch(tx: Database | Tx, game: string) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('competition-match:' || ${game},0))`,
    );
  }
  async function activeRoom(tx: Database | Tx, game: string, playerId: string) {
    const rows = await tx.execute(sql`select data from runtime.competition_rooms
      where data->>'game'=${game} and data->>'status' in ('waiting','playing') and expires_at>${now()}
      and data->>'version'=${ruleFor(game).version}
      and exists(select 1 from jsonb_array_elements(data->'players') p where p->>'id'=${playerId} and coalesce((p->>'takenOver')::boolean,false)=false)
      order by data->>'createdAt' desc limit 1 for update`);
    return rows[0]?.data as Room | undefined;
  }
  async function password(room: Room, supplied?: string) {
    if (
      room.passwordHash &&
      (!supplied ||
        !timingSafeEqual(
          Buffer.from(room.passwordHash, 'hex'),
          await passwordKey(supplied, room.passwordSalt!),
        ))
    )
      throw new CompetitionError('INVALID_PASSWORD', 403);
  }
  function pruneSpectators(room: Room) {
    room.spectators = (room.spectators ?? []).filter(
      (id) => now() - (room.spectatorSeenAt?.[id] ?? room.createdAt) < spectatorLeaseMs,
    );
    room.spectatorSeenAt = Object.fromEntries(
      room.spectators.map((id) => [id, room.spectatorSeenAt?.[id] ?? room.createdAt]),
    );
  }
  async function advanceLobby(room: Room, tx: Tx) {
    pruneSpectators(room);
    if (room.status !== 'playing') return;
    const rule = ruleFor(room.game);
    const elapsed = Math.max(0, now() - room.startedAt!);
    const expired = room.players.filter(
      (member) => !member.takenOver && now() >= (member.reconnectUntil ?? member.seenAt! + 30000),
    );
    for (const member of room.players) {
      if (!member.takenOver && now() - member.seenAt! >= 2500) {
        member.disconnected = true;
        member.reconnectUntil ??= member.seenAt! + 30000;
      }
    }
    if (expired.length) {
      const cutoff = Math.max(
        0,
        Math.min(...expired.map((member) => member.reconnectUntil ?? member.seenAt! + 30000)) -
          room.startedAt!,
      );
      room.players[0]!.state = rule.advance!(room.players[0]!.state, cutoff);
      await finish(room, tx);
      if (room.status !== 'playing') return;
      for (const member of expired) {
        member.takenOver = true;
        member.disconnected = true;
        room.players[0]!.state = rule.takeover!(
          room.players[0]!.state,
          room.players.indexOf(member),
        );
      }
      const abandoned = room.players.every((member) => member.takenOver);
      if (abandoned)
        for (const member of room.players) {
          member.takenOver = true;
          member.disconnected = true;
        }
      await settleNightRoom(tx, room, now(), abandoned ? 'abandoned' : 'disconnect');
      if (abandoned) {
        room.status = 'abandoned';
        return;
      }
    }
    room.players[0]!.state = rule.advance!(room.players[0]!.state, elapsed);
    await finish(room, tx);
    room.deadline = Number.MAX_SAFE_INTEGER;
  }
  async function match(auth: PlayerAuth, game: string) {
    const playerId = playerIdOf(auth);
    const rule = ruleFor(game);
    if (!rule.modes?.some((mode) => mode.id === 'match'))
      throw new CompetitionError('MATCH_UNAVAILABLE', 404);
    return db.transaction(async (tx) => {
      const policy = await gamePolicy(control, tx, game);
      await lockMatch(tx, game);
      await assertResourceAuth(tx, auth, game, now());
      if (rule.lobby) {
        assertGameControl(policy, policy?.killEpoch, true);
        let room = await activeRoom(tx, game, playerId);
        if (room) {
          if (room.version !== rule.version) throw new CompetitionError('RULE_VERSION_CHANGED');
          assertGameControl(policy, room.killEpoch ?? 0);
          await advanceLobby(room, tx);
          await tx.execute(
            sql`update runtime.competition_rooms set data=${json(room)}::jsonb,expires_at=${room.deadline} where code=${room.code}`,
          );
        }
        if (
          room &&
          (!['waiting', 'playing'].includes(room.status) ||
            room.players.find((p) => p.id === playerId)?.takenOver)
        )
          room = undefined;
        if (!room) {
          const waiting =
            await tx.execute(sql`select data from runtime.competition_rooms where data->>'game'=${game}
            and data->>'version'=${rule.version} and data->>'visibility'='public' and data->>'mode'<>'bot'
            and data->>'status'='waiting' and expires_at>${now()} and jsonb_array_length(data->'players')=1
            and coalesce((data->>'killEpoch')::bigint,0)=${policy?.killEpoch ?? 0}
            order by data->>'createdAt',code limit 1 for update`);
          room = waiting[0]?.data as Room | undefined;
          if (room)
            room.players.push({
              id: playerId,
              ready: false,
              seq: 0,
              state: null,
              leaseId: randomUUID(),
              seenAt: now(),
            });
          else room = await create(auth, game, { mode: 'match', visibility: 'public' }, tx);
        }
        await tx.execute(
          sql`update runtime.competition_rooms set data=${json(room)}::jsonb,expires_at=${room.deadline} where code=${room.code}`,
        );
        return view(room, playerId, tx, room.players.find((p) => p.id === playerId)?.leaseId);
      }
      const own = await tx.execute(sql`select data from runtime.competition_rooms
        where data->>'game'=${game} and data->>'mode' in ('match','bot')
        and data->>'status' in ('waiting','playing') and expires_at>${now()}
        and data->'players' @> ${json([{ id: playerId }])}::jsonb
        order by data->>'createdAt' desc limit 1 for update`);
      let room = own[0]?.data as Room | undefined;
      if (room && room.version !== rule.version) throw new CompetitionError('RULE_VERSION_CHANGED');
      assertGameControl(
        policy,
        room?.killEpoch ?? policy?.killEpoch ?? 0,
        room?.status !== 'playing',
      );
      if (room?.status === 'playing') {
        if (rule.advance)
          room.players[0]!.state =
            rule.advance(
              room.players[0]!.state,
              Math.min(rule.durationMs, Math.max(0, now() - room.startedAt!)),
            ) ?? room.players[0]!.state;
        await finish(room, tx, now() >= room.deadline);
        await tx.execute(
          sql`update runtime.competition_rooms set data=${json(room)}::jsonb,expires_at=${room.deadline} where code=${room.code}`,
        );
        return view(room, playerId, tx);
      }
      if (room && now() - room.createdAt >= 8000) {
        room.mode = 'bot';
        room.players[0]!.ready = true;
        await start(room, tx);
      } else if (!room) {
        const waiting = await tx.execute(sql`select data from runtime.competition_rooms
          where data->>'game'=${game} and data->>'version'=${rule.version}
          and data->>'mode'='match' and data->>'status'='waiting' and expires_at>${now()}
          and (data->>'createdAt')::bigint>${now() - 8000}
          and coalesce((data->>'killEpoch')::bigint,0)=${policy?.killEpoch ?? 0}
          and jsonb_array_length(data->'players')=1
          and not (data->'players' @> ${json([{ id: playerId }])}::jsonb)
          order by data->>'createdAt',code limit 1 for update`);
        room = waiting[0]?.data as Room | undefined;
        if (room) {
          assertGameControl(policy, room.killEpoch ?? 0, true);
          room.players.push({ id: playerId, ready: true, seq: 0, state: null });
          room.players[0]!.ready = true;
          await start(room, tx);
        } else room = await create(auth, game, { mode: 'match' }, tx);
      }
      await tx.execute(
        sql`update runtime.competition_rooms set data=${json(room)}::jsonb,expires_at=${room.deadline} where code=${room.code}`,
      );
      return view(room, playerId, tx);
    });
  }
  async function lobbyAction(
    room: Room,
    playerId: string,
    operation: string,
    input: {
      seq?: number;
      action?: unknown;
      password?: string;
      leaseId?: string;
      ready?: boolean;
      loadout?: NightLoadout;
    },
    tx: Tx,
    policy: Awaited<ReturnType<typeof gamePolicy>>,
  ) {
    const rule = ruleFor(room.game);
    let member = room.players.find((p) => p.id === playerId);
    const wasSpectator = room.spectators?.includes(playerId);
    pruneSpectators(room);
    if (!member && wasSpectator && operation === 'leave') {
      room.spectators = room.spectators!.filter((id) => id !== playerId);
      delete room.spectatorSeenAt![playerId];
      await tx.execute(
        sql`update runtime.competition_rooms set data=${json(room)}::jsonb where code=${room.code}`,
      );
      return { code: room.code, spectator: true, left: true };
    }
    const spectator = room.spectators?.includes(playerId);
    if (!member && !spectator && !['join', 'spectate'].includes(operation))
      throw new CompetitionError('NOT_A_MEMBER', 403);
    if (!member && !['get', 'spectate', 'join'].includes(operation))
      throw new CompetitionError('SPECTATOR_READ_ONLY', 403);
    if (member && input.leaseId && input.leaseId !== member.leaseId)
      throw new CompetitionError('STALE_LEASE');
    if (
      member &&
      !['get', 'join', 'connect', 'spectate'].includes(operation) &&
      input.leaseId !== member.leaseId
    )
      throw new CompetitionError('STALE_LEASE');
    if (!member && ['join', 'spectate'].includes(operation)) await password(room, input.password);
    if (
      operation === 'leave' &&
      policy &&
      (policy.state === 'disabled' || policy.killEpoch !== (room.killEpoch ?? 0))
    ) {
      if (room.trialRoundId && room.status === 'playing' && now() < room.startedAt!) {
        for (const player of [...room.players].sort((a, b) => a.id.localeCompare(b.id)))
          await refundNightTrials(tx, player.id, now(), 'room:' + room.trialRoundId);
        delete room.trialRoundId;
      }
      room.status = 'abandoned';
      await tx.execute(
        sql`update runtime.competition_rooms set data=${json(room)}::jsonb where code=${room.code}`,
      );
      return view(room, playerId, tx);
    }
    assertGameControl(
      policy,
      room.killEpoch ?? 0,
      ['join', 'ready', 'rematch'].includes(operation),
    );
    await advanceLobby(room, tx);
    if (room.status === 'waiting' && now() >= room.deadline) room.status = 'expired';
    let exposeLease: string | undefined;
    if (operation === 'spectate' && !member) {
      if (!['waiting', 'playing'].includes(room.status)) throw new CompetitionError('MATCH_CLOSED');
      room.spectators ??= [];
      if (!spectator) {
        if (room.spectators.length >= 256) throw new CompetitionError('ROOM_FULL');
        room.spectators.push(playerId);
      }
    }
    if (!member && (operation === 'spectate' || (operation === 'get' && spectator)))
      room.spectatorSeenAt![playerId] = now();
    if (operation === 'join' && !member) {
      if (room.status !== 'waiting') throw new CompetitionError('INVITATION_EXPIRED');
      if (room.players.length >= (rule.roomSize?.(room.mode) ?? 2))
        throw new CompetitionError('ROOM_FULL');
      const active = await activeRoom(tx, room.game, playerId);
      if (active && active.code !== room.code) throw new CompetitionError('ACTIVE_ROOM');
      member = {
        id: playerId,
        ready: false,
        seq: 0,
        state: null,
        leaseId: randomUUID(),
        seenAt: now(),
      };
      room.players.push(member);
      room.spectators = room.spectators?.filter((id) => id !== playerId);
      delete room.spectatorSeenAt![playerId];
      exposeLease = member.leaseId;
    }
    if (member && operation === 'connect') {
      if (member.takenOver) throw new CompetitionError('PLAYER_DISCONNECTED');
      member.leaseId = randomUUID();
      exposeLease = member.leaseId;
    }
    if (
      member &&
      !member.takenOver &&
      (operation === 'connect' || input.leaseId === member.leaseId)
    ) {
      member.seenAt = now();
      member.disconnected = false;
      delete member.reconnectUntil;
    }
    if (operation === 'leave' && member) {
      if (room.status === 'waiting' || (room.status === 'playing' && now() < room.startedAt!)) {
        if (room.trialRoundId && room.status === 'playing') {
          for (const player of [...room.players].sort((a, b) => a.id.localeCompare(b.id)))
            await refundNightTrials(tx, player.id, now(), 'room:' + room.trialRoundId);
          delete room.trialRoundId;
        }
        room.players = room.players.filter((player) => player.id !== playerId);
        room.status = 'waiting';
        delete room.startedAt;
        room.deadline = now() + 15 * 60_000;
        for (const player of room.players) {
          player.ready = false;
          player.state = null;
          player.seq = 0;
        }
        if (room.players.length) {
          await tx.execute(
            sql`update runtime.competition_rooms set data=${json(room)}::jsonb,expires_at=${room.deadline} where code=${room.code}`,
          );
        } else await tx.execute(sql`delete from runtime.competition_rooms where code=${room.code}`);
        return { code: room.code, left: true };
      }
      if (room.status === 'playing' && room.mode === 'bot') {
        room.status = 'abandoned';
        await settleNightRoom(tx, room, now(), 'abandoned');
      } else if (room.status === 'playing' && !member.takenOver) {
        member.disconnected = true;
        member.reconnectUntil = now() + 30000;
      }
    } else if (operation === 'ready' && member) {
      if (room.status === 'waiting') {
        if (room.game === 'night-overwatch' && input.ready !== false) {
          await checkNightLoadout(tx, playerId, input.loadout ?? [], true, now());
          member.loadout = input.loadout ?? [];
        }
        member.ready = input.ready ?? true;
        await start(room, tx);
      } else if (room.status !== 'playing') throw new CompetitionError('MATCH_CLOSED');
      else if (input.ready === false) throw new CompetitionError('MATCH_STARTED');
    } else if (operation === 'actions' && member) {
      if (member.takenOver) throw new CompetitionError('PLAYER_DISCONNECTED');
      const actionHash = hash(json(input.action));
      const existing = await tx.execute(
        sql`select action_hash from runtime.competition_actions where room_code=${room.code} and player_id=${playerId} and seq=${input.seq}`,
      );
      if (existing.length) {
        if (existing[0]!.action_hash !== actionHash)
          throw new CompetitionError('SEQUENCE_CONFLICT');
      } else {
        if (room.status !== 'playing') throw new CompetitionError('MATCH_CLOSED');
        if (now() < room.startedAt!) throw new CompetitionError('MATCH_STARTING');
        if (input.seq !== member.seq + 1) throw new CompetitionError('SEQUENCE_CONFLICT');
        try {
          room.players[0]!.state = rule.action(
            room.players[0]!.state,
            input.action,
            now() - room.startedAt!,
            room.players.indexOf(member),
          );
        } catch {
          throw new CompetitionError('ILLEGAL_ACTION', 422);
        }
        member.seq = input.seq!;
        await tx.execute(
          sql`insert into runtime.competition_actions values(${room.code},${playerId},${input.seq},${actionHash},${now()})`,
        );
        await finish(room, tx);
      }
    } else if (operation === 'rematch' && member) {
      if (!['finished', 'abandoned', 'expired'].includes(room.status))
        throw new CompetitionError('MATCH_NOT_FINISHED');
      if (!room.rematch) {
        await tx.execute(
          sql`update runtime.competition_rooms set data=${json(room)}::jsonb where code=${room.code}`,
        );
        const next = await create(
          playerId,
          room.game,
          { mode: room.mode === 'bot' ? 'bot' : 'friend' },
          tx,
        );
        next.visibility = room.visibility;
        next.passwordHash = room.passwordHash;
        next.passwordSalt = room.passwordSalt;
        await tx.execute(
          sql`update runtime.competition_rooms set data=${json(next)}::jsonb where code=${next.code}`,
        );
        room.rematch = next.code;
      }
    }
    await tx.execute(
      sql`update runtime.competition_rooms set data=${json(room)}::jsonb,expires_at=${room.deadline} where code=${room.code}`,
    );
    return view(room, playerId, tx, exposeLease);
  }
  async function roomAction(
    auth: PlayerAuth,
    code: string,
    operation: string,
    input: {
      seq?: number;
      action?: unknown;
      game?: string;
      role?: string;
      initiative?: string;
      password?: string;
      leaseId?: string;
      ready?: boolean;
      loadout?: NightLoadout;
    } = {},
  ) {
    const playerId = playerIdOf(auth);
    return db.transaction(async (tx) => {
      const preview = await tx.execute(
        sql`select data from runtime.competition_rooms where code=${code}`,
      );
      if (!preview[0]) throw new CompetitionError('INVITATION_NOT_FOUND', 404);
      const previewRoom = preview[0].data as Room;
      const policy =
        operation !== 'leave' || ruleFor(previewRoom.game).lobby
          ? await gamePolicy(control, tx, previewRoom.game)
          : undefined;
      if (
        ruleFor(previewRoom.game).lobby ||
        previewRoom.mode === 'match' ||
        previewRoom.mode === 'bot'
      )
        await lockMatch(tx, previewRoom.game);
      const rows = await tx.execute(
        sql`select data from runtime.competition_rooms where code=${code} for update`,
      );
      if (!rows[0]) throw new CompetitionError('INVITATION_NOT_FOUND', 404);
      const room = rows[0].data as Room;
      await assertResourceAuth(tx, auth, room.game, now());
      if (policy && policy.gameId !== room.game) throw new CompetitionError('WRONG_GAME');
      if (input.game && room.game !== input.game) throw new CompetitionError('WRONG_GAME', 409);
      const rule = ruleFor(room.game);
      if (room.version !== rule.version) throw new CompetitionError('RULE_VERSION_CHANGED');
      if (rule.lobby) return lobbyAction(room, playerId, operation, input, tx, policy);
      if (operation === 'leave') {
        if (!room.players.some((p) => p.id === playerId))
          throw new CompetitionError('NOT_A_MEMBER', 403);
        if (room.status === 'waiting' || room.status === 'playing') room.status = 'abandoned';
        await tx.execute(
          sql`update runtime.competition_rooms set data=${json(room)}::jsonb,expires_at=${room.deadline} where code=${code}`,
        );
        return view(room, playerId, tx);
      }
      if (control && operation === 'actions') {
        const receipts = await tx.execute(
          sql`select action_hash from runtime.competition_actions where room_code=${code} and player_id=${playerId} and seq=${input.seq}`,
        );
        if (receipts[0]) {
          if (receipts[0].action_hash !== hash(json(input.action)))
            throw new CompetitionError('SEQUENCE_CONFLICT');
          return view(room, playerId, tx);
        }
      }
      if (room.status === 'finished' && operation === 'get') return view(room, playerId, tx);
      assertGameControl(
        policy,
        room.killEpoch ?? 0,
        ['join', 'ready', 'rematch'].includes(operation),
      );
      if (policy?.state === 'draining' && room.status !== 'playing' && operation === 'get')
        return view(room, playerId, tx);
      if (room.status === 'playing' && rule.advance) {
        for (const player of rule.duel ? room.players.slice(0, 1) : room.players)
          player.state =
            rule.advance(player.state, Math.min(rule.durationMs, now() - room.startedAt!)) ??
            player.state;
        await finish(room, tx);
      }
      if (now() >= room.deadline && room.status === 'waiting') room.status = 'expired';
      if (room.status === 'playing' && now() >= room.deadline) {
        if (!rule.duel)
          for (const player of room.players) {
            if (rule.result(player.state).finished) continue;
            try {
              player.state =
                rule.action(player.state, { type: 'finish' }, rule.durationMs) ?? player.state;
            } catch {
              /* This ruleset treats unfinished attempts as ineligible. */
            }
          }
        await finish(room, tx, true);
      }
      let member = room.players.find((p) => p.id === playerId);
      if (operation === 'join' && !member) {
        if (room.mode === 'match') throw new CompetitionError('MATCH_QUEUE_ONLY');
        if (room.status !== 'waiting') throw new CompetitionError('INVITATION_EXPIRED');
        if (room.players.length >= (rule.roomSize?.(room.mode) ?? 2))
          throw new CompetitionError('ROOM_FULL');
        member = {
          id: playerId,
          role: rule.roles?.find((role) => !room.players.some((player) => player.role === role)),
          ready: false,
          seq: 0,
          state: null,
        };
        room.players.push(member);
      }
      if (!member) throw new CompetitionError('NOT_A_MEMBER', 403);
      if (operation === 'ready') {
        if (room.status !== 'waiting' && room.status !== 'playing')
          throw new CompetitionError('MATCH_CLOSED');
        if (room.status === 'waiting') {
          if (room.mode === 'match') throw new CompetitionError('MATCH_QUEUE_ONLY');
          member.ready = true;
          await start(room, tx);
        }
      } else if (operation === 'initiative') {
        if (room.status !== 'waiting') throw new CompetitionError('MATCH_CLOSED');
        if (room.players[0] !== member) throw new CompetitionError('HOST_ONLY', 403);
        if (
          !rule.roles ||
          !input.initiative ||
          ![...rule.roles, 'random'].includes(input.initiative)
        )
          throw new CompetitionError('INVALID_ROLE', 422);
        room.initiative = input.initiative;
        for (const player of room.players) player.ready = false;
      } else if (operation === 'role') {
        if (room.status !== 'waiting') throw new CompetitionError('MATCH_CLOSED');
        if (!input.role || !rule.roles?.includes(input.role))
          throw new CompetitionError('INVALID_ROLE', 422);
        if (member.role !== input.role) {
          const previous = member.role;
          for (const player of room.players) {
            if (player.role === input.role) player.role = previous;
            player.ready = false;
          }
          member.role = input.role;
        }
      } else if (operation === 'actions') {
        const existing = await tx.execute(
          sql`select action_hash from runtime.competition_actions where room_code=${code} and player_id=${playerId} and seq=${input.seq}`,
        );
        const actionHash = hash(json(input.action));
        if (existing.length) {
          if (existing[0]!.action_hash !== actionHash)
            throw new CompetitionError('SEQUENCE_CONFLICT');
        } else {
          if (room.status !== 'playing') throw new CompetitionError('MATCH_CLOSED');
          if (input.seq !== member.seq + 1) throw new CompetitionError('SEQUENCE_CONFLICT');
          const seat = ruleSeat(rule, room, room.players.indexOf(member));
          const owner = rule.duel ? room.players[0]! : member;
          if (rule.result(owner.state, seat).finished)
            throw new CompetitionError('PLAYER_FINISHED');
          try {
            owner.state =
              rule.action(owner.state, input.action, now() - room.startedAt!, seat) ?? owner.state;
          } catch {
            throw new CompetitionError('ILLEGAL_ACTION', 422);
          }
          member.seq = input.seq;
          await tx.execute(
            sql`insert into runtime.competition_actions values(${code},${playerId},${input.seq},${actionHash},${now()})`,
          );
          await finish(room, tx);
        }
      } else if (operation === 'leave') {
        if (room.status === 'waiting' || room.status === 'playing') room.status = 'abandoned';
      } else if (operation === 'rematch') {
        if (room.mode === 'match') throw new CompetitionError('MATCH_QUEUE_ONLY');
        if (!['finished', 'abandoned', 'expired'].includes(room.status))
          throw new CompetitionError('MATCH_NOT_FINISHED');
        if (!room.rematch)
          room.rematch = (
            await create(
              auth,
              room.game,
              { mode: room.mode, role: member.role, initiative: room.initiative },
              tx,
            )
          ).code;
      }
      await tx.execute(
        sql`update runtime.competition_rooms set data=${json(room)}::jsonb,expires_at=${room.deadline} where code=${code}`,
      );
      return view(room, playerId, tx);
    });
  }
  return {
    ...createCompetitionIdentities(db, now),
    gameDefinitions: () => [...rules.values()],
    ranking,
    ruleFor,
    roomAction,
    match,
    async sweepRooms() {
      for (const rule of rules.values()) {
        if (!rule.lobby) continue;
        await db.transaction(async (tx) => {
          const policy = await gamePolicy(control, tx, rule.id);
          if (policy?.state === 'disabled') return;
          await lockMatch(tx, rule.id);
          const rows = await tx.execute(sql`select data from runtime.competition_rooms
            where data->>'game'=${rule.id} and data->>'version'=${rule.version}
            and coalesce((data->>'killEpoch')::bigint,0)=${policy?.killEpoch ?? 0}
            and ((data->>'status'='playing' and exists(select 1 from jsonb_array_elements(data->'players') p
              where coalesce((p->>'takenOver')::boolean,false)=false
              and coalesce((p->>'reconnectUntil')::bigint,(p->>'seenAt')::bigint+30000)<=${now()}))
              or exists(select 1 from jsonb_array_elements_text(coalesce(data->'spectators','[]'::jsonb)) s(id)
                where coalesce((data->'spectatorSeenAt'->>s.id)::bigint,(data->>'createdAt')::bigint)<=${now() - spectatorLeaseMs}))
            order by data->>'startedAt',code limit 10 for update`);
          for (const row of rows) {
            const room = row.data as Room;
            pruneSpectators(room);
            if (
              room.status === 'playing' &&
              room.players.some(
                (member) =>
                  !member.takenOver && now() >= (member.reconnectUntil ?? member.seenAt! + 30000),
              )
            )
              await advanceLobby(room, tx);
            await tx.execute(
              sql`update runtime.competition_rooms set data=${json(room)}::jsonb,expires_at=${room.deadline} where code=${room.code}`,
            );
          }
        });
      }
    },
    async listRooms(auth: PlayerAuth, game: string) {
      return db.transaction(async (tx) => {
        const rule = ruleFor(game);
        const policy = await gamePolicy(control, tx, game);
        assertGameControl(policy, policy?.killEpoch, true);
        await lockMatch(tx, game);
        await assertResourceAuth(tx, auth, game, now());
        const rows =
          await tx.execute(sql`select data from runtime.competition_rooms where data->>'game'=${game}
          and data->>'version'=${rule.version} and data->>'visibility'='public'
          and data->>'status' in ('waiting','playing') and expires_at>${now()}
          and coalesce((data->>'killEpoch')::bigint,0)=${policy?.killEpoch ?? 0}
          order by data->>'createdAt' desc,code desc limit 50 for update`);
        const rooms = [];
        for (const row of rows) {
          const room = row.data as Room;
          if (rule.lobby) {
            await advanceLobby(room, tx);
            await tx.execute(
              sql`update runtime.competition_rooms set data=${json(room)}::jsonb,expires_at=${room.deadline} where code=${room.code}`,
            );
          }
          if (!['waiting', 'playing'].includes(room.status)) continue;
          const profiles = await tx.execute(
            sql`select id,display_name,profile from runtime.competition_players where id in (${sql.join(
              room.players.map((p) => sql`${p.id}::uuid`),
              sql`,`,
            )})`,
          );
          const capacity = rule.roomSize?.(room.mode) ?? 2;
          rooms.push({
            code: room.code,
            game,
            status: room.status,
            mode: room.mode,
            capacity,
            playerCount: room.players.length,
            canJoin: room.status === 'waiting' && room.players.length < capacity,
            canSpectate: !!rule.lobby,
            players: room.players.map((p) => ({
              id: p.id,
              ...publicProfile(profiles.find((row) => row.id === p.id) ?? { id: p.id }),
              ready: p.ready,
              disconnected: !!p.disconnected,
              reconnectUntil: p.reconnectUntil,
              takenOver: !!p.takenOver,
            })),
          });
        }
        return { rooms, serverNow: now() };
      });
    },
    async history(auth: PlayerAuth, game: string, cursor?: string) {
      if (game !== 'night-overwatch') throw new CompetitionError('HISTORY_UNAVAILABLE', 404);
      return db.transaction(async (tx) => {
        const policy = await gamePolicy(control, tx, game);
        await lockMatch(tx, game);
        await assertResourceAuth(tx, auth, game, now());
        const own = await activeRoom(tx, game, playerIdOf(auth));
        if (own) {
          assertGameControl(policy, own.killEpoch ?? 0);
          await advanceLobby(own, tx);
          await tx.execute(
            sql`update runtime.competition_rooms set data=${json(own)}::jsonb,expires_at=${own.deadline} where code=${own.code}`,
          );
        }
        return nightHistory(tx, playerIdOf(auth), cursor);
      });
    },
    async nightWallet(auth: PlayerAuth, command?: Parameters<typeof nightWallet>[3]) {
      return db.transaction(async (tx) => {
        const policy = await gamePolicy(control, tx, 'night-overwatch');
        assertGameControl(policy, policy?.killEpoch, !!command);
        const ad = command?.kind === 'lottery-start' || command?.kind === 'lottery-claim';
        if (ad) await lockMatch(tx, 'night-overwatch');
        await assertResourceAuth(tx, auth, 'night-overwatch', now());
        if (ad) {
          const room = await activeRoom(tx, 'night-overwatch', playerIdOf(auth));
          if (room?.status === 'playing') throw new CompetitionError('AD_DURING_DUEL');
        }
        return nightWallet(
          tx,
          playerIdOf(auth),
          now(),
          command,
          ruleFor('night-overwatch').nightMods,
          ruleFor('night-overwatch').clearCoins,
        );
      });
    },
    async prepareNightBoards(auth: PlayerAuth) {
      await db.transaction(async (tx) => {
        await assertResourceAuth(tx, auth, 'night-overwatch', now());
        await backfillNightClears(tx, now());
        await prepareNightDuelPoints(tx, now());
      });
    },
    async startStreetRun(auth: PlayerAuth, config: Record<string, unknown>) {
      const playerId = playerIdOf(auth);
      return db.transaction(async (tx) => {
        const policy = await gamePolicy(control, tx, 'cops-robbers-realtime');
        assertGameControl(policy, policy?.killEpoch, true);
        await assertResourceAuth(tx, auth, 'cops-robbers-realtime', now());
        const admissionId = randomUUID();
        const data = {
          kind: 'street-admission-v1',
          playerId,
          game: 'cops-robbers-realtime',
          killEpoch: policy?.killEpoch ?? 0,
          configHash: hash(json(config)),
          expiresAt: now() + 86400_000,
        };
        await tx.execute(sql`insert into runtime.competition_matches(id,board,data,created_at)
          values(${`street-admission:${admissionId}`},${'street-admission'},${json(data)}::jsonb,${now()})`);
        return { admissionId, expiresAt: data.expiresAt };
      });
    },
    async streetRuns(
      auth: PlayerAuth,
      config: Record<string, unknown>,
      input?: unknown,
      admissionId?: string,
    ) {
      const playerId = playerIdOf(auth);
      assertGameScope(auth, 'cops-robbers-realtime');
      const rule = ruleFor('cops-robbers-realtime');
      let board: string;
      let result: { board: string; elapsedMs: number } | undefined;
      try {
        if (!rule.runBoard || !rule.verifyRun) throw new Error('unsupported');
        board = rule.runBoard(config);
      } catch {
        throw new CompetitionError('INVALID_RUN', 422);
      }
      if (input !== undefined) {
        const matchId = 'street-run:' + hash(json([playerId, config, input]));
        result = await db.transaction(async (tx) => {
          const policy = await gamePolicy(control, tx, 'cops-robbers-realtime');
          await assertResourceAuth(tx, auth, 'cops-robbers-realtime', now());
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${matchId}))`);
          const prior = await tx.execute(sql`select score from runtime.competition_results
            where match_id=${matchId} and player_id=${playerId}`);
          // Original hash/owner receipt wins before any fresh admission or result verification.
          if (prior[0]) return { board, elapsedMs: -Number(prior[0].score) };
          let admission:
            | {
                playerId: string;
                game: string;
                killEpoch?: number;
                configHash: string;
                expiresAt: number;
                resultHash?: string;
              }
            | undefined;
          if (admissionId) {
            const rows = await tx.execute(sql`select data from runtime.competition_matches
              where id=${`street-admission:${admissionId}`} for update`);
            admission = rows[0]?.data as typeof admission;
            if (
              !admission ||
              admission.playerId !== playerId ||
              admission.game !== 'cops-robbers-realtime' ||
              admission.configHash !== hash(json(config)) ||
              admission.expiresAt <= now()
            )
              throw new CompetitionError('RUN_ADMISSION_REQUIRED', 403);
            if (admission.resultHash && admission.resultHash !== matchId)
              throw new CompetitionError('SEQUENCE_CONFLICT');
          }
          // No trusted legacy start exists: after the first kill, a fresh server ticket is mandatory.
          assertGameControl(policy, admission?.killEpoch ?? 0, !admission);
          let verified: { board: string; elapsedMs: number };
          try {
            verified = rule.verifyRun!(config, input);
          } catch {
            throw new CompetitionError('INVALID_RUN', 422);
          }
          const elapsedMs = verified.elapsedMs;
          await record(tx, matchId, board, playerId, -elapsedMs, 0);
          if (admission) {
            admission.resultHash = matchId;
            await tx.execute(
              sql`update runtime.competition_matches set data=${json(admission)}::jsonb where id=${`street-admission:${admissionId}`}`,
            );
          }
          return verified;
        });
      }
      const rankingResult = await ranking(board, auth, db, 'cops-robbers-realtime');
      const top = rankingResult.top.map((row) => ({
        playerId: row.playerId,
        userId: row.userId,
        name: row.name,
        nickname: row.nickname,
        avatarId: row.avatarId,
        avatarUrl: row.avatarUrl,
        region: row.region,
        profileSource: row.profileSource,
        profileUpdatedAt: row.profileUpdatedAt,
        elapsedMs: -Number(row.score),
        rank: row.rank,
      }));
      return {
        accepted: !!result,
        board,
        fastestMs: top[0]?.elapsedMs ?? null,
        top,
        personalMs: rankingResult.me ? -Number(rankingResult.me.score) : null,
      };
    },
    async create(auth: PlayerAuth, game: string, options: RoomOptions = {}) {
      if (options.mode === 'match') return match(auth, game);
      return db.transaction(async (tx) => {
        const room = await create(auth, game, options, tx);
        return view(
          room,
          playerIdOf(auth),
          tx,
          room.players.find((p) => p.id === playerIdOf(auth))?.leaseId,
        );
      });
    },
    async board(game: string, auth: PlayerAuth | null) {
      assertGameScope(auth, game);
      const rule =
        game === 'carding-car'
          ? {
              id: game,
              title: '浪湾卡丁车',
              version: 'seaside-v1',
              description: '海湾三圈，双人、固定车辆及种子；合法完赛用时越短越好。',
              modes: undefined,
              roles: undefined,
            }
          : ruleFor(game);
      const board =
        game === 'carding-car' ? 'carding-car-seaside-v1' : `${rule.id}:${rule.version}`;
      return {
        game,
        title: rule.title,
        version: rule.version,
        description: rule.description,
        rules: rule.description,
        modes: rule.modes,
        roles: rule.roles,
        ...(await ranking(board, auth, db, game)),
      };
    },
    async kartResults(input: {
      matchId: string;
      board: string;
      entries: { playerId: string; elapsedMs: number }[];
      startedAt: number;
      finishedAt: number;
      killEpoch?: number;
    }) {
      if (
        input.board !== 'carding-car-seaside-v1' ||
        input.finishedAt < input.startedAt ||
        input.finishedAt > now() + 10_000
      )
        throw new CompetitionError('INVALID_RESULT', 422);
      return db.transaction(async (tx) => {
        const policy = await gamePolicy(control, tx, 'carding-car');
        for (const id of input.entries.map((e) => e.playerId).sort())
          await assertStoredPlayerGame(tx, id, 'carding-car', now());
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.matchId}))`);
        const existing = await tx.execute(
          sql`select data from runtime.competition_matches where id=${input.matchId}`,
        );
        if (existing.length && json(existing[0]!.data) !== json(input)) {
          // JSONB key order differs; compare canonical payload fields rather than serialization order.
          const prior = existing[0]!.data as typeof input;
          if (
            prior.board !== input.board ||
            prior.startedAt !== input.startedAt ||
            prior.finishedAt !== input.finishedAt ||
            (prior.killEpoch ?? 0) !== (input.killEpoch ?? 0) ||
            json(prior.entries.map((e) => [e.playerId, e.elapsedMs]).sort()) !==
              json(input.entries.map((e) => [e.playerId, e.elapsedMs]).sort())
          )
            throw new CompetitionError('SETTLEMENT_CONFLICT');
        }
        if (existing.length)
          return {
            accepted: true,
            rankings: await Promise.all(
              input.entries.map((e) => ranking(input.board, e.playerId, tx)),
            ),
          };
        assertGameControl(policy, input.killEpoch ?? 0);
        await tx.execute(
          sql`insert into runtime.competition_matches values(${input.matchId},${input.board},${json(input)}::jsonb,${now()}) on conflict do nothing`,
        );
        for (const entry of input.entries) {
          if (entry.elapsedMs < 1000 || entry.elapsedMs > input.finishedAt - input.startedAt + 1000)
            throw new CompetitionError('INVALID_RESULT', 422);
          await record(tx, input.matchId, input.board, entry.playerId, -entry.elapsedMs, 0);
        }
        return {
          accepted: true,
          rankings: await Promise.all(
            input.entries.map((e) => ranking(input.board, e.playerId, tx)),
          ),
        };
      });
    },
  };
}
