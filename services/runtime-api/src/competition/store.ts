import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { CompetitionError, type Room, type Rule } from './types.js';

type Database = ReturnType<typeof openDatabase>['db'];
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const json = (value: unknown) => JSON.stringify(value);
const boardOf = (rule: Rule) => `${rule.id}:${rule.version}`;

export function createCompetitionStore(db: Database, rules: Map<string, Rule>, now = Date.now) {
  async function identity(token: string) {
    const rows = await db.execute(sql`select player_id from runtime.competition_sessions where token_hash=${hash(token)} and expires_at>${now()}`);
    if (!rows[0]) throw new CompetitionError('SESSION_EXPIRED', 401);
    return String(rows[0].player_id);
  }
  async function session(platform = 'guest', appId = '', subject?: string) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = now() + 180 * 86400_000;
    return db.transaction(async tx => {
      const rows = await tx.execute(sql`insert into runtime.competition_players(id,platform,app_id,subject,created_at)
        values(${randomUUID()},${platform},${appId},${subject ?? null},${now()})
        on conflict(platform,app_id,subject) do update set subject=excluded.subject returning id`);
      const playerId = String(rows[0]!.id);
      await tx.execute(sql`insert into runtime.competition_sessions values(${hash(token)},${playerId},${expiresAt})`);
      return { playerId, token, expiresAt };
    });
  }
  function ruleFor(game: string) {
    const rule = rules.get(game);
    if (!rule) throw new CompetitionError('GAME_UNAVAILABLE', 404);
    return rule;
  }
  async function ranking(board: string, playerId: string, executor: Database | Tx = db) {
    const rows = await executor.execute(sql`with ranked as (
      select player_id as "playerId", score, secondary,
      rank() over(order by score desc,secondary asc)::int as rank,
      row_number() over(order by score desc,secondary asc,player_id)::int as position,
      count(*) over()::int as total from runtime.competition_best where board=${board}
    ) select * from ranked where position<=100 or "playerId"=${playerId}
      or position=(select max(position) from ranked where rank<(select rank from ranked where "playerId"=${playerId})) order by position`);
    const top = rows.filter(row => Number(row.position) <= 100);
    const me = rows.find(row => row.playerId === playerId) ?? null;
    const previous = me ? rows.filter(row => Number(row.rank) < Number(me.rank)).at(-1) ?? null : null;
    const threshold = top.length === 100 ? top[99] : null;
    const target = previous ?? (me && Number(me.rank) > 1 && Number(me.position) > 100 ? threshold : null);
    const gap = me && target ? { score: Number(target.score) - Number(me.score), secondary: Number(me.secondary) - Number(target.secondary) } : null;
    return { board, top, me, previous, threshold, gap, eligiblePlayers: Number(rows[0]?.total ?? 0), reason: me ? null : '尚无有效成绩' };
  }
  async function record(tx: Tx, matchId: string, board: string, playerId: string, score: number, secondary: number) {
    if (!Number.isFinite(score) || !Number.isFinite(secondary) || secondary < 0) throw new CompetitionError('INVALID_RESULT');
    const inserted = await tx.execute(sql`insert into runtime.competition_results values(${matchId},${board},${playerId},${score},${secondary},${now()})
      on conflict do nothing returning player_id`);
    if (!inserted.length) return;
    await tx.execute(sql`insert into runtime.competition_best values(${board},${playerId},${score},${secondary},${matchId},${now()})
      on conflict(board,player_id) do update set score=excluded.score,secondary=excluded.secondary,match_id=excluded.match_id,updated_at=excluded.updated_at
      where (excluded.score > runtime.competition_best.score) or
        (excluded.score=runtime.competition_best.score and excluded.secondary<runtime.competition_best.secondary)`);
  }
  async function create(playerId: string, game: string, executor: Database | Tx = db) {
    const rule = ruleFor(game);
    const room: Room = { code: randomBytes(6).toString('hex').toUpperCase(), game, version: rule.version,
      status: 'waiting', seed: randomInt(0x7fffffff), players: [{id: playerId, ready: false, seq: 0, state: null}],
      createdAt: now(), deadline: now() + 15 * 60_000 };
    await executor.execute(sql`insert into runtime.competition_rooms values(${room.code},${json(room)}::jsonb,${room.deadline})`);
    return room;
  }
  function view(room: Room, playerId: string) {
    const rule = ruleFor(room.game);
    const seat = room.players.findIndex(p => p.id === playerId);
    if (seat < 0) throw new CompetitionError('NOT_A_MEMBER', 403);
    const member = room.players[seat]!;
    return { code: room.code, game: room.game, version: room.version, status: room.status,
      you: seat, players: room.players.map(({id,ready,result}) => ({id,ready,result})),
      seq: member.seq, startedAt: room.startedAt, deadline: room.deadline, serverNow: now(), pollMs: rule.pollMs ?? 1200,
      state: member.state === null ? null : rule.view(rule.duel ? room.players[0]!.state : member.state, seat),
      opponent: room.players[1-seat]?.result ?? null, results: room.results ?? null, rematch: room.rematch };
  }
  async function finish(room: Room, tx: Tx, timedOut = false) {
    if (room.status !== 'playing') return;
    const rule = ruleFor(room.game);
    for (const [seat, member] of room.players.entries()) {
      member.result = rule.result(rule.duel ? room.players[0]!.state : member.state, seat);
    }
    if (!timedOut && !room.players.every(p => p.result?.finished)) return;
    room.status = 'finished';
    // ponytail: serialize settlements per board; use narrower rating locks if measured contention grows.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${boardOf(rule)}))`);
    let rated = true;
    if (rule.duel) {
      const ids=room.players.map(p=>p.id).sort();
      if(room.players.every(p=>p.result?.eligible)) {
        const recorded=await tx.execute(sql`insert into runtime.competition_duels values(${boardOf(rule)},${Math.floor(now()/86400000)},${ids[0]},${ids[1]},${room.code}) on conflict do nothing returning match_id`);
        rated=recorded.length>0;
      } else rated=false;
    }
    for (const player of room.players) {
      const result = player.result!;
      if (result.finished && result.eligible && rated) {
        const previous=rule.duel?(await ranking(boardOf(rule),player.id,tx)).me:null;
        await record(tx, room.code, boardOf(rule), player.id, result.score+Number(previous?.score ?? 0), rule.duel?0:result.secondary);
      }
    }
    await tx.execute(sql`insert into runtime.competition_matches values(${room.code},${boardOf(rule)},${json({players:room.players.map(p=>({id:p.id,result:p.result})),rated,timedOut})}::jsonb,${now()}) on conflict do nothing`);
    room.results = await Promise.all(room.players.map(async player => ({
      playerId: player.id, result: player.result, before: player.before ?? null,
      rated, reason: rated ? null : room.players.every(p=>p.result?.eligible) ? '同一对玩家今天已计分，本局仅好友对战' : '本局未满足有效成绩条件',
      after: await ranking(boardOf(rule), player.id, tx),
    })));
  }
  async function roomAction(playerId: string, code: string, operation: string, input: {seq?: number; action?: unknown; game?: string} = {}) {
    return db.transaction(async tx => {
      const rows = await tx.execute(sql`select data from runtime.competition_rooms where code=${code} for update`);
      if (!rows[0]) throw new CompetitionError('INVITATION_NOT_FOUND', 404);
      const room = rows[0].data as Room;
      if(operation==='join' && input.game && room.game!==input.game) throw new CompetitionError('WRONG_GAME',409);
      const rule = ruleFor(room.game);
      if (room.version !== rule.version) throw new CompetitionError('RULE_VERSION_CHANGED');
      if (room.status === 'playing' && rule.advance) {
        for (const player of (rule.duel ? room.players.slice(0,1) : room.players)) player.state = rule.advance(player.state, Math.min(rule.durationMs,now()-room.startedAt!)) ?? player.state;
        await finish(room,tx);
      }
      if (now() >= room.deadline && room.status === 'waiting') room.status = 'expired';
      if (room.status === 'playing' && now() >= room.deadline) {
        if (!rule.duel) for (const player of room.players) {
          if (rule.result(player.state).finished) continue;
          try { player.state = rule.action(player.state, {type:'finish'}, rule.durationMs) ?? player.state; }
          catch { /* This ruleset treats unfinished attempts as ineligible. */ }
        }
        await finish(room, tx, true);
      }
      let member = room.players.find(p => p.id === playerId);
      if (operation === 'join' && !member) {
        if (room.status !== 'waiting') throw new CompetitionError('INVITATION_EXPIRED');
        if (room.players.length === 2) throw new CompetitionError('ROOM_FULL');
        member = { id: playerId, ready: false, seq: 0, state: null };
        room.players.push(member);
      }
      if (!member) throw new CompetitionError('NOT_A_MEMBER', 403);
      if (operation === 'ready') {
        if (room.status !== 'waiting' && room.status !== 'playing') throw new CompetitionError('MATCH_CLOSED');
        if (room.status === 'waiting') {
          member.ready = true;
          if (room.players.length === 2 && room.players.every(p => p.ready)) {
            room.status = 'playing'; room.startedAt = now(); room.deadline = now() + rule.durationMs;
            for (const player of room.players) {
              player.state = rule.initial(room.seed);
              player.before = (await ranking(boardOf(rule), player.id, tx)).me;
            }
          }
        }
      } else if (operation === 'actions') {
        const existing = await tx.execute(sql`select action_hash from runtime.competition_actions where room_code=${code} and player_id=${playerId} and seq=${input.seq}`);
        const actionHash = hash(json(input.action));
        if (existing.length) {
          if (existing[0]!.action_hash !== actionHash) throw new CompetitionError('SEQUENCE_CONFLICT');
        } else {
          if (room.status !== 'playing') throw new CompetitionError('MATCH_CLOSED');
          if (input.seq !== member.seq+1) throw new CompetitionError('SEQUENCE_CONFLICT');
          const seat = room.players.indexOf(member);
          const owner = rule.duel ? room.players[0]! : member;
          if (rule.result(owner.state, seat).finished) throw new CompetitionError('PLAYER_FINISHED');
          try { owner.state = rule.action(owner.state, input.action, now() - room.startedAt!, seat) ?? owner.state; }
          catch { throw new CompetitionError('ILLEGAL_ACTION', 422); }
          member.seq = input.seq;
          await tx.execute(sql`insert into runtime.competition_actions values(${code},${playerId},${input.seq},${actionHash},${now()})`);
          await finish(room, tx);
        }
      } else if (operation === 'leave') {
        if (room.status === 'waiting' || room.status === 'playing') room.status = 'abandoned';
      } else if (operation === 'rematch') {
        if (!['finished','abandoned','expired'].includes(room.status)) throw new CompetitionError('MATCH_NOT_FINISHED');
        if (!room.rematch) room.rematch = (await create(playerId, room.game, tx)).code;
      }
      await tx.execute(sql`update runtime.competition_rooms set data=${json(room)}::jsonb,expires_at=${room.deadline} where code=${code}`);
      return view(room, playerId);
    });
  }
  return { identity, session, ranking, ruleFor, roomAction,
    async create(playerId: string, game: string) { return view(await create(playerId,game),playerId); },
    async board(game: string, playerId: string) {
      const rule = game === 'carding-car' ? { id: game, title: '浪湾卡丁车', version: 'seaside-v1', description: '海湾三圈，双人、固定车辆及种子；合法完赛用时越短越好。' } : ruleFor(game);
      const board = game === 'carding-car' ? 'carding-car-seaside-v1' : `${rule.id}:${rule.version}`;
      return {game,title:rule.title,version:rule.version,description:rule.description,rules:rule.description,...await ranking(board,playerId)};
    },
    async kartResults(input: {matchId:string;board:string;entries:{playerId:string;elapsedMs:number}[];startedAt:number;finishedAt:number}) {
      if (input.board !== 'carding-car-seaside-v1' || input.finishedAt < input.startedAt || input.finishedAt > now()+10_000)
        throw new CompetitionError('INVALID_RESULT',422);
      return db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.matchId}))`);
        const existing=await tx.execute(sql`select data from runtime.competition_matches where id=${input.matchId}`);
        if(existing.length && json(existing[0]!.data)!==json(input)) {
          // JSONB key order differs; compare canonical payload fields rather than serialization order.
          const prior=existing[0]!.data as typeof input;
          if(prior.board!==input.board || prior.startedAt!==input.startedAt || prior.finishedAt!==input.finishedAt ||
            json(prior.entries.map(e=>[e.playerId,e.elapsedMs]).sort())!==json(input.entries.map(e=>[e.playerId,e.elapsedMs]).sort())) throw new CompetitionError('SETTLEMENT_CONFLICT');
        }
        await tx.execute(sql`insert into runtime.competition_matches values(${input.matchId},${input.board},${json(input)}::jsonb,${now()}) on conflict do nothing`);
        for (const entry of input.entries) {
          if (entry.elapsedMs < 1000 || entry.elapsedMs > input.finishedAt-input.startedAt+1000) throw new CompetitionError('INVALID_RESULT',422);
          await record(tx,input.matchId,input.board,entry.playerId,-entry.elapsedMs,0);
        }
        return {accepted:true,rankings:await Promise.all(input.entries.map(e=>ranking(input.board,e.playerId,tx)))};
      });
    },
  };
}
