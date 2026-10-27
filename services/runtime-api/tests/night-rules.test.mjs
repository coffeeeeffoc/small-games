import { expect, it } from 'vitest';
import duel from '../rules/night.mjs';
import ranked from '../rules/night-ranked.mjs';

it('publishes stable summary boards and binds sampled level replays', () => {
  expect(ranked.boards).toHaveLength(123);
  expect(new Set(ranked.boards.map((board) => board.id)).size).toBe(123);
  expect(ranked.boardVersion).toBe('night-records-v1');
  expect(ranked.boards.slice(0, 3).map((board) => board.id)).toEqual([
    'clears',
    'points',
    'win-rate',
  ]);
  for (const board of ranked.boards.slice(3, 6)) {
    const state = ranked.create(board.id, 1, board.id.slice(6));
    expect(ranked.result(state)).toMatchObject({ complete: false, eligible: false, score: 0 });
    expect(() => ranked.create(board.id, 1, 'other')).toThrow();
  }
  expect(() => ranked.create('campaign', 1, 'corridor-01')).toThrow();
  expect(() => ranked.create('level-corridor-01', 1)).toThrow();
});

it('uses authoritative time, atomic command batches and read-only views with a one-second fire lease', () => {
  let state = duel.initial(7, 'friend');
  const before = structuredClone(state);
  expect(() =>
    duel.action(
      state,
      {
        commands: [
          { command: 'fire', args: [] },
          { command: 'forged', args: [] },
        ],
      },
      0,
      0,
    ),
  ).toThrow();
  expect(state).toEqual(before);
  duel.view(state, 1);
  expect(state).toEqual(before);
  for (const action of [
    { commands: [], score: 1 },
    { commands: [], snapshot: {} },
    { commands: [], keepAlive: false },
    { commands: Array(65).fill({ command: 'fire', args: [] }) },
  ])
    expect(() => duel.action(state, action, 0, 0)).toThrow();
  state = duel.action(state, { commands: [{ command: 'setFire', args: ['held', true] }] }, 0, 0);
  state = duel.action(state, { commands: [], keepAlive: true }, 900, 0);
  expect(state.pilots[0].leaseUntil).toBeCloseTo(1.9);
  state = duel.advance(state, 2000);
  expect(state.pilots[0].held).toEqual([]);
  expect(state.ticks).toBe(120);
  expect(duel.roomSize('bot')).toBe(1);
  expect(duel.view(duel.initial(1, 'bot'), 0).bot).toBe(true);
});
