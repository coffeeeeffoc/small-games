import { expect, it, vi } from 'vitest';
import { createThreeChooseTwoStore } from '../src/three-choose-two/store.js';
import type { Engine, EngineState, RankedSession } from '../src/three-choose-two/types.js';
import { controlDatabase, gateFixture } from './control-fixture.js';

const owner = '11111111-1111-4111-8111-111111111111',
  id = '22222222-2222-4222-8222-222222222222';
const state = (): EngineState => ({
  board: [],
  candidates: [],
  used: [],
  group: 0,
  completedGroups: 0,
  placedInGroup: 0,
  score: 10,
  combo: 0,
  status: 'playing',
  reason: null,
  stats: {},
  lastEvent: null,
});
function fixture(pending = false) {
  const gate = gateFixture();
  const sessions = new Map<string, RankedSession>([
    [
      id,
      {
        id,
        playerId: owner,
        killEpoch: 0,
        version: 'v1',
        shapeVersion: 's1',
        difficultyVersion: 'd1',
        scoringVersion: 's1',
        randomVersion: 'r1',
        seed: 'seed',
        seq: 0,
        status: pending ? 'finished' : 'active',
        createdAt: 1,
        expiresAt: 100,
        eligible: true,
        state: state(),
        settlement: pending
          ? {
              status: 'pending-review',
              reason: 'HIGH_SCORE_REVIEW',
              score: 10,
              stats: {},
              finishedAt: 99,
              isPersonalBest: false,
            }
          : null,
      },
    ],
  ]);
  const create = vi.fn(() => state()),
    finish = vi.fn((previous: EngineState) => ({ ...previous, status: 'finished' as const }));
  const engine: Engine = {
    RULE_VERSION: 'v1',
    SHAPES_VERSION: 's1',
    DIFFICULTY_VERSION: 'd1',
    SCORING_VERSION: 's1',
    RANDOM_VERSION: 'r1',
    createEndless: create,
    place: (previous) => previous,
    finishEndless: finish,
  };
  const memory = controlDatabase((text, params) => {
    if (text.startsWith('select p.id,p.platform')) return [{ id: owner, platform: 'wechat' }];
    if (text.startsWith('select 1 from runtime.player_game_access')) return [{ ok: 1 }];
    if (text.startsWith('select id from runtime.three_choose_two_sessions'))
      return [...sessions.values()]
        .filter((session) => session.status === 'active')
        .map((session) => ({ id: session.id }));
    if (text.startsWith('select data from runtime.three_choose_two_sessions')) {
      gate.events.push('session-lock');
      const session = text.includes('where player_id')
        ? [...sessions.values()].find((item) => item.status === 'active')
        : sessions.get(String(params[0]));
      return session ? [{ data: structuredClone(session) }] : [];
    }
    if (text.startsWith('update runtime.three_choose_two_sessions')) {
      const session = JSON.parse(String(params[1])) as RankedSession;
      sessions.set(session.id, session);
      return [];
    }
    if (text.startsWith('insert into runtime.three_choose_two_sessions')) {
      const session = JSON.parse(String(params[4])) as RankedSession;
      sessions.set(session.id, session);
      return [];
    }
    if (text.startsWith('select platform,subject'))
      return [{ platform: 'wechat', subject: 'server-verified' }];
    if (text.startsWith('select id from runtime.competition_players')) return [{ id: owner }];
    if (text.startsWith('select id,platform,app_id,created_at'))
      return [{ id: owner, platform: 'wechat', app_id: 'fixture', created_at: 1 }];
    return [];
  });
  return {
    ...memory,
    gate,
    sessions,
    create,
    finish,
    store: createThreeChooseTwoStore(memory.db, engine, () => 1000, 100000, gate.control),
  };
}
it('board expiry persists cancellation without replay, score writes or synthetic failure settlement', async () => {
  const f = fixture();
  f.gate.set('disabled', 1);
  await f.store.board(owner);
  expect(f.sessions.get(id)).toMatchObject({
    status: 'finished',
    cancelled: true,
    settlement: null,
  });
  expect(f.create).not.toHaveBeenCalled();
  expect(f.finish).not.toHaveBeenCalled();
  expect(
    f.queries.some((q) => /insert into runtime.three_choose_two_(results|best)/.test(q.sql)),
  ).toBe(false);
  expect(f.gate.events.indexOf('control')).toBeLessThan(f.gate.events.indexOf('session-lock'));
});
it('recovery starts at the new epoch and frees an old active slot without settling it', async () => {
  const f = fixture();
  f.gate.set('enabled', 1);
  const created = await f.store.create(owner);
  expect(f.sessions.get(id)).toMatchObject({
    status: 'finished',
    cancelled: true,
    settlement: null,
  });
  expect(f.sessions.get(created.id)).toMatchObject({ status: 'active', killEpoch: 1 });
  expect(f.finish).not.toHaveBeenCalled();
  expect(f.create).toHaveBeenCalledTimes(1);
});
it('disabled/old pending review cannot replay, approve or write a leaderboard after recovery', async () => {
  const f = fixture(true);
  f.gate.set('disabled', 1);
  await expect(f.store.review(id, 'approve', 'review')).rejects.toMatchObject({
    code: 'GAME_DISABLED',
  });
  f.gate.set('enabled', 1);
  await expect(f.store.review(id, 'approve', 'review')).rejects.toMatchObject({
    code: 'GAME_CANCELLED',
  });
  await expect(f.store.audit(id)).rejects.toMatchObject({ code: 'GAME_CANCELLED' });
  const persisted = await f.store.finish(owner, id);
  expect(persisted.settlement?.status).toBe('pending-review');
  expect(f.create).not.toHaveBeenCalled();
  expect(f.finish).not.toHaveBeenCalled();
  expect(f.queries.some((q) => /^(insert|update|delete)/.test(q.sql))).toBe(false);
});
it('draining rejects a new run and disabled timeout/action paths stop before replay', async () => {
  const f = fixture();
  f.gate.set('draining');
  await expect(f.store.create(owner)).rejects.toMatchObject({ code: 'GAME_DRAINING' });
  f.gate.set('disabled', 1);
  await expect(f.store.get(owner, id)).rejects.toMatchObject({ code: 'GAME_DISABLED' });
  await expect(
    f.store.action(owner, id, { seq: 1, group: 0, slot: 0, x: 0, y: 0 }),
  ).rejects.toMatchObject({ code: 'GAME_DISABLED' });
  await expect(f.store.finish(owner, id)).rejects.toMatchObject({ code: 'GAME_DISABLED' });
  expect(f.finish).not.toHaveBeenCalled();
  expect(f.create).not.toHaveBeenCalled();
});
