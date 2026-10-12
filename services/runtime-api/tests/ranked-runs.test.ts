import { describe, expect, it } from 'vitest';
import { createRankedRuns } from '../src/competition/ranked-runs.js';
import type { RankedRule } from '../src/competition/ranked-types.js';
import { memoryRuns } from './ranked-fixture.js';

const rule: RankedRule = {
  id: 'sample',
  title: 'Sample',
  version: 'v1',
  boards: [
    {
      id: 'endless',
      title: 'Endless',
      guestAllowed: true,
      description: '',
      scoreUnit: '层',
      secondaryUnit: 'milliseconds',
    },
    {
      id: 'members',
      title: 'Members',
      guestAllowed: false,
      description: '',
      scoreUnit: '层',
      secondaryUnit: 'milliseconds',
    },
  ],
  create: () => ({ ticks: 0 }),
  apply(state, frames) {
    const game = state as { ticks: number };
    for (const frame of frames) {
      if (Object.keys(frame.input).length) throw new Error('Only wait is accepted');
      game.ticks += frame.ticks;
    }
    return game;
  },
  result: (state) => ({
    complete: (state as { ticks: number }).ticks >= 120,
    eligible: true,
    score: (state as { ticks: number }).ticks,
    secondary: 1000,
  }),
};
function setup() {
  const memory = memoryRuns();
  let time = 1000;
  const rules = new Map([[rule.id, rule]]);
  const authenticated = async (playerId: string) => ({ authenticated: playerId === 'member' });
  const build = () => createRankedRuns(memory.repository, rules, authenticated, () => time);
  return {
    ...memory,
    service: build(),
    build,
    rules,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('shared ranked run lifecycle', () => {
  it('binds game, board, version and identity; supports anonymous/guest policy without trusting client identity', async () => {
    const fixture = setup();
    await expect(fixture.service.create('guest', 'unknown', 'endless')).rejects.toMatchObject({
      code: 'GAME_UNAVAILABLE',
    });
    await expect(fixture.service.create('guest', 'sample', 'other')).rejects.toMatchObject({
      code: 'BOARD_UNAVAILABLE',
    });
    await expect(fixture.service.create('guest', 'sample', 'members')).rejects.toMatchObject({
      code: 'LOGIN_REQUIRED',
    });
    const run = await fixture.service.create('member', 'sample', 'members');
    expect(run.stepHz).toBe(120);
    expect(run.version).toBe('v1');
    await expect(fixture.service.get('outsider', 'sample', run.id)).rejects.toMatchObject({
      code: 'NOT_A_MEMBER',
    });
    await expect(fixture.service.get('member', 'other', run.id)).rejects.toMatchObject({
      code: 'WRONG_GAME',
    });
  });
  it('persists checkpoints, arbitrary old-sequence receipts and exactly-once concurrent settlement', async () => {
    const fixture = setup();
    const run = await fixture.service.create('guest', 'sample', 'endless');
    const first = { seq: 1, frames: [{ ticks: 120, input: {} }] };
    const receipt = await fixture.service.actions('guest', 'sample', run.id, first);
    const restarted = fixture.build();
    await restarted.actions('guest', 'sample', run.id, {
      seq: 2,
      frames: [{ ticks: 0, input: {} }],
    });
    expect(await restarted.actions('guest', 'sample', run.id, first)).toEqual(receipt);
    await expect(
      restarted.actions('guest', 'sample', run.id, {
        ...first,
        frames: [{ ticks: 121, input: {} }],
      }),
    ).rejects.toMatchObject({ code: 'SEQUENCE_CONFLICT' });
    const settlements = await Promise.all([
      restarted.finish('guest', 'sample', run.id, 2),
      restarted.finish('guest', 'sample', run.id, 2),
    ]);
    expect(settlements[0]).toEqual(settlements[1]);
    expect(settlements[0]?.accepted).toBe(true);
    expect(fixture.results.size).toBe(1);
    expect(await restarted.actions('guest', 'sample', run.id, first)).toEqual(receipt);
    await expect(
      restarted.actions('guest', 'sample', run.id, { seq: 3, frames: [{ ticks: 0, input: {} }] }),
    ).rejects.toMatchObject({ code: 'RUN_FINISHED' });
  });
  it('rejects incomplete results, illegal actions, skipped sequences, excessive simulation, expiry and rule changes', async () => {
    const fixture = setup();
    const run = await fixture.service.create('guest', 'sample', 'endless');
    await expect(
      fixture.service.actions('guest', 'sample', run.id, {
        seq: 2,
        frames: [{ ticks: 1, input: {} }],
      }),
    ).rejects.toMatchObject({ code: 'SEQUENCE_CONFLICT' });
    await expect(
      fixture.service.actions('guest', 'sample', run.id, {
        seq: 1,
        frames: [{ ticks: 1, input: { score: 9999 } }],
      }),
    ).rejects.toMatchObject({ code: 'ILLEGAL_ACTION' });
    expect(fixture.runs.get(run.id)?.seq).toBe(0);
    await expect(
      fixture.service.actions('guest', 'sample', run.id, {
        seq: 1,
        frames: [{ ticks: 2401, input: {} }],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      fixture.service.actions('guest', 'sample', run.id, {
        seq: 1,
        frames: [{ ticks: 1000, input: {} }],
      }),
    ).rejects.toMatchObject({ code: 'RUN_AHEAD_OF_TIME' });
    expect((await fixture.service.finish('guest', 'sample', run.id, 0)).accepted).toBe(false);
    expect(fixture.results.size).toBe(0);
    const old = await fixture.service.create('guest', 'sample', 'endless');
    fixture.advance(24 * 3600000 + 1);
    await expect(fixture.service.finish('guest', 'sample', old.id, 0)).rejects.toMatchObject({
      code: 'RUN_EXPIRED',
    });
    const changed = await fixture.service.create('guest', 'sample', 'endless');
    fixture.rules.set(rule.id, { ...rule, version: 'v2' });
    await expect(fixture.service.finish('guest', 'sample', changed.id, 0)).rejects.toMatchObject({
      code: 'RULE_VERSION_CHANGED',
    });
  });
  it('allows endless time to grow through bounded batches and extends activity expiry', async () => {
    const fixture = setup();
    const run = await fixture.service.create('guest', 'sample', 'endless');
    for (let seq = 1; seq <= 12; seq++) {
      fixture.advance(20000);
      await fixture.service.actions('guest', 'sample', run.id, {
        seq,
        frames: [{ ticks: 2400, input: {} }],
      });
    }
    expect(fixture.runs.get(run.id)?.ticks).toBe(28800);
    expect(fixture.runs.get(run.id)?.expiresAt).toBeGreaterThan(run.expiresAt);
  });
});
