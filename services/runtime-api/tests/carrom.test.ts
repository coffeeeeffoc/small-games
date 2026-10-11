import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCompetition } from '../src/competition/routes.js';
import type { createCompetitionStore } from '../src/competition/store.js';

const ruleUrl = new URL('../rules/carrom.mjs', import.meta.url).href;
const coreUrl = new URL('../../../games/local/carrom-club/src/core.mjs', import.meta.url).href;
const { default: rule } = await import(ruleUrl);
const { shoot, step, STEP } = await import(coreUrl);
const shot = { type: 'shoot', x: 500, dx: 1, dy: 0, power: 0.05, expectedShot: 0 };

describe('authoritative carrom duel', () => {
  it('settles a complete shot without mutating the accepted board, with a reproducible replay', () => {
    const initial = rule.initial();
    const original = structuredClone(initial);
    const next = rule.action(initial, { ...shot, dx: 0, dy: -1, power: 0.8 }, 400, 0);
    expect(initial).toEqual(original);
    expect(next.game.phase).not.toBe('moving');
    expect(next.game.shots).toBe(1);
    expect(next.lastShot.id).toBe(1);
    expect(next.lastShot.seat).toBe(0);
    expect(next.lastShot.before.shots).toBe(0);
    expect(next.game.events).toEqual([]);

    const replay = structuredClone(next.lastShot.before);
    expect(shoot(replay, next.lastShot.dx, next.lastShot.dy, next.lastShot.power)).toBe(true);
    for (let tick = 0; replay.phase === 'moving' && tick < 7200; tick++) step(replay, STEP);
    replay.events.length = 0;
    expect(replay).toEqual(next.game);
    expect(rule.action(initial, { ...shot, dx: 0, dy: -1, power: 0.8 }, 400, 0)).toEqual(next);
  });

  it('accepts only the active seat and rejects stale shots after a turn changes', () => {
    const initial = rule.initial();
    expect(() => rule.action(initial, shot, 1, 1)).toThrow('尚未轮到你');
    expect(() => rule.action(initial, shot, 1, '0')).toThrow('无效玩家席位');
    const next = rule.action(initial, shot, 100, 0);
    expect(next.game.turn).toBe(1);
    expect(() => rule.action(next, shot, 200, 1)).toThrow('棋盘已更新');
    expect(() => rule.action(next, { ...shot, expectedShot: 1 }, 200, 0)).toThrow('尚未轮到你');
    const second = rule.action(next, { ...shot, expectedShot: 1 }, 200, 1);
    expect(second.lastShot.id).toBe(2);
    expect(second.lastShot.seat).toBe(1);
    expect(second.game.shots).toBe(2);
  });

  it.each([
    { x: 234 },
    { x: 766 },
    { x: Number.NaN },
    { x: '500' },
    { dx: 0, dy: 0 },
    { dx: Number.POSITIVE_INFINITY },
    { dx: Number.MAX_VALUE, dy: Number.MAX_VALUE },
    { dy: Number.NaN },
    { power: 0.024 },
    { power: 1.01 },
    { power: Number.NaN },
    { expectedShot: -1 },
    { expectedShot: 0.5 },
    { expectedShot: undefined },
    { score: 9999 },
    { winner: 0 },
    { seat: 1 },
    { coins: [] },
    { type: 'finish' },
  ])('rejects forged scoring and invalid physical input without changing state: %j', (fields) => {
    const initial = rule.initial();
    const before = structuredClone(initial);
    expect(() => rule.action(initial, { ...shot, ...fields }, 500, 0)).toThrow();
    expect(initial).toEqual(before);
  });

  it('rejects array actions and non-finite server clocks', () => {
    const initial = rule.initial();
    expect(() => rule.action(initial, [shot], 0, 0)).toThrow();
    for (const time of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => rule.advance(initial, time)).toThrow('无效服务器计时');
      expect(() => rule.action(initial, shot, time, 0)).toThrow('无效服务器计时');
    }
  });

  it('advances the deadline independently of polling and counts a covered red queen', () => {
    const initial = rule.initial();
    initial.game.shots = 2;
    initial.game.playerShots = 1;
    initial.game.coins.find((coin: { kind: string }) => coin.kind === 'white').pocketed = true;
    initial.game.coins.find((coin: { kind: string }) => coin.kind === 'queen').pocketed = true;
    initial.game.queen = 'covered';
    initial.game.queenOwner = 1;
    const final = rule.advance(initial, rule.durationMs);
    expect(final.reason).toBe('time-limit');
    expect(final.game.phase).toBe('over');
    expect(final.game.winner).toBe(1);
    expect(rule.view(final, 0).scores).toEqual([1, 3]);
    expect(rule.result(final, 0)).toEqual({
      finished: true,
      eligible: true,
      score: 0,
      secondary: 0,
    });
    expect(rule.result(final, 1)).toEqual({
      finished: true,
      eligible: true,
      score: 3,
      secondary: 0,
    });
    expect(rule.advance(rule.advance(initial, 1000), rule.durationMs)).toEqual(final);
    expect(() => rule.action(initial, shot, rule.durationMs, 0)).toThrow('本局已结束');
    expect(initial.game.phase).toBe('ready');
  });

  it('settles a cleared board using red-queen points rather than awarding the finisher by default', () => {
    const initial = rule.initial();
    let white = 0;
    let black = 0;
    for (const coin of initial.game.coins) {
      if (coin.kind === 'queen') coin.pocketed = true;
      if (coin.kind === 'black') coin.pocketed = black++ < 7;
      if (coin.kind === 'white') {
        coin.pocketed = white++ < 8;
        if (!coin.pocketed) Object.assign(coin, { x: 104, y: 104 });
      }
    }
    initial.game.queen = 'covered';
    initial.game.queenOwner = 1;
    const final = rule.action(initial, shot, 100, 0);
    expect(final.reason).toBe('clear');
    expect(final.game.finisher).toBe(0);
    expect(final.game.winner).toBe(1);
    expect(rule.view(final, 0).scores).toEqual([9, 10]);
    expect(rule.result(final, 1)).toEqual({
      finished: true,
      eligible: true,
      score: 3,
      secondary: 0,
    });
  });

  it('finishes tied scores as a draw and never awards early resignation or idle-room points', () => {
    const initial = rule.initial();
    const idle = rule.advance(initial, rule.durationMs);
    expect(idle.game.winner).toBeNull();
    expect(rule.result(idle, 0)).toEqual({
      finished: true,
      eligible: false,
      score: 1,
      secondary: 0,
    });
    expect(rule.result(idle, 1).score).toBe(1);
    const earlyResign = rule.action(initial, { type: 'resign' }, 10, 1);
    expect(earlyResign.game.winner).toBe(0);
    expect(rule.result(earlyResign, 0).eligible).toBe(false);
    const first = rule.action(initial, shot, 100, 0);
    const second = rule.action(first, { ...shot, expectedShot: 1 }, 200, 1);
    const draw = rule.advance(second, rule.durationMs);
    expect(rule.result(draw, 0)).toEqual({
      finished: true,
      eligible: true,
      score: 1,
      secondary: 0,
    });
    const resigned = rule.action(second, { type: 'resign' }, 300, 0);
    expect(resigned.reason).toBe('resign');
    expect(rule.result(resigned, 1)).toEqual({
      finished: true,
      eligible: true,
      score: 3,
      secondary: 0,
    });
    expect(rule.advance(resigned, rule.durationMs).game.winner).toBe(1);
    expect(() => rule.action(resigned, { type: 'resign' }, 400, 1)).toThrow('本局已结束');
  });

  it('returns detached player views and monotonic elapsed time', () => {
    const state = rule.action(rule.initial(), shot, 100, 0);
    const view = rule.view(state, 1);
    expect(view.seat).toBe(1);
    expect(view.finished).toBe(false);
    view.game.turn = 0;
    view.lastShot.before.striker.x = 235;
    expect(state.game.turn).toBe(1);
    expect(state.lastShot.before.striker.x).toBe(500);
    expect(rule.advance(state, 50).elapsedMs).toBe(100);
  });
});

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

