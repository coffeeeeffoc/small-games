import { expect, it, vi } from 'vitest';
import { createRankedStore } from '../src/competition/ranked-store.js';
import type { NightLoadout } from '../src/competition/night-wallet.js';
import type { RankedRule } from '../src/competition/ranked-types.js';
import { controlDatabase, gateFixture } from './control-fixture.js';

it('ranked checkpoint/receipt/finish gates precede simulation and preserve immutable retries', async () => {
  const gate = gateFixture(),
    rows = new Map<string, unknown>();
  const memory = controlDatabase((text, params) => {
    if (text.startsWith('select data from runtime.competition_matches')) {
      if (text.includes('for update')) gate.events.push('run-lock');
      return rows.has(String(params[0]))
        ? [{ data: structuredClone(rows.get(String(params[0]))) }]
        : [];
    }
    if (text.startsWith('insert into runtime.competition_matches')) {
      rows.set(String(params[0]), JSON.parse(String(params[2])));
      return [];
    }
    if (text.startsWith('update runtime.competition_matches')) {
      rows.set(String(params[1]), JSON.parse(String(params[0])));
      return [];
    }
    return [];
  });
  const apply = vi.fn((state) => state),
    result = vi.fn(() => ({ complete: true, eligible: true, score: 1, secondary: 0 }));
  const rule: RankedRule = {
    id: 'night-overwatch',
    title: 'fixture',
    version: 'v1',
    boards: [
      {
        id: 'endless',
        title: 'fixture',
        description: '',
        guestAllowed: true,
        scoreUnit: 'x',
        secondaryUnit: 'milliseconds',
      },
    ],
    create: () => ({}),
    apply,
    result,
  };
  const store = createRankedStore(
    memory.db,
    new Map([[rule.id, rule]]),
    async () => ({ authenticated: true }),
    () => 1000,
    gate.control,
  );
  const requestId = 'aaaaaaaa-0000-4000-8000-000000000001';
  const loadout: NightLoadout = [
    { id: 'hePower', tier: 1 },
    { id: 'heVelocity', tier: 1 },
    { id: 'heavyPower', tier: 1 },
  ];
  const run = await store.create('owner', rule.id, 'endless', undefined, 'v1', requestId, loadout);
  const input = { seq: 1, frames: [{ ticks: 1, input: {} }] };
  gate.set('draining');
  expect(
    await store.create('owner', rule.id, 'endless', undefined, 'v1', requestId, loadout),
  ).toEqual(run);
  await store.actions('owner', rule.id, run.id, input);
  expect(apply).toHaveBeenCalledTimes(1);
  await expect(store.create('owner', rule.id, 'endless', undefined, 'v1')).rejects.toMatchObject({
    code: 'GAME_DRAINING',
  });
  gate.set('disabled', 1);
  const writes = memory.queries.filter((q) => /^(insert|update|delete)/.test(q.sql)).length;
  await store.actions('owner', rule.id, run.id, input);
  expect(memory.queries.filter((q) => /^(insert|update|delete)/.test(q.sql))).toHaveLength(writes);
  await expect(store.finish('owner', rule.id, run.id, 1)).rejects.toMatchObject({
    code: 'GAME_DISABLED',
  });
  gate.set('enabled', 1);
  await expect(store.finish('owner', rule.id, run.id, 1)).rejects.toMatchObject({
    code: 'GAME_CANCELLED',
  });
  expect(result).not.toHaveBeenCalled();
  const fresh = await store.create(
    'owner',
    rule.id,
    'endless',
    undefined,
    'v1',
    undefined,
    loadout,
  );
  const settled = await store.finish('owner', rule.id, fresh.id, 0);
  gate.set('disabled', 2);
  const afterSettlement = memory.queries.filter((q) =>
    /^(insert|update|delete)/.test(q.sql),
  ).length;
  expect(await store.finish('owner', rule.id, fresh.id, 0)).toEqual(settled);
  expect(memory.queries.filter((q) => /^(insert|update|delete)/.test(q.sql))).toHaveLength(
    afterSettlement,
  );
  expect(result).toHaveBeenCalledTimes(1);
  expect(gate.events.indexOf('control')).toBeLessThan(gate.events.indexOf('run-lock'));
});
