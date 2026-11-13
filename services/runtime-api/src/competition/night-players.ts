import { sql, type SQL } from 'drizzle-orm';
import {
  playerBusiness,
  NIGHT_PLAYER_RESPONSE_BYTES,
  nightPlayerCoverage,
  nightPlayerExcluded,
  nightPlayerObservation,
  nightPlayerQuerySchema,
  nightPlayerDetailQuerySchema,
  type openDatabase,
} from '@coffeeeeffoc/service-kit';
import { CompetitionError } from './types.js';

type Database = ReturnType<typeof openDatabase>['db'];
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
const pageSize = 50;
const game = 'night-overwatch';
// Explicit business projections: new stored fields do not become admin-readable by default.
const recordFields = [
  'kind',
  'id',
  'game',
  'board',
  'boardKey',
  'version',
  'playerId',
  'seed',
  'levelId',
  'seq',
  'ticks',
  'createdAt',
  'expiresAt',
  'status',
  'settlement',
  'loadout',
  'loadoutStarted',
  'offline',
  'killEpoch',
  'result',
  'receipt',
  'input',
  'at',
  'day',
  'reason',
  'count',
  'lastAt',
  'orderId',
  'code',
  'opponentId',
  'outcome',
  'startedAt',
  'finishedAt',
  'durationMs',
  'points',
];
const roomFields = [
  'id',
  'code',
  'game',
  'version',
  'status',
  'seed',
  'mode',
  'initiative',
  'firstRole',
  'players',
  'createdAt',
  'startedAt',
  'deadline',
  'results',
  'rematch',
  'previousRoom',
  'rematchMembers',
  'visibility',
  'settledAt',
  'loadouts',
  'loadoutBattle',
  'killEpoch',
];
const project = (column: SQL, fields: string[]) =>
  sql`(select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(${column}) where key in (${sql.join(
    fields.map((f) => sql`${f}`),
    sql`, `,
  )}))`;
const belongs = sql`(exists(select 1 from runtime.player_game_access a where a.player_id=p.id and a.game=${game})
  or exists(select 1 from runtime.competition_matches w where w.id='night-assets:'||p.id::text or w.id='night-wallet:'||p.id::text))`;
const summary = sql`p.id, '#'||left(p.id::text,8) as "shortId", p.display_name as nickname,p.platform,p.created_at::double precision as "createdAt",
  observed."observedFrom",observed."observedTo",
  (w.data->>'coins')::double precision as coins,(w.data->>'xp')::double precision as xp`;
const players = sql`runtime.competition_players p left join runtime.competition_matches w on w.id='night-assets:'||p.id::text
  left join lateral (select min((value->>0)::double precision) as "observedFrom",max((value->>1)::double precision) as "observedTo"
    from jsonb_each(coalesce(w.data->'visits','{}'::jsonb))) observed on true`;

async function page(tx: Tx, query: SQL, current: number, size = pageSize) {
  const rows = await tx.execute(sql`with selected as (${query})
    select (select count(*)::int from selected) as total,
      coalesce((select jsonb_agg(part.data) from (select data from selected order by sort_at desc nulls last,sort_id desc limit ${size} offset ${(current - 1) * size}) part),'[]'::jsonb) as items`);
  const total = Number(rows[0]!.total);
  return {
    items: rows[0]!.items as unknown[],
    total,
    page: current,
    pageSize: size,
    nextPage: current * size < total ? current + 1 : null,
  };
}

