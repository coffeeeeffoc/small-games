import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { sql } from 'drizzle-orm';
import { openDatabase } from '@coffeeeeffoc/service-kit';
import { expect, it } from 'vitest';
import { registerCompetition } from '../src/competition/routes.js';
import { createCompetitionStore } from '../src/competition/store.js';
import { createThreeChooseTwoStore } from '../src/three-choose-two/store.js';
import type { Engine, EngineState, Placement } from '../src/three-choose-two/types.js';

const databaseUrl = process.env.THREE_CHOOSE_TWO_TEST_DATABASE_URL;
const integration = databaseUrl ? it : it.skip;
integration(
  'replays real PostgreSQL ranked sessions, restores confirmations, ranks ties and excludes unverified identities',
  async () => {
    if (!databaseUrl || new URL(databaseUrl).pathname !== '/competition_test')
      throw new Error('Use the isolated competition_test database');
    const moduleName = '@coffeeeeffoc/three-choose-two/engine';
    const engine = (await import(moduleName)) as Engine;
    const database = openDatabase(databaseUrl, 'runtime');
    let time = Date.now();
    const now = () => time;
    const identities = createCompetitionStore(database.db, new Map(), now);
    const ranked = createThreeChooseTwoStore(database.db, engine, now);
    const app = Fastify();
    const key = 'test-only-three-choose-two-internal-000000';
    await registerCompetition(app, identities, { COMPETITION_INTERNAL_KEY: key }, ranked);
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test HTTP address');
    const prefix = `http://127.0.0.1:${address.port}/api/competition/v1/three-choose-two`;
    const credentials: { playerId: string; token: string; expiresAt: number }[] = [];
    const native = async () => {
      const credential = await identities.session('wechat', `test-${randomUUID()}`, randomUUID());
      credentials.push(credential);
      return credential;
    };
    type Credential = Awaited<ReturnType<typeof native>>;
    async function request(path: string, credential: Credential, body?: unknown, expected = 200) {
      const response = await fetch(prefix + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          authorization: `Bearer ${credential.token}`,
          'content-type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      expect(response.status, text).toBe(expected);
      return JSON.parse(text);
    }
    function legal(state: EngineState): Omit<Placement, 'seq' | 'group'> {
      for (let slot = 0; slot < 3; slot++)
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++)
            if (engine.place(state, slot, x, y) !== state) return { slot, x, y };
      throw new Error('Fixture has no legal placement');
    }
    try {
      const a = await native(),
        b = await native(),
        c = await native();
      const guest = await identities.session();
      credentials.push(guest);
      const [first, resumed] = await Promise.all([
        request('/session', a, {}),
        request('/session', a, {}),
      ]);
      expect(resumed.id).toBe(first.id);
      expect(first.state.mode).toBe('endless');
      expect(first.eligible).toBe(true);
      expect(JSON.stringify(first)).not.toMatch(/"(?:seed|rng|_undo|sequence)"/);
      expect(first.state.candidates).toHaveLength(3);
      await request(`/session/${first.id}`, b, undefined, 403);
      await request(`/session/${first.id}/finish`, b, {}, 403);
      const rows = await database.db.execute(
        sql`select data from runtime.three_choose_two_sessions where id=${first.id}`,
      );
      const state = (rows[0]!.data as { state: EngineState }).state;
      const input = { seq: 1, group: 1, ...legal(state) };
      await request(`/session/${first.id}/actions`, a, { ...input, score: 999999 }, 422);
      await request(`/session/${first.id}/actions`, a, { ...input, seq: 2 }, 409);
      const [placed, duplicate] = await Promise.all([
        request(`/session/${first.id}/actions`, a, input),
        request(`/session/${first.id}/actions`, a, input),
      ]);
      expect(placed.state).toEqual(duplicate.state);
      expect(placed.seq).toBe(1);
      const restored = await request(`/session/${first.id}`, a);
      expect(restored.state).toEqual(placed.state);
      expect(restored.seq).toBe(1);
      await request(`/session/${first.id}/actions`, a, { ...input, x: (input.x + 1) % 8 }, 409);
      await request(`/session/${first.id}/actions`, a, { ...input, seq: 2 }, 422);
      await request(`/session/${first.id}/actions`, a, { ...input, seq: 2, group: 2 }, 409);
      const terminal = await request(`/session/${first.id}/finish`, a, {});
      const repeated = await request(`/session/${first.id}/finish`, a, {});
      expect(repeated.settlement).toEqual(terminal.settlement);
      expect(terminal.settlement.status).toBe('verified');
      expect(terminal.state.score).toBe(
        engine.finishEndless(engine.place(state, input.slot, input.x, input.y)).score,
      );
      const afterFinish = await request(`/session/${first.id}/actions`, a, { ...input, seq: 2 });
      expect(afterFinish.status).toBe('finished');
      expect(afterFinish.seq).toBe(1);
      const counts = await database.db.execute(
        sql`select (select count(*) from runtime.three_choose_two_results where session_id=${first.id}) as results,(select count(*) from runtime.three_choose_two_actions where session_id=${first.id}) as actions`,
      );
      expect(Number(counts[0]!.results)).toBe(1);
      expect(Number(counts[0]!.actions)).toBe(1);
      const next = await request('/session', a, {});
      expect(next.id).not.toBe(first.id);
      const confirmedInput = { seq: 1, group: 1, ...legal(next.state) };
      const confirmed = await request(`/session/${next.id}/actions`, a, confirmedInput);
      // Pin only this test's private server seed, then send every move through the real HTTP path.
      const clearGame = await request('/session', c, {});
      const testSeed = '20261007'.padStart(64, '0');
      let scoringState = engine.createEndless(testSeed, { ranked: true });
      const storedClear = await database.db.execute(
        sql`select data from runtime.three_choose_two_sessions where id=${clearGame.id}`,
      );
      const clearData = {
        ...(storedClear[0]!.data as Record<string, unknown>),
        seed: testSeed,
        state: scoringState,
      };
      await database.db.execute(
        sql`update runtime.three_choose_two_sessions set data=${JSON.stringify(clearData)}::jsonb where id=${clearGame.id}`,
      );
      let clearSeq = 0;
      while (scoringState.score < 500 && scoringState.status === 'playing' && clearSeq < 100) {
        let best: { slot: number; x: number; y: number; state: EngineState } | null = null;
        let bestValue = -Infinity;
        for (let slot = 0; slot < 3; slot++)
          for (let y = 0; y < 8; y++)
            for (let x = 0; x < 8; x++) {
              const placed = engine.place(scoringState, slot, x, y);
              if (placed === scoringState) continue;
              let value = (placed.score - scoringState.score) * 1000;
              for (let line = 0; line < 8; line++) {
                let row = 0,
                  col = 0;
                for (let i = 0; i < 8; i++) {
                  row += Number(!!placed.board[line * 8 + i]);
                  col += Number(!!placed.board[i * 8 + line]);
                }
                value += row ** 3 + col ** 3;
              }
              if (placed.status === 'lost') value -= 1_000_000;
              if (value > bestValue) {
                bestValue = value;
                best = { slot, x, y, state: placed };
              }
            }
        if (!best) throw new Error('Scoring fixture became unreachable');
        const clearAction = {
          seq: ++clearSeq,
          group: scoringState.group,
          slot: best.slot,
          x: best.x,
          y: best.y,
        };
        const clearResponse = await request(`/session/${clearGame.id}/actions`, c, clearAction);
        scoringState = best.state;
        expect(clearResponse.state.score).toBe(scoringState.score);
        expect(clearResponse.state.stats).toEqual(scoringState.stats);
      }
      expect(scoringState.score).toBeGreaterThanOrEqual(500);
      const scored = await request(`/session/${clearGame.id}/finish`, c, {});
      expect(scored.settlement.status).toBe('verified');
      expect(scored.settlement.score).toBe(scoringState.score);
      const lowerGame = await request('/session', c, {});
      const lower = await request(`/session/${lowerGame.id}/finish`, c, {});
      expect(lower.settlement.isPersonalBest).toBe(false);
      expect(lower.settlement.personalBest).toBe(scoringState.score);
      expect((await request('/board', c)).me.achievedAt).toBe(scored.settlement.finishedAt);
      const guestGame = await request('/session', guest, {});
      expect(guestGame.eligible).toBe(false);
      expect((await request(`/session/${guestGame.id}/finish`, guest, {})).settlement.status).toBe(
        'ineligible',
      );
      const guestBoard = await request('/board', guest);
      expect(guestBoard.me).toBeNull();
      expect(
        guestBoard.top.some((entry: { playerId: string }) => entry.playerId === guest.playerId),
      ).toBe(false);
      expect(guestBoard.reason).toContain('登录');
      time += 86_400_001;
      const expired = await request(`/session/${next.id}`, a);
      expect(expired.status).toBe('finished');
      expect(expired.settlement.reason).toBe('SESSION_EXPIRED');
      expect(expired.seq).toBe(1);
      expect(expired.state.board).toEqual(confirmed.state.board);
      expect(expired.settlement.score).toBe(confirmed.state.score);
      expect((await request(`/session/${next.id}`, a)).settlement.finishedAt).toBe(
        expired.settlement.finishedAt,
      );
      const high = createThreeChooseTwoStore(database.db, engine, now, 0);
      const pending = await high.create(b.playerId);
      const held = await high.finish(b.playerId, pending.id);
      expect(held.settlement!.status).toBe('pending-review');
      expect((await ranked.board(b.playerId)).me).toBeNull();
      const reviewUrl = `/api/competition/v1/internal/three-choose-two/sessions/${pending.id}/review`;
      expect(
        (
          await app.inject({
            method: 'POST',
            url: reviewUrl,
            headers: { 'x-competition-internal-key': key },
            payload: { decision: 'approve', reason: 'reviewed legal replay' },
          })
        ).statusCode,
      ).toBe(200);
      expect((await ranked.board(b.playerId)).me).not.toBeNull();
      expect(
        (
          await app.inject({
            method: 'POST',
            url: reviewUrl,
            headers: { 'x-competition-internal-key': key },
            payload: { decision: 'reject', reason: 'revoked test fixture' },
          })
        ).statusCode,
      ).toBe(200);
      expect((await ranked.board(b.playerId)).me).toBeNull();
      // Separate archived rule version fixtures exercise ranking independently of the random sequence.
      const version = `archive-${randomUUID()}`;
      for (const [index, credential] of [a, b, c].entries()) {
        const id = randomUUID();
        const data = {
          ...(rows[0]!.data as Record<string, unknown>),
          id,
          playerId: credential.playerId,
          version,
          status: 'finished',
        };
        await database.db.execute(
          sql`insert into runtime.three_choose_two_sessions values(${id},${credential.playerId},${version},'finished',${JSON.stringify(data)}::jsonb,${time},${time})`,
        );
        const score = index < 2 ? 300 : 100;
        await database.db.execute(
          sql`insert into runtime.three_choose_two_results(session_id,player_id,version,status,score,finished_at) values(${id},${credential.playerId},${version},'verified',${score},${time + index})`,
        );
        await database.db.execute(
          sql`insert into runtime.three_choose_two_best values(${version},${credential.playerId},${id},${score},${time + index})`,
        );
      }
      const board = await request(`/board?version=${version}`, b);
      expect(board.top.map((entry: { rank: number }) => entry.rank)).toEqual([1, 1, 3]);
      expect(board.top.map((entry: { playerId: string }) => entry.playerId)).toEqual([
        a.playerId,
        b.playerId,
        c.playerId,
      ]);
      expect(board.me.rank).toBe(1);
      expect(board.around).toHaveLength(3);
      expect(board.total).toBe(3);
      expect(
        (await request('/board', c)).top.every((entry: { score: number }) => entry.score !== 300),
      ).toBe(true);
    } finally {
      await app.close();
      const ids = credentials.map((credential) => sql`${credential.playerId}::uuid`);
      if (ids.length) {
        const list = sql.join(ids, sql`, `);
        await database.db.execute(
          sql`delete from runtime.three_choose_two_best where player_id in (${list})`,
        );
        await database.db.execute(
          sql`delete from runtime.three_choose_two_results where player_id in (${list})`,
        );
        await database.db.execute(
          sql`delete from runtime.three_choose_two_actions where session_id in (select id from runtime.three_choose_two_sessions where player_id in (${list}))`,
        );
        await database.db.execute(
          sql`delete from runtime.three_choose_two_sessions where player_id in (${list})`,
        );
        await database.db.execute(
          sql`delete from runtime.competition_sessions where player_id in (${list})`,
        );
        await database.db.execute(
          sql`delete from runtime.competition_players where id in (${list})`,
        );
      }
      await database.close();
    }
  },
);