it('accepts carrom room creation and joining through the existing authenticated API', async () => {
  const app = Fastify();
  apps.push(app);
  const identity = vi.fn(async () => 'verified-player');
  const create = vi.fn(async () => ({ code: 'ABCDEF123456' }));
  const roomAction = vi.fn(async () => ({ status: 'waiting' }));
  const store = { identity, create, roomAction } as unknown as ReturnType<
    typeof createCompetitionStore
  >;
  await registerCompetition(app, store, {});
  const headers = { authorization: `Bearer ${'a'.repeat(64)}` };
  const created = await app.inject({
    method: 'POST',
    url: '/api/competition/v1/rooms',
    headers,
    payload: { game: 'carrom-club' },
  });
  expect(created.statusCode).toBe(200);
  expect(create).toHaveBeenCalledWith('verified-player', 'carrom-club', { game: 'carrom-club' });
  const joined = await app.inject({
    method: 'POST',
    url: '/api/competition/v1/rooms/join',
    headers,
    payload: { game: 'carrom-club', code: 'ABCDEF123456' },
  });
  expect(joined.statusCode).toBe(200);
  expect(roomAction).toHaveBeenCalledWith('verified-player', 'ABCDEF123456', 'join', {
    game: 'carrom-club',
    code: 'ABCDEF123456',
  });
});
