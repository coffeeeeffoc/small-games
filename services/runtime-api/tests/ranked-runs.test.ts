import { describe, expect, it } from 'vitest';
import { createRankedRuns } from '../src/competition/ranked-runs.js';
import type { RankedRule } from '../src/competition/ranked-types.js';
import { memoryRuns } from './ranked-fixture.js';

const night = 'night-overwatch';
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
function setup(game = rule.id) {
  const memory = memoryRuns();
  let time = 1000;
  const rules = new Map([[game, { ...rule, id: game }]]);
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
  it('only Night accepts request IDs and concurrent retries keep the original checkpoint', async () => {
    const fixture = setup(night),
      requestId = 'aaaaaaaa-0000-4000-8000-000000000001';
    const create = (owner = 'member', board = 'endless', levelId = 'first', version = 'v1') =>
      fixture.service.create(owner, night, board, levelId, version, requestId);
    const [first, concurrent] = await Promise.all([create(), create()]);
    expect(first).toEqual(concurrent);
    expect(first.id).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
    await fixture.service.actions('member', night, first.id, {
      seq: 1,
      frames: [{ ticks: 120, input: {} }],
    });
    const stored = structuredClone(fixture.runs.get(first.id));
    fixture.advance(5000);
    const retried = await create();
    expect(retried).toMatchObject({ id: first.id, seed: first.seed, seq: 1 });
    expect(fixture.runs.get(first.id)).toEqual(stored);
    expect(fixture.runs.size).toBe(1);
    await expect(create('member', 'members')).rejects.toMatchObject({
      code: 'REQUEST_ID_CONFLICT',
    });
    await expect(create('member', 'endless', 'other')).rejects.toMatchObject({
      code: 'REQUEST_ID_CONFLICT',
    });
    const other = await create('outsider');
    expect(other.id).not.toBe(first.id);
    await expect(fixture.service.get('outsider', night, first.id)).rejects.toMatchObject({
      code: 'NOT_A_MEMBER',
    });
    fixture.rules.set(night, { ...rule, id: night, version: 'v2' });
    await expect(create('member', 'endless', 'first', 'v2')).rejects.toMatchObject({
      code: 'REQUEST_ID_CONFLICT',
    });
    await expect(
      setup().service.create('member', 'sample', 'endless', undefined, 'v1', requestId),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      fixture.service.create('member', night, 'endless', undefined, 'v2', 'not-a-uuid'),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
  it('Night resume renews only expiry, preserves input and returns settled results without rewarding twice', async () => {
    const fixture = setup(night);
    const run = await fixture.service.create('member', night, 'endless', undefined, 'v1');
    await fixture.service.actions('member', night, run.id, {
      seq: 1,
      frames: [{ ticks: 120, input: {} }],
    });
    const before = structuredClone(fixture.runs.get(run.id)!);
    fixture.advance(24 * 3600000 + 1);
    const next = { seq: 2, frames: [{ ticks: 120, input: {} }] };
    await expect(fixture.service.actions('member', night, run.id, next)).rejects.toMatchObject({
      code: 'RUN_EXPIRED',
    });
    await fixture.service.get('member', night, run.id);
    expect(fixture.runs.get(run.id)).toEqual(before);
    const resumed = await fixture.service.resume('member', night, run.id);
    expect(resumed.expiresAt).toBeGreaterThan(before.expiresAt);
    expect(fixture.runs.get(run.id)).toEqual({ ...before, expiresAt: resumed.expiresAt });
    await fixture.service.actions('member', night, run.id, next);
    const settlement = await fixture.service.finish('member', night, run.id, 2);
    expect(settlement.accepted).toBe(true);
    const finished = structuredClone(fixture.runs.get(run.id));
    fixture.advance(24 * 3600000 + 1);
    for (let i = 0; i < 2; i++)
      expect((await fixture.service.resume('member', night, run.id)).settlement).toEqual(
        settlement,
      );
    expect(fixture.runs.get(run.id)).toEqual(finished);
    expect(fixture.results.size).toBe(1);
  });
  it('Night resume enforces ownership, game scope, current version and control', async () => {
    const fixture = setup(night);
    const run = await fixture.service.create('member', night, 'endless', undefined, 'v1');
    await expect(fixture.service.resume('outsider', night, run.id)).rejects.toMatchObject({
      code: 'NOT_A_MEMBER',
    });
    await expect(
      fixture.service.resume({ playerId: 'member', game: 'sample' }, night, run.id),
    ).rejects.toMatchObject({ code: 'IDENTITY_SCOPE_MISMATCH' });
    await expect(fixture.service.resume('member', 'sample', run.id)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    fixture.rules.set(night, { ...rule, id: night, version: 'v2' });
    await expect(fixture.service.resume('member', night, run.id)).rejects.toMatchObject({
      code: 'RULE_VERSION_CHANGED',
    });
    fixture.rules.set(night, { ...rule, id: night });
    const mutate = fixture.repository.mutate;
    fixture.repository.mutate = (id, change, auth) =>
      mutate(
        id,
        (tx) =>
          change({
            ...tx,
            assertControl: () => {
              throw Object.assign(new Error('disabled'), { code: 'GAME_DISABLED' });
            },
          }),
        auth,
      );
    await expect(fixture.service.resume('member', night, run.id)).rejects.toMatchObject({
      code: 'GAME_DISABLED',
    });
    fixture.repository.mutate = mutate;
    fixture.runs.get(run.id)!.game = 'sample';
    await expect(fixture.service.resume('member', night, run.id)).rejects.toMatchObject({
      code: 'WRONG_GAME',
    });
  });
  it('requires the artifact version before creating state or persisting a run', async () => {
    const fixture = setup();
    for (const version of [undefined, '', 'v2'])
      await expect(
        fixture.service.create('member', 'sample', 'endless', undefined, version),
      ).rejects.toMatchObject({ code: 'RULE_VERSION_CHANGED' });
    expect(fixture.runs.size).toBe(0);
    fixture.rules.set(rule.id, { ...rule, version: 'v2' });
    await expect(
      fixture.service.create('member', 'sample', 'endless', undefined, 'v1'),
    ).rejects.toMatchObject({ code: 'RULE_VERSION_CHANGED' });
    expect(fixture.runs.size).toBe(0);
    expect(
      (await fixture.service.create('member', 'sample', 'endless', undefined, 'v2')).version,
    ).toBe('v2');
  });
  it('binds game, board, version and identity; rejects unauthenticated policy without trusting client identity', async () => {
    const fixture = setup();
    await expect(
      fixture.service.create('member', 'unknown', 'endless', undefined, 'v1'),
    ).rejects.toMatchObject({
      code: 'GAME_UNAVAILABLE',
    });
    await expect(
      fixture.service.create('member', 'sample', 'other', undefined, 'v1'),
    ).rejects.toMatchObject({
      code: 'BOARD_UNAVAILABLE',
    });
    await expect(
      fixture.service.create('guest', 'sample', 'members', undefined, 'v1'),
    ).rejects.toMatchObject({
      code: 'LOGIN_REQUIRED',
    });
    const run = await fixture.service.create('member', 'sample', 'members', undefined, 'v1');
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
    const run = await fixture.service.create('member', 'sample', 'endless', undefined, 'v1');
    const first = { seq: 1, frames: [{ ticks: 120, input: {} }] };
    const receipt = await fixture.service.actions('member', 'sample', run.id, first);
    const restarted = fixture.build();
    await restarted.actions('member', 'sample', run.id, {
      seq: 2,
      frames: [{ ticks: 0, input: {} }],
    });
    expect(await restarted.actions('member', 'sample', run.id, first)).toEqual(receipt);
    await expect(
      restarted.actions('member', 'sample', run.id, {
        ...first,
        frames: [{ ticks: 121, input: {} }],
      }),
    ).rejects.toMatchObject({ code: 'SEQUENCE_CONFLICT' });
    const settlements = await Promise.all([
      restarted.finish('member', 'sample', run.id, 2),
      restarted.finish('member', 'sample', run.id, 2),
    ]);
    expect(settlements[0]).toEqual(settlements[1]);
    expect(settlements[0]?.accepted).toBe(true);
    expect(fixture.results.size).toBe(1);
    expect(await restarted.actions('member', 'sample', run.id, first)).toEqual(receipt);
    await expect(
      restarted.actions('member', 'sample', run.id, { seq: 3, frames: [{ ticks: 0, input: {} }] }),
    ).rejects.toMatchObject({ code: 'RUN_FINISHED' });
  });
  it('rejects incomplete results, illegal actions, skipped sequences, excessive simulation, expiry and rule changes', async () => {
    const fixture = setup();
    const run = await fixture.service.create('member', 'sample', 'endless', undefined, 'v1');
    await expect(
      fixture.service.actions('member', 'sample', run.id, {
        seq: 2,
        frames: [{ ticks: 1, input: {} }],
      }),
    ).rejects.toMatchObject({ code: 'SEQUENCE_CONFLICT' });
    await expect(
      fixture.service.actions('member', 'sample', run.id, {
        seq: 1,
        frames: [{ ticks: 1, input: { score: 9999 } }],
      }),
    ).rejects.toMatchObject({ code: 'ILLEGAL_ACTION' });
    expect(fixture.runs.get(run.id)?.seq).toBe(0);
    await expect(
      fixture.service.actions('member', 'sample', run.id, {
        seq: 1,
        frames: [{ ticks: 2401, input: {} }],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      fixture.service.actions('member', 'sample', run.id, {
        seq: 1,
        frames: [{ ticks: 1000, input: {} }],
      }),
    ).rejects.toMatchObject({ code: 'RUN_AHEAD_OF_TIME' });
    expect((await fixture.service.finish('member', 'sample', run.id, 0)).accepted).toBe(false);
    expect(fixture.results.size).toBe(0);
    const old = await fixture.service.create('member', 'sample', 'endless', undefined, 'v1');
    fixture.advance(24 * 3600000 + 1);
    await expect(fixture.service.finish('member', 'sample', old.id, 0)).rejects.toMatchObject({
      code: 'RUN_EXPIRED',
    });
    const changed = await fixture.service.create('member', 'sample', 'endless', undefined, 'v1');
    fixture.rules.set(rule.id, { ...rule, version: 'v2' });
    await expect(fixture.service.finish('member', 'sample', changed.id, 0)).rejects.toMatchObject({
      code: 'RULE_VERSION_CHANGED',
    });
  });
  it('allows endless time to grow through bounded batches and extends activity expiry', async () => {
    const fixture = setup();
    const run = await fixture.service.create('member', 'sample', 'endless', undefined, 'v1');
    for (let seq = 1; seq <= 12; seq++) {
      fixture.advance(20000);
      await fixture.service.actions('member', 'sample', run.id, {
        seq,
        frames: [{ ticks: 2400, input: {} }],
      });
    }
    expect(fixture.runs.get(run.id)?.ticks).toBe(28800);
    expect(fixture.runs.get(run.id)?.expiresAt).toBeGreaterThan(run.expiresAt);
  });
});
