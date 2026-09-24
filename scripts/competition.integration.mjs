import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { openDatabase } from '@coffeeeeffoc/service-kit';
import { createRuntimeService } from '../services/runtime-api/dist/app.js';
import { createCompetitionStore } from '../services/runtime-api/dist/competition/store.js';
import { getDuelLevel } from '../games/local/cops-robbers/src/duel-levels.js';
import { chooseDuelAction } from '../games/local/cops-robbers/src/duel.js';
import { playerName } from '../platforms/competition/format.js';
const names = [
  { id: 'abcdef01', name: '海湾旅人' },
  { id: 'abcdef02', name: '海湾旅人' },
];
assert.equal(playerName(names[0]), '海湾旅人');
assert.equal(playerName(names[0], names), '海湾旅人 · #ABCDEF01');
assert.notEqual(playerName(names[0], names), playerName(names[1], names));
const databaseUrl = process.env.COMPETITION_TEST_DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).pathname !== '/competition_test')
  throw new Error('Use the isolated competition_test database');
const env = {
  RUNTIME_DATABASE_URL: databaseUrl,
  COMPETITION_ENABLED: 'true',
  COMPETITION_INTERNAL_KEY: 'test-only-competition-internal-key-000000000',
};
const database = openDatabase(databaseUrl, 'runtime');
const store = createCompetitionStore(database.db, new Map());
let app = createRuntimeService(env, false),
  base;
