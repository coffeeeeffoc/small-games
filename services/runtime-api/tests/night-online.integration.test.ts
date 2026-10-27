import Fastify from 'fastify';
import { openDatabase } from '@coffeeeeffoc/service-kit';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createCompetitionStore } from '../src/competition/store.js';
import { createRankedStore } from '../src/competition/ranked-store.js';
import { registerCompetition } from '../src/competition/routes.js';
import type { Rule } from '../src/competition/types.js';
import type { RankedRule } from '../src/competition/ranked-types.js';

const databaseUrl = process.env.COMPETITION_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
type Player = { playerId: string; token: string };
integration('Night real HTTP and PostgreSQL', () => {
  let database: ReturnType<typeof openDatabase>, app: ReturnType<typeof Fastify>, base: string;
  let time = Date.now();
  async function request(path: string, player?: Player, body?: unknown, status = 200) {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        ...(player ? { authorization: `Bearer ${player.token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value = JSON.parse(await response.text());
    expect(response.status, `${path}: ${value.error || 'unexpected status'}`).toBe(status);
    return value;
  }
  const player = (game = 'night-overwatch'): Promise<Player> =>
    request('/sessions/guest', undefined, { game });
  const path = '/games/night-overwatch';
  const roomPath = (code: string) => `${path}/rooms/${code}`;
  beforeAll(async () => {
    if (!databaseUrl || new URL(databaseUrl).pathname !== '/competition_test')
      throw Error('Use isolated competition_test');
    database = openDatabase(databaseUrl, 'runtime');
    app = Fastify();
    const duel = (await import(new URL('../rules/night.mjs', import.meta.url).href))
      .default as Rule;
    const solo = (await import(new URL('../rules/night-ranked.mjs', import.meta.url).href))
      .default as RankedRule;
    const store = createCompetitionStore(database.db, new Map([[duel.id, duel]]), () => time);
    const ranked = createRankedStore(
      database.db,
      new Map([[solo.id, solo]]),
      store.identityDetails,
      () => time,
    );
    await registerCompetition(app, store, {}, undefined, undefined, ranked);
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw Error('Missing HTTP address');
    base = `http://127.0.0.1:${address.port}/api/competition/v1`;
  });
  afterAll(async () => {
    await app?.close();
    await database?.close();
  });

  it('assigns distinct identities, requires both ready, isolates outsiders, and retries actions once', async () => {
    const [a, b, outsider, wrongGame] = await Promise.all([
      player(),
      player(),
      player(),
      player('cops-robbers'),
    ]);
    expect(a.playerId).not.toBe(b.playerId);
    const metadata = await request(path, a);
    expect(metadata.identity.playerId).toBe(a.playerId);
    expect(metadata.boards).toHaveLength(120);
    expect(metadata.capabilities.multiplayer).toBe(true);
    expect(metadata.identity.nickname || metadata.identity.name).toBeTruthy();
    const room = await request(path + '/rooms', a, { mode: 'friend' });
    await request(path + '/rooms/join', b, { code: room.code });
    expect((await request(roomPath(room.code) + '/ready', a, {})).status).toBe('waiting');
    const started = await request(roomPath(room.code) + '/ready', b, {});
    expect(started.status).toBe('playing');
    expect(started.state.you).toBe(1);
    expect(
      started.state.simulation.units.filter((u: { friendly: boolean }) => u.friendly),
    ).toHaveLength(8);
    await request(roomPath(room.code), outsider, undefined, 403);
    await request(roomPath(room.code), wrongGame, undefined, 403);
    time += 300;
    const body = {
      seq: 1,
      action: {
        commands: [
          { command: 'choose', args: [3] },
          { command: 'setAim', args: [{ x: 800, z: 800 }] },
        ],
        keepAlive: true,
      },
    };
    const first = await request(roomPath(room.code) + '/actions', a, body);
    const repeated = await request(roomPath(room.code) + '/actions', a, body);
    expect(repeated).toEqual(first);
    expect(first.seq).toBe(1);
    await request(roomPath(room.code) + '/actions', a, { seq: 1, action: { commands: [] } }, 409);
    const before = await request(roomPath(room.code), a);
    await request(
      roomPath(room.code) + '/actions',
      a,
      { seq: 2, action: { commands: [{ command: 'grantAmmoSupply', args: [] }] } },
      422,
    );
    expect((await request(roomPath(room.code), a)).state.simulation.guns).toEqual(
      before.state.simulation.guns,
    );
    await request(roomPath(room.code) + '/leave', a, {});
    expect((await request(roomPath(room.code), b)).status).toBe('abandoned');
  });

  it('serializes repeated matchmaking, pairs humans, falls back to a bot and handles cancel races', async () => {
    const [a, b, c, d, e] = await Promise.all(Array.from({ length: 5 }, () => player()));
    const duplicates = await Promise.all([
      request(path + '/match', a, {}),
      request(path + '/match', a, {}),
    ]);
    expect(duplicates[0].code).toBe(duplicates[1].code);
    const paired = await request(path + '/match', b, {});
    expect(paired.code).toBe(duplicates[0].code);
    expect(paired.status).toBe('playing');
    expect(paired.players).toHaveLength(2);
    await request(roomPath(paired.code) + '/leave', a, {});
    const queued = await request(path + '/match', c, {});
    time += 8001;
    const bot = await request(path + '/match', c, {});
    expect(bot.code).toBe(queued.code);
    expect(bot.mode).toBe('bot');
    expect(bot.players).toHaveLength(1);
    expect(bot.state.bot).toBe(true);
    expect((await request(path + '/match', c, {})).code).toBe(bot.code);
    await request(roomPath(bot.code) + '/leave', c, {});
    const waiting = await request(path + '/match', d, {});
    const [, racing] = await Promise.all([
      request(roomPath(waiting.code) + '/leave', d, {}),
      request(path + '/match', e, {}),
    ]);
    const resolved = await request(roomPath(racing.code), e);
    expect(['waiting', 'abandoned']).toContain(resolved.status);
    await request(roomPath(racing.code) + '/leave', e, {});
  });

  it('replays actual controls, ranks per level, retains faster times and rejects another player', async () => {
    const core = new URL(
      '../../../games/local/night-overwatch/assets/scripts/core/',
      import.meta.url,
    );
    const { Simulation } = await import(new URL('Simulation.ts', core).href);
    const { observeNightInputs, RANKED_RULE_VERSION } = await import(
      new URL('Replay.ts', core).href
    );
    const a = await player(),
      b = await player();
    const runOnce = async (delay: number) => {
      const run = await request(path + '/runs', a, {
        board: 'level-corridor-01',
        levelId: 'corridor-01',
        version: RANKED_RULE_VERSION,
      });
      await request(`${path}/runs/${run.id}`, b, undefined, 403);
      const sim = new Simulation();
      sim.start();
      const frames: { input: Record<string, unknown>; ticks: number }[] = [];
      observeNightInputs(sim, (input: Record<string, unknown>, ticks: number) => {
        const previous = frames.at(-1);
        if (ticks && previous && !Object.keys(previous.input).length && previous.ticks < 600)
          previous.ticks += ticks;
        else frames.push({ input, ticks });
      });
      sim.choose(2);
      for (let i = 0; i < 6000 && sim.phase === 'playing'; i++) {
        const target = sim.units.find(
          (u: { friendly: boolean; hp: number }) => !u.friendly && u.hp > 0,
        );
        if (target && sim.time >= delay && !sim.shots.length && !sim.guns[2].cooldown) {
          sim.setAim({ x: target.x, z: target.z });
          sim.fire();
        }
        sim.step(1 / 60);
      }
      expect(sim.phase).toBe('success');
      let seq = 0;
      while (frames.length) {
        const batch: typeof frames = [];
        let ticks = 0;
        while (frames.length && batch.length < 500 && ticks + frames[0]!.ticks <= 2400) {
          const frame = frames.shift()!;
          batch.push(frame);
          ticks += frame.ticks;
        }
        time += Math.ceil((ticks * 1000) / 120);
        await request(`${path}/runs/${run.id}/actions`, a, { seq: ++seq, frames: batch });
      }
      const result = await request(`${path}/runs/${run.id}/finish`, a, { seq });
      expect(result.accepted).toBe(true);
      expect(result.secondary).toBe(Math.round(sim.completionTime * 1000));
      expect(await request(`${path}/runs/${run.id}/finish`, a, { seq })).toEqual(result);
      return result.secondary;
    };
    const first = await runOnce(2),
      slower = await runOnce(5);
    expect(slower).toBeGreaterThan(first);
    expect((await request(path + '/leaderboards/level-corridor-01', a)).me.secondary).toBe(first);
    const best = await runOnce(0);
    expect(best).toBeLessThan(first);
    const board = await request(path + '/leaderboards/level-corridor-01', a);
    expect(board.me.playerId).toBe(a.playerId);
    expect(board.me.secondary).toBe(best);
    expect(
      board.top.filter((row: { playerId: string }) => row.playerId === a.playerId),
    ).toHaveLength(1);
    expect((await request(path + '/leaderboards/level-ambush-02', a)).me).toBe(null);
  });
});