function sectionQuery(id: string, section: keyof typeof nightPlayerCoverage): SQL {
  const matches = (condition: SQL, fields?: string[]) =>
    sql`select jsonb_build_object('id',id,'board',board,'createdAt',created_at,'data',${fields ? project(sql`data`, fields) : sql`data`}) as data,created_at as sort_at,id as sort_id from runtime.competition_matches where ${condition}`;
  switch (section) {
    case 'wallet':
      return matches(sql`id in (${`night-assets:${id}`},${`night-wallet:${id}`})`);
    case 'records':
      return matches(
        sql`board like 'night-overwatch:%' and (id like ${`night-assets-event:${id}:%`} or id like ${`night-wallet-event:${id}:%`} or id like ${`night-ad-audit:${id}:%`} or (data->>'playerId'=${id} and (data->>'kind'='ranked-run-v1' or board='night-overwatch:history:night-records-v1')))`,
        recordFields,
      );
    case 'results':
      return sql`select jsonb_build_object('matchId',match_id,'board',board,'score',score,'secondary',secondary,'createdAt',created_at) as data,created_at as sort_at,match_id as sort_id from runtime.competition_results where player_id=${id} and board like 'night-overwatch:%'`;
    case 'best':
      return sql`select jsonb_build_object('matchId',match_id,'board',board,'score',score,'secondary',secondary,'updatedAt',updated_at) as data,updated_at as sort_at,board as sort_id from runtime.competition_best where player_id=${id} and board like 'night-overwatch:%'`;
    case 'rooms':
      return sql`select ${project(sql`data`, roomFields)} as data,(data->>'createdAt')::bigint as sort_at,code as sort_id from runtime.competition_rooms where data->>'game'=${game} and data->'players' @> ${JSON.stringify([{ id }])}::jsonb`;
    case 'social':
      return sql`select jsonb_build_object('kind','friendship','playerA',player_a,'playerB',player_b,'requestedBy',requested_by,'accepted',accepted,'createdAt',created_at) as data,created_at as sort_at,'friend:'||player_a::text||player_b::text as sort_id from runtime.night_friendships where player_a=${id} or player_b=${id}
      union all select jsonb_build_object('kind','directRead','peerId',peer_id,'throughSeq',through_seq),0,'read:'||peer_id::text from runtime.night_direct_reads where player_id=${id}
      union all select jsonb_build_object('kind','friendLimit','lastRequest',last_request),last_request,'limit' from runtime.night_friend_limits where player_id=${id}
      union all select jsonb_build_object('kind','duel','board',board,'day',day,'firstPlayer',first_player,'secondPlayer',second_player,'matchId',match_id),day::bigint*86400000,'duel:'||board||':'||day||':'||first_player::text||second_player::text from runtime.competition_duels where board like 'night-overwatch:%' and (first_player=${id} or second_player=${id})`;
    case 'messages':
      return sql`select jsonb_build_object('id',seq::text,'playerId',player_id,'body',body,'room',room,'createdAt',created_at,'removed',removed) as data,seq as sort_at,seq::text as sort_id from runtime.night_chat_messages where player_id=${id}`;
    case 'directMessages':
      return sql`select jsonb_build_object('id',seq::text,'playerId',player_id,'recipientId',recipient_id,'body',body,'room',room,'createdAt',created_at,'removed',removed) as data,seq as sort_at,seq::text as sort_id from runtime.night_direct_messages where player_id=${id} or recipient_id=${id}`;
    case 'reports':
      return sql`select jsonb_build_object('reporterId',reporter_id,'messageId',message_seq::text,'evidence',evidence,'reason',reason,'createdAt',created_at) as data,created_at as sort_at,reporter_id::text||':'||message_seq as sort_id from runtime.night_chat_reports where reporter_id=${id} or evidence->>'player_id'=${id}`;
    case 'presence':
      return sql`select jsonb_build_object('kind','presence','seenAt',seen_at,'activity',activity) as data,seen_at as sort_at,'presence' as sort_id from runtime.night_presence where player_id=${id}
      union all select jsonb_build_object('kind','chatLimit','lastSent',last_sent,'mutedUntil',muted_until),last_sent,'chatLimit' from runtime.night_chat_limits where player_id=${id}`;
  }
}

export function createNightPlayerReader(db: Database, now = Date.now) {
  const read = <T>(work: (tx: Tx) => Promise<T>) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`set transaction isolation level repeatable read, read only`);
      await tx.execute(sql`set local statement_timeout='2500ms'`);
      return work(tx);
    });
  return {
    async list(input: unknown) {
      const q = nightPlayerQuerySchema.parse(input);
      if (q.from) {
        const today = new Date(now() + 8 * 3600000).toISOString().slice(0, 10);
        const oldest = new Date(now() + 8 * 3600000 - 120 * 86400000).toISOString().slice(0, 10);
        if (q.from < oldest || q.to! > today) throw new CompetitionError('INVALID_INPUT', 422);
      }
      const filters = sql`${belongs}
        ${q.nickname ? sql`and position(lower(${q.nickname}) in lower(coalesce(p.display_name,'')))>0` : sql``}
        ${q.shortId ? sql`and left(p.id::text,8)=${q.shortId}` : sql``}
        ${q.from ? sql`and exists(select 1 from jsonb_each(coalesce(w.data->'visits','{}'::jsonb)) v where v.key>=${q.from} and v.key<=${q.to})` : sql``}`;
      return read(async (tx) => ({
        ...(await page(
          tx,
          sql`select to_jsonb(profile) as data,profile."observedTo" as sort_at,profile.id::text as sort_id from (select ${summary} from ${players} where ${filters}) profile`,
          q.page,
        )),
        observation: nightPlayerObservation,
      }));
    },
    async detail(input: unknown) {
      const q = nightPlayerDetailQuerySchema.parse(input);
      return read(async (tx) => {
        const owner = await tx.execute(
          sql`select ${summary},p.profile from ${players} where p.id=${q.id} and ${belongs}`,
        );
        if (!owner[0]) throw new CompetitionError('NOT_FOUND', 404);
        const { profile, ...identity } = owner[0];
        const result = await page(tx, sectionQuery(q.id, q.section), q.page, q.pageSize);
        const response = {
          ...result,
          items: result.items.map(playerBusiness),
          player: identity,
          profile: playerBusiness(profile),
          section: q.section,
          truncated: false,
          truncatedPaths: [],
          coverage: nightPlayerCoverage,
          excluded: nightPlayerExcluded,
          observation: nightPlayerObservation,
        };
        if (Buffer.byteLength(JSON.stringify(response)) > NIGHT_PLAYER_RESPONSE_BYTES)
          throw new CompetitionError('NIGHT_PLAYER_DATA_TOO_LARGE', 413);
        return response;
      });
    },
  };
}
