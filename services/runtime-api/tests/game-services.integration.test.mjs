import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { sql } from 'drizzle-orm';
import { openDatabase } from '@coffeeeeffoc/service-kit';
import { expect, it } from 'vitest';
import { createCompetitionStore } from '../src/competition/store.js';
import { createRankedStore } from '../src/competition/ranked-store.js';
import { registerCompetition } from '../src/competition/routes.js';
import { rankedRules } from '../rules/ranked-games.mjs';

const databaseUrl = process.env.COMPETITION_TEST_DATABASE_URL;
const integration = databaseUrl ? it : it.skip;
const norm = (angle) => ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
function towerTrace(rule, seed, mode) {
  const state = rule.create(mode, seed, mode === 'campaign' ? 'first-brake' : undefined);
  const frames = [];
  for (let tick = 0; tick < 20000 && state.game.status === 'playing'; tick++) {
    const layer = state.game.level.layers[state.game.nextLayer];
    const arc = mode === 'endless' && state.game.totalFloors >= 3 ? layer.danger[0] : layer.gap;
    if (arc) {
      const center = norm(arc.start + norm(arc.end - arc.start) / 2);
      const frame = { ticks: 0, input: { rotation: Math.PI / 2 - center - state.game.rotation } };
      frames.push(frame);
      rule.apply(state, [frame]);
    }
    const frame = { ticks: 1, input: {} };
    frames.push(frame);
    rule.apply(state, [frame]);
  }
  expect(rule.result(state).eligible).toBe(true);
  return { frames, result: rule.result(state) };
}