const evidence = { startedAt: new Date().toISOString(), database: 'competition_test', checks: [] };
async function start() {
  await app.listen({ host: '127.0.0.1', port: 0 });
  base = `http://127.0.0.1:${app.server.address().port}/api/competition/v1`;
}
async function request(path, session, body, status = 200) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(session ? { authorization: 'Bearer ' + session.token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  assert.equal(response.status, status, `${path}: ${JSON.stringify(result)}`);
  return result;
}
try {
  await start();
  await request('/me', null, undefined, 401);
  const a = await request('/sessions/guest', null, {}),
    b = await request('/sessions/guest', null, {}),
    outsider = await request('/sessions/guest', null, {});
  assert.notEqual(a.playerId, b.playerId);
  assert.equal((await request('/me', a)).playerId, a.playerId);
  await request('/me', null, { name: '不该生效' }, 401);
  await request('/me', a, { name: '<script>' }, 422);
  await request('/me', a, { name: '字'.repeat(17) }, 422);
  await request('/me', a, { name: '冒用身份', playerId: b.playerId }, 422);
  assert.equal((await request('/me', a, { name: '  海湾旅人  ' })).name, '海湾旅人');
  assert.equal((await request('/me', b, { name: '海湾旅人' })).name, '海湾旅人');
  await request('/me', { token: '0'.repeat(64) }, undefined, 401);
  await request('/rooms', a, { game: 'cops-robbers', mode: 'challenge' }, 422);
  await request('/rooms', a, { game: 'letters-words2', role: 'runner' }, 422);
  await request('/rooms', a, { game: 'cops-robbers', initiative: 'forged' }, 422);
  let room = await request('/rooms', a, {
    game: 'cops-robbers',
    mode: 'survival',
    role: 'runner',
    initiative: 'runner',
  });
  assert.equal(room.players[0].role, 'runner');
  assert.equal(room.initiative, 'runner');
  await database.db.execute(
    sql`update runtime.competition_rooms set data=jsonb_set(data,'{seed}','0'::jsonb) where code=${room.code}`,
  );
  await request('/rooms/join', b, { code: room.code, game: 'letters-words2' }, 409);
  assert.equal((await request(`/rooms/${room.code}`, a)).players.length, 1);
  await request('/rooms/join', a, { code: room.code });
  await request('/rooms/join', b, { code: room.code });
  await request('/rooms/join', outsider, { code: room.code }, 409);
  await request(`/rooms/${room.code}`, outsider, undefined, 403);
  await request(`/rooms/${room.code}/ready`, a, {});
  room = await request(`/rooms/${room.code}/role`, b, { role: 'runner' });
  assert.equal(room.players[0].role, 'pursuer');
  assert.equal(room.players[1].role, 'runner');
  assert(room.players.every((player) => !player.ready));
  assert.equal(room.initiative, 'runner', 'role swap keeps opening role explicit');
  await request(`/rooms/${room.code}/initiative`, b, { initiative: 'pursuer' }, 403);
  await request(`/rooms/${room.code}/ready`, a, {});
  room = await request(`/rooms/${room.code}/ready`, b, {});
  const startedAt = room.startedAt;
  assert.equal(room.status, 'playing');
  assert.equal((await request(`/rooms/${room.code}/ready`, a, {})).startedAt, startedAt);
  await request(
    `/rooms/${room.code}/actions`,
    a,
    { seq: 1, action: { type: 'score', score: 999999 } },
    422,
  );
  await request(
    `/rooms/${room.code}/actions`,
    a,
    { seq: 1, action: { type: 'move', cop: 0, target: 999 } },
    422,
  );
  assert.equal(room.state.role, 'runner');
  assert.equal(room.state.board.side, 'runner');
  await request(`/rooms/${room.code}/role`, a, { role: 'runner' }, 409);
  await request(`/rooms/${room.code}/initiative`, a, { initiative: 'pursuer' }, 409);
  await request(
    `/rooms/${room.code}/actions`,
    a,
    {
      seq: 1,
      action: { type: 'move', side: 'runner', actor: 0, target: room.state.board.robbers[0] },
    },
    422,
  );
  const last = [];
  async function playDuel(code) {
    let snapshot = await request(`/rooms/${code}`, a);
    const level = getDuelLevel(snapshot.mode, snapshot.state.levelId);
    for (let ply = 0; snapshot.status === 'playing' && ply < 250; ply++) {
      const session = snapshot.players[0].role === snapshot.state.board.side ? a : b;
      snapshot = await request(`/rooms/${code}`, session);
      const action = chooseDuelAction(level, snapshot.state.board);
      const body = { seq: snapshot.seq + 1, action };
      snapshot = await request(`/rooms/${code}/actions`, session, body);
      last.push({ session, body });
    }
    assert.equal(snapshot.status, 'finished');
    return snapshot;
  }
  await playDuel(room.code);
  const finalA = await request(`/rooms/${room.code}`, a),
    finalB = await request(`/rooms/${room.code}`, b);
  assert.equal(finalA.status, 'finished');
  assert.deepEqual(finalA.results, finalB.results);
  await Promise.all(
    Array.from({ length: 4 }, () =>
      request(`/rooms/${room.code}/actions`, last.at(-1).session, last.at(-1).body),
    ),
  );
  const counts = await database.db.execute(
    sql`select count(*)::int as n from runtime.competition_results where match_id=${room.code}`,
  );
  assert.equal(counts[0].n, 2);
  evidence.checks.push(
    'real HTTP two identities, join/full/membership, ready idempotence, illegal input, full solution, consistent settlement, duplicate submission once',
  );
  const before = await request('/boards/cops-robbers', a);
  assert([0, 3].includes(before.me.score));
  assert(before.me.rank >= 1);
  assert.equal(before.version, 'roles-initiative-duel-v2');
  await app.close();
  app = createRuntimeService(env, false);
  await start();
  assert.deepEqual((await request('/boards/cops-robbers', a)).me, before.me);
  evidence.checks.push('service restart preserves session, results and personal best');
  async function replay() {
    const previous = await request(`/rooms/${room.code}/rematch`, a, {});
    room = await request(`/rooms/${previous.rematch}`, a);
    await database.db.execute(
      sql`update runtime.competition_rooms set data=jsonb_set(data,'{seed}','0'::jsonb) where code=${room.code}`,
    );
    await request('/rooms/join', b, { code: room.code, game: 'cops-robbers' });
    assert.equal(room.mode, 'survival');
    assert.equal(room.initiative, 'runner');
    await request(`/rooms/${room.code}/initiative`, a, { initiative: 'random' });
    await request(`/rooms/${room.code}/ready`, a, {});
    room = await request(`/rooms/${room.code}/ready`, b, {});
    assert(['pursuer', 'runner'].includes(room.firstRole));
    assert.equal(room.state.board.side, room.firstRole);
    const final = await playDuel(room.code);
    assert(final.results.every((entry) => !entry.rated));
    return (await request('/boards/cops-robbers', a)).me;
  }
  const improved = await replay();
  assert.deepEqual(
    improved,
    before.me,
    'same pair cannot farm points by rematching or changing first side',
  );
  evidence.checks.push(
    'real opposing-side match; role swaps reset readiness; explicit/random initiative is shared; wrong side, non-host initiative, midgame changes rejected; same-pair rematch does not farm rank',
  );
  await request('/me', a, { name: '海湾新名字' });
  const renamed = (await request('/boards/cops-robbers', a)).me;
  assert.equal(renamed.name, '海湾新名字');
  assert.equal(renamed.playerId, a.playerId);
  for (const field of ['score', 'secondary', 'rank']) assert.equal(renamed[field], improved[field]);
  assert.equal((await request('/boards/carding-car', a)).game, 'carding-car');
  const names = (await request(`/rooms/${room.code}`, b)).players;
  assert.equal(names.find((p) => p.id === a.playerId).name, '海湾新名字');
  assert.equal((await request('/me', b)).name, '海湾旅人');
  await app.close();
  app = createRuntimeService(env, false);
  await start();
  assert.equal((await request('/me', a)).name, '海湾新名字');
  evidence.checks.push(
    'persistent non-unique nicknames: input/identity rejection, live room/board names, rename keeps ID/score/rank, service restart preserves name',
  );
  const board = 'test-' + randomUUID(),
    boardV2 = board + '-v2',
    ids = Array.from({ length: 102 }, () => randomUUID());
  assert.equal((await store.ranking(board, ids[0])).eligiblePlayers, 0);
  await database.db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx.execute(
        sql`insert into runtime.competition_players(id,created_at) values(${ids[i]},${Date.now()})`,
      );
      await tx.execute(
        sql`insert into runtime.competition_best values(${board},${ids[i]},${1000 - i},${i === 1 ? 1 : 0},${'fixture-' + i},${Date.now()})`,
      );
    }
  });
  const outside = await store.ranking(board, ids[100]);
  assert.equal((await store.ranking(board, ids[0])).gap, null);
  assert.equal(outside.top.length, 100);
  assert.equal(outside.me.rank, 101);
  assert.equal(outside.eligiblePlayers, 102);
  assert.equal(outside.threshold.rank, 100);
  assert.equal(outside.previous.rank, 100);
  assert.equal(outside.gap.score, 1);
  assert.equal((await store.ranking(boardV2, ids[100])).me, null);
  await database.db.execute(
    sql`update runtime.competition_best set score=1000,secondary=0 where board=${board} and player_id=${ids[1]}`,
  );
  const tied = await store.ranking(board, ids[1]);
  assert.equal(tied.me.rank, 1);
  assert.equal(tied.top[2].rank, 3);
  assert.equal(tied.gap, null);
  assert.equal((await store.ranking(board, outsider.playerId)).reason, '尚无有效成绩');
  evidence.checks.push(
    '102 isolated SQL fixtures: Top100 boundary, rank101, tied rank1/1/3, exact count, previous/gap, empty/no-score/version isolation',
  );
  let street = await request('/rooms', a, {
    game: 'cops-robbers-realtime',
    mode: 'classic',
    role: 'runner',
    initiative: 'runner',
  });
  await database.db.execute(
    sql`update runtime.competition_rooms set data=jsonb_set(data,'{seed}','0'::jsonb) where code=${street.code}`,
  );
  await request('/rooms/join', b, { code: street.code, game: 'cops-robbers-realtime' });
  await request(`/rooms/${street.code}/ready`, b, {});
  street = await request(`/rooms/${street.code}/ready`, a, {});
  assert.equal(street.state.role, 'runner');
  assert.equal(street.firstRole, 'runner');
  assert.equal(street.state.firstRole, 'runner');
  const initialStreet = structuredClone(street.state);
  const adjacentPoint = (state, actor) => {
    const nearest = state.map.nodes
      .map((node, id) => ({ id, d: Math.hypot(node.x - actor.x, node.y - actor.y) }))
      .sort((a, b) => a.d - b.d)[0].id;
    const edge = state.map.edges.find((edge) => edge.includes(nearest));
    return state.map.nodes[edge.find((node) => node !== nearest)];
  };
  await request(
    `/rooms/${street.code}/actions`,
    b,
    { seq: 1, action: { type: 'hold', actor: 0 } },
    422,
  );
  await request(
    `/rooms/${street.code}/actions`,
    a,
    { seq: 1, action: { type: 'move', actor: 999, x: 10, y: 10 } },
    422,
  );
  await request(
    `/rooms/${street.code}/actions`,
    a,
    { seq: 1, action: { type: 'move', actor: 0, x: NaN, y: 10 } },
    422,
  );
  await request(
    `/rooms/${street.code}/actions`,
    a,
    { seq: 1, action: { type: 'hold', actor: 0, role: 'pursuer' } },
    422,
  );
  const destination = adjacentPoint(street.state, street.state.robbers[0]);
  street = await request(`/rooms/${street.code}/actions`, a, {
    seq: 1,
    action: { type: 'move', actor: 0, x: destination.x, y: destination.y },
  });
  await new Promise((resolve) => setTimeout(resolve, 2100));
  street = await request(`/rooms/${street.code}`, a);
  assert(
    Math.hypot(
      street.state.robbers[0].x - initialStreet.robbers[0].x,
      street.state.robbers[0].y - initialStreet.robbers[0].y,
    ) > 1,
    'runner receives real server-simulated opening movement',
  );
  assert.deepEqual(
    street.state.cops.map(({ x, y }) => ({ x, y })),
    initialStreet.cops.map(({ x, y }) => ({ x, y })),
    'other side remains stationary during opening',
  );
  assert.equal(street.state.openingRemainingMs, 0);
  const pursuerView = await request(`/rooms/${street.code}`, b);
  assert.equal(pursuerView.state.role, 'pursuer');
  const chaseTarget = adjacentPoint(pursuerView.state, pursuerView.state.cops[0]);
  await request(`/rooms/${street.code}/actions`, b, {
    seq: 1,
    action: { type: 'move', actor: 0, x: chaseTarget.x, y: chaseTarget.y },
  });
  // Isolated-database clock fixture tests expiry without waiting two minutes; positions/outcome still run through the real simulator.
  await database.db.execute(
    sql`update runtime.competition_rooms set data=jsonb_set(data,'{startedAt}',to_jsonb(${Date.now() - 121000}::bigint)) where code=${street.code}`,
  );
  const streetA = await request(`/rooms/${street.code}`, a),
    streetB = await request(`/rooms/${street.code}`, b);
  assert.equal(streetA.status, 'finished');
  assert.deepEqual(streetA.results, streetB.results);
  assert.equal(streetA.players[0].result.score, 3);
  assert.equal(streetA.players[1].result.score, 0);
  assert(streetA.results.every((entry) => entry.rated && entry.result.eligible));
  assert.equal(
    (await request('/boards/cops-robbers-realtime', a)).version,
    'street-roles-initiative-v2',
  );
  const streetRows = await database.db.execute(
    sql`select count(*)::int as n from runtime.competition_results where match_id=${street.code}`,
  );
  assert.equal(streetRows[0].n, 2);
  const escapeRoom = await request('/rooms', a, {
    game: 'cops-robbers-realtime',
    mode: 'escape',
    role: 'pursuer',
    initiative: 'pursuer',
  });
  await request('/rooms/join', b, { code: escapeRoom.code });
  await request(`/rooms/${escapeRoom.code}/ready`, b, {});
  const escapeStart = await request(`/rooms/${escapeRoom.code}/ready`, a, {});
  assert.equal(escapeStart.mode, 'escape');
  assert(escapeStart.state.exits.length > 0);
  assert.equal(escapeStart.state.role, 'pursuer');
  await request(`/rooms/${escapeRoom.code}/leave`, a, {});
  evidence.checks.push(
    'realtime HTTP two-client role authority, human movement, real 2-second opening freeze, illegal actor/side/forged commands, shared state, simulator timeout via isolated clock fixture, consistent one-time settlement and both friend modes',
  );
  const created = await request('/rooms', a, { game: 'cops-robbers' });
  await database.db.execute(
    sql`update runtime.competition_rooms set data=jsonb_set(data,'{deadline}',to_jsonb(${Date.now() - 1}::bigint)) where code=${created.code}`,
  );
  assert.equal((await request(`/rooms/${created.code}`, a)).status, 'expired');
  await request('/rooms/join', b, { code: created.code }, 409);
  evidence.checks.push('expired invitations rejected');
  const measurements = [];
  for (let n = 0; n < 20; n++) {
    const began = performance.now();
    await store.ranking(board, ids[100]);
    measurements.push(performance.now() - began);
  }
  measurements.sort((a, b) => a - b);
  evidence.rankingLatencyMs = {
    p50: measurements[10],
    p95: measurements[18],
    participants: 102,
    requests: 20,
  };
  evidence.completedAt = new Date().toISOString();
  await mkdir(new URL('../.scratch/competition/', import.meta.url), { recursive: true });
  await writeFile(
    new URL('../.scratch/competition/integration.json', import.meta.url),
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await app.close();
  await database.close();
}
