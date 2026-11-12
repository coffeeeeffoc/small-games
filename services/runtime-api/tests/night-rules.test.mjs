import { loadNightRelease } from '../src/competition/night-release.js';
import { expect, it } from 'vitest';
import duel from '../rules/night.mjs';
import ranked from '../rules/night-ranked.mjs';

it('publishes stable summary boards and binds sampled level replays', () => {
  expect(ranked.boards).toHaveLength(123);
  expect(new Set(ranked.boards.map((board) => board.id)).size).toBe(123);
  expect(ranked.boardVersion).toBe('night-records-v1');
  expect(ranked.version).toBe('night-input-replay-v18');
  expect(duel.version).toBe('night-duel-v11');
  expect(ranked.boardKey('level-operation-120')).toBe(
    'night-overwatch:level-operation-120:night-campaign-v4',
  );
  expect(ranked.boardKey('points')).toBe('night-overwatch:points:night-records-v1');
  expect(ranked.progression.version).toBe('night-growth-v1');
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

it('counts paid attacks rather than secondary projectiles for duel participation', () => {
  const loadout = { version: 'night-growth-v1', level: 1, effects: ['burst', 'twin'], skipped: [] };
  let state = duel.configure(duel.initial(7, 'friend'), [loadout, loadout]);
  state.simulation.hitShots = 1;
  state.simulation.duelStats[0].hitShots = 1;
  state = duel.action(
    state,
    {
      commands: [
        { command: 'choose', args: [2] },
        { command: 'fire', args: [] },
      ],
    },
    0,
    0,
  );
  expect(duel.view(state, 0).simulation).toMatchObject({ fired: 4, ammoSpent: 1 });
  expect(duel.view(state, 1).simulation.ammoSpent).toBe(0);
  expect(duel.result(state, 0).participated).toBe(false);
  for (const elapsed of [2500, 5000])
    state = duel.action(state, { commands: [{ command: 'fire', args: [] }] }, elapsed, 0);
  expect(duel.view(state, 0).simulation.ammoSpent).toBe(3);
  expect(duel.result(state, 0).participated).toBe(true);
});

it('loads real retained executors with 60/30/20 second tracking for old and new games', async () => {
  const ranked = (await import('../rules/night-ranked.mjs')).default;
  const duel = (await import('../rules/night.mjs')).default;
  const release = await loadNightRelease(ranked, duel, {});
  const loadout = { version: 'night-growth-v1', level: 6, effects: ['tracking'], skipped: [] };
  for (const [soloVersion, duelVersion, duration] of [
    ['night-input-replay-v16', 'night-duel-v9', 60],
    ['night-input-replay-v17', 'night-duel-v10', 30],
    ['night-input-replay-v18', 'night-duel-v11', 20],
  ]) {
    const solo = release.ranked.get(soloVersion),
      multi = release.multiplayer.get(duelVersion);
    const level = solo.boards.find((b) => b.id.startsWith('level-')).id;
    let run = solo.configure(solo.create(level, 7, level.slice(6)), loadout);
    run = solo.apply(run, [{ input: { command: 'useSkill', args: [] }, ticks: 0 }]);
    expect(run.simulation.skill.activeUntil).toBe(duration);
    expect(run.simulation.skill.readyAt).toBe(duration + 90);
    let room = multi.configure(multi.initial(7, 'friend'), [loadout, loadout]);
    room = multi.action(room, { commands: [{ command: 'useSkill', args: [] }] }, 0, 0);
    expect(multi.view(room, 0).simulation.skill.activeUntil).toBe(duration);
    expect(multi.view(room, 1).simulation.skill.activeUntil).toBe(0);
  }
});
