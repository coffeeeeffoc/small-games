import { sql } from 'drizzle-orm';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { CompetitionError, type Room } from './types.js';

type Database = ReturnType<typeof openDatabase>['db'];
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export const nightBoard = (board: string) => `night-overwatch:${board}:night-records-v1`;
export const nightLedgerLock = (tx: Tx) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext('night-overwatch-ledger'))`);
const clearsMigration = 'night-migration:highest-clear-v2';

async function clearsMigrated(tx: Tx) {
  const rows = await tx.execute(sql`select id from runtime.competition_matches
    where id=${clearsMigration} and data->>'status'='complete'`);
  return rows.length > 0;
}

/** Old verified fastest times remain useful; old events never award new points. */
export async function backfillNightClears(tx: Tx, at: number) {
  if (await clearsMigrated(tx)) return;
  await nightLedgerLock(tx);
  if (await clearsMigrated(tx)) return;
  await tx.execute(sql`insert into runtime.competition_best(board,player_id,score,secondary,match_id,updated_at)
    select 'night-overwatch:' || split_part(board,':',2) || ':night-records-v1',player_id,1,min(secondary),min(match_id),${at}
    from runtime.competition_results where board ~ '^night-overwatch:level-[a-z0-9-]+:night-input-replay-v[0-9]+$' and score>0
    group by player_id,split_part(board,':',2)
    on conflict(board,player_id) do update set secondary=least(runtime.competition_best.secondary,excluded.secondary)`);
  await refreshNightClears(tx, at);
  await tx.execute(sql`insert into runtime.competition_matches(id,board,data,created_at)
    values(${clearsMigration},${nightBoard('migration')},'{"status":"complete"}'::jsonb,${at})
    on conflict(id) do update set data=excluded.data,created_at=excluded.created_at`);
}

/** All players only during migration; each new clear refreshes its owner. Caller holds ledger lock. */
export async function refreshNightClears(tx: Tx, at: number, playerId?: string) {
  const player = playerId ? sql`and player_id=${playerId}` : sql``;
  await tx.execute(sql`insert into runtime.competition_best(board,player_id,score,secondary,match_id,updated_at)
    select ${nightBoard('clears')},player_id,max(substring(level from '[0-9]+$')::int),0,'night-clears:' || player_id,${at}
    from (select player_id,substring(split_part(board,':',2) from 7) as level from runtime.competition_best
      where board like 'night-overwatch:level-%:night-records-v1' and score>0 ${player}
      union select player_id,substring(split_part(board,':',2) from 7) as level from runtime.competition_results
      where board like 'night-overwatch:clear-%:night-records-v1' and score>0 ${player}) cleared
    where level in ('corridor-01','ambush-02','patrol-03') or level ~ '^operation-(00[4-9]|0[1-9][0-9]|1[01][0-9]|120)$'
    group by player_id
    on conflict(board,player_id) do update set score=excluded.score,updated_at=excluded.updated_at
    where runtime.competition_best.score<>excluded.score`);
}

export async function nightSummary(tx: Tx | Database, playerId: string) {
  const rows = await tx.execute(sql`select count(*)::int as games,
    count(*) filter(where data->>'outcome'='win')::int as wins,
    count(*) filter(where data->>'outcome'='loss')::int as losses,
    count(*) filter(where data->>'outcome'='draw')::int as draws
    from runtime.competition_matches where board=${nightBoard('history')} and data->>'playerId'=${playerId}`);
  const { wins, losses, draws, games } = rows[0]!;
  return {
    wins: Number(wins),
    losses: Number(losses),
    draws: Number(draws),
    games: Number(games),
    winRate: Number(games) ? Number(wins) / Number(games) : 0,
  };
}

export async function nightPoints(
  tx: Tx,
  eventId: string,
  playerId: string,
  points: number,
  at: number,
) {
  await nightLedgerLock(tx);
  const inserted =
    await tx.execute(sql`insert into runtime.competition_results(match_id,board,player_id,score,secondary,created_at)
    values(${`night-points:${eventId}`},${nightBoard('points')},${playerId},${points},0,${at}) on conflict do nothing returning player_id`);
  if (inserted.length)
    await tx.execute(sql`insert into runtime.competition_best(board,player_id,score,secondary,match_id,updated_at)
    select ${nightBoard('points')},${playerId},coalesce(sum(score),0),0,${eventId},${at}
    from runtime.competition_results where board=${nightBoard('points')} and player_id=${playerId}
    on conflict(board,player_id) do update set score=excluded.score,match_id=excluded.match_id,updated_at=excluded.updated_at`);
  const rows = await tx.execute(
    sql`select score from runtime.competition_best where board=${nightBoard('points')} and player_id=${playerId}`,
  );
  return Number(rows[0]?.score ?? 0);
}

export async function settleNightRoom(
  tx: Tx,
  room: Room,
  at: number,
  reason: 'elimination' | 'disconnect' | 'abandoned',
) {
  if (room.settledAt !== undefined || !room.startedAt || at < room.startedAt) return;
  await nightLedgerLock(tx);
  const matchId = room.id ?? room.code;
  const human = room.players.length === 2 && room.mode !== 'bot';
  for (const member of room.players) {
    const outcome =
      reason === 'abandoned'
        ? 'loss'
        : reason === 'disconnect'
          ? member.takenOver
            ? 'loss'
            : 'win'
          : member.result!.outcome!;
    const points =
      reason === 'abandoned'
        ? 0
        : human
          ? { win: 120, loss: 40, draw: 60 }[outcome]
          : { win: 40, loss: 10, draw: 20 }[outcome];
    if (human) {
      const opponent = room.players.find((other) => other.id !== member.id)!;
      const record = {
        id: matchId,
        code: room.code,
        playerId: member.id,
        opponentId: opponent.id,
        outcome,
        reason,
        startedAt: room.startedAt,
        finishedAt: at,
        durationMs: Math.max(0, at - room.startedAt),
        points,
      };
      await tx.execute(sql`insert into runtime.competition_matches(id,board,data,created_at)
        values(${`night-history:${matchId}:${member.id}`},${nightBoard('history')},${JSON.stringify(record)}::jsonb,${at}) on conflict do nothing`);
    }
    const totalPoints = await nightPoints(tx, `duel:${matchId}`, member.id, points, at);
    const summary = await nightSummary(tx, member.id);
    if (human)
      await tx.execute(sql`insert into runtime.competition_best(board,player_id,score,secondary,match_id,updated_at)
      values(${nightBoard('win-rate')},${member.id},${summary.winRate},0,${matchId},${at})
      on conflict(board,player_id) do update set score=excluded.score,secondary=0,match_id=excluded.match_id,updated_at=excluded.updated_at`);
    member.settlement = {
      points,
      totalPoints,
      wins: summary.wins,
      games: summary.games,
      outcome,
      reason,
    };
  }
  room.settledAt = at;
}

export async function nightHistory(tx: Tx | Database, playerId: string, cursor?: string) {
  let before: { at: number; id: string } | undefined;
  if (cursor) {
    try {
      before = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (
        !before ||
        !Number.isSafeInteger(before.at) ||
        before.at < 0 ||
        !/^(?:[0-9]{6}|[A-F0-9]{12}|[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/.test(
          before.id,
        )
      )
        throw Error();
    } catch {
      throw new CompetitionError('INVALID_CURSOR', 422);
    }
  }
  const rows =
    await tx.execute(sql`select m.data,p.id as opponent_id,p.display_name as opponent_name from runtime.competition_matches m
    join runtime.competition_players p on p.id::text=m.data->>'opponentId'
    where m.board=${nightBoard('history')} and m.data->>'playerId'=${playerId}
    ${before ? sql`and (m.created_at,m.data->>'id') < (${before.at},${before.id})` : sql``}
    order by m.created_at desc,m.data->>'id' desc limit 21`);
  const matches = rows.slice(0, 20).map((row) => {
    const data = row.data as {
      id: string;
      code: string;
      outcome: string;
      reason: string;
      startedAt: number;
      finishedAt: number;
      durationMs: number;
      points: number;
    };
    return {
      id: data.id,
      code: data.code,
      opponent: { id: String(row.opponent_id), name: String(row.opponent_name ?? '新玩家') },
      outcome: data.outcome,
      reason: data.reason,
      startedAt: data.startedAt,
      finishedAt: data.finishedAt,
      durationMs: data.durationMs,
      points: data.points,
    };
  });
  const last = matches.at(-1);
  return {
    summary: await nightSummary(tx, playerId),
    matches,
    ...(rows.length > 20 && last
      ? {
          nextCursor: Buffer.from(JSON.stringify({ at: last.finishedAt, id: last.id })).toString(
            'base64url',
          ),
        }
      : {}),
  };
}