integration(
  'real HTTP/PostgreSQL game gateway restores checkpoints and isolates owners, games, boards and idempotent settlement',
  async () => {
    if (!databaseUrl || new URL(databaseUrl).pathname !== '/competition_test')
      throw new Error('Use isolated competition_test');
    const database = openDatabase(databaseUrl, 'runtime');
    let time = Date.now(),
      app,
      base;
    const now = () => time;
    const version = 'test-' + randomUUID();
    const rules = new Map(rankedRules.map((rule) => [rule.id, { ...rule, version }]));
    const duel = (id) => ({
      id,
      title: id,
      version: 'v1',
      durationMs: 10000,
      initial: () => ({}),
      view: () => ({}),
      action: (state) => state,
      result: () => ({ finished: false, eligible: false, score: 0, secondary: 0 }),
    });
    const competition = createCompetitionStore(
      database.db,
      new Map(['duel-a', 'duel-b'].map((id) => [id, duel(id)])),
      now,
    );
    const credentials = [],
      rooms = [];
    async function start() {
      app = Fastify();
      await registerCompetition(
        app,
        competition,
        {},
        undefined,
        undefined,
        createRankedStore(database.db, rules, competition.identityDetails, now),
      );
      await app.listen({ host: '127.0.0.1', port: 0 });
      base = `http://127.0.0.1:${app.server.address().port}/api/competition/v1`;
    }
    async function request(path, credential, body, expected = 200) {
      const response = await fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'content-type': 'application/json',
          ...(credential ? { authorization: 'Bearer ' + credential.token } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await response.json();
      expect(response.status, JSON.stringify(data)).toBe(expected);
      return data;
    }
    async function create(player, game, board, levelId) {
      const run = await request(`/games/${game}/runs`, player, {
        board,
        ...(levelId ? { levelId } : {}),
      });
      return run;
    }
    async function upload(player, game, run, frames, restart = false) {
      let seq = 0;
      for (let offset = 0; offset < frames.length; offset += 500) {
        const batch = frames.slice(offset, offset + 500);
        time += Math.ceil((batch.reduce((sum, frame) => sum + frame.ticks, 0) * 1000) / 120);
        const input = { seq: ++seq, frames: batch };
        const path = `/games/${game}/runs/${run.id}/actions`;
        const response = await request(path, player, input);
        expect(await request(path, player, input)).toEqual(response);
        if (restart && offset === 0) {
          await app.close();
          await start();
          expect((await request(`/games/${game}/runs/${run.id}`, player)).seq).toBe(seq);
          expect(await request(path, player, input)).toEqual(response);
        }
      }
      return seq;
    }
    try {
      await start();
      const a = await request('/sessions/guest', null, {}),
        b = await request('/sessions/guest', null, {});
      const native = await competition.session('wechat', version, randomUUID());
      credentials.push(a, b, native);
      expect((await request('/games/tower-brake')).identity.kind).toBe('anonymous');
      expect((await request('/games/tower-brake', a)).identity).toMatchObject({
        kind: 'guest',
        authenticated: false,
      });
      expect((await request('/games/tower-brake', native)).identity).toMatchObject({
        kind: 'platform',
        authenticated: true,
        provider: 'wechat',
      });
      const run = await create(a, 'tower-brake', 'campaign', 'first-brake');
      await request(`/games/tower-brake/runs/${run.id}`, b, undefined, 403);
      await request(`/games/cage-rescue/runs/${run.id}`, a, undefined, 409);
      const trace = towerTrace(rules.get('tower-brake'), run.seed, 'campaign');
      const seq = await upload(a, 'tower-brake', run, trace.frames, true);
      const path = `/games/tower-brake/runs/${run.id}/finish`;
      const [first, duplicate] = await Promise.all([
        request(path, a, { seq }),
        request(path, a, { seq }),
      ]);
      expect(duplicate).toEqual(first);
      expect(first).toMatchObject({ ...trace.result, accepted: true });
      const counts = await database.db.execute(
        sql`select count(*)::int as count from runtime.competition_results where match_id=${`ranked-result:${run.id}:campaign`}`,
      );
      expect(counts[0].count).toBe(1);
      const other = await create(b, 'tower-brake', 'campaign', 'first-brake');
      const secondSeq = await upload(b, 'tower-brake', other, trace.frames);
      await request(`/games/tower-brake/runs/${other.id}/finish`, b, { seq: secondSeq });
      const publicBoard = await request('/games/tower-brake/leaderboards/campaign');
      expect(publicBoard.me).toBeNull();
      expect(publicBoard.top.map((row) => row.rank)).toEqual([1, 1]);
      expect((await request('/games/tower-brake/leaderboards/campaign', a)).me.playerId).toBe(
        a.playerId,
      );
      expect((await request('/games/cage-rescue/leaderboards/campaign', a)).top).toHaveLength(0);
      expect((await request('/games/tower-brake/leaderboards/endless', a)).top).toHaveLength(0);
      const endless = await create(a, 'tower-brake', 'endless');
      const endlessTrace = towerTrace(rules.get('tower-brake'), endless.seed, 'endless');
      const endlessSeq = await upload(a, 'tower-brake', endless, endlessTrace.frames);
      expect(
        (await request(`/games/tower-brake/runs/${endless.id}/finish`, a, { seq: endlessSeq }))
          .score,
      ).toBe(endlessTrace.result.score);
      const rescue = await create(a, 'cage-rescue', 'endless');
      time += 1000;
      const frame = {
        seq: 1,
        frames: [
          { ticks: 0, input: { launch: true } },
          { ticks: 100, input: { targetX: -500 } },
        ],
      };
      await request(`/games/cage-rescue/runs/${rescue.id}/actions`, a, frame);
      await request(
        `/games/cage-rescue/runs/${rescue.id}/actions`,
        a,
        { seq: 2, frames: [{ ticks: 0, input: { revive: true } }] },
        422,
      );
      expect(
        (await request(`/games/cage-rescue/runs/${rescue.id}/finish`, a, { seq: 1 })).accepted,
      ).toBe(false);
      const room = await request('/games/duel-a/rooms', a, {});
      rooms.push(room.code);
      await request(`/games/duel-b/rooms/${room.code}`, a, undefined, 409);
      await request(`/games/duel-b/rooms/${room.code}/leave`, a, {}, 409);
      expect((await request(`/games/duel-a/rooms/${room.code}`, a)).status).toBe('waiting');
    } finally {
      await app?.close();
      // Match receipts are append-only for runtime_app; unique test versions isolate retained audit rows.
      for (const code of rooms)
        await database.db.execute(sql`delete from runtime.competition_rooms where code=${code}`);
      for (const { playerId } of credentials) {
        await database.db.execute(
          sql`delete from runtime.competition_results where player_id=${playerId}`,
        );
        await database.db.execute(
          sql`delete from runtime.competition_best where player_id=${playerId}`,
        );
        await database.db.execute(
          sql`delete from runtime.competition_sessions where player_id=${playerId}`,
        );
        await database.db.execute(
          sql`delete from runtime.competition_players where id=${playerId}`,
        );
      }
      await database.close();
    }
  },
  30000,
);
