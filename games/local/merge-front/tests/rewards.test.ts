import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step, command, snapshot, restore } from '../assets/scripts/core/engine.ts';
import { createRewardController } from '../assets/scripts/core/rewards.ts';
import type { RewardResult } from '../assets/scripts/core/rewards.ts';

function deferred() {
  let resolve!: (result: RewardResult) => void;
  const promise = new Promise<RewardResult>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test('completed grants 20% base income for exactly 600 simulation ticks once per match', async () => {
  const match = createMatch('level-01', 1);
  const plain = createMatch('level-01', 1);
  const rewards = createRewardController(match, async () => ({ status: 'completed' }));
  command(match, 0, { type: 'pause', paused: true });
  assert.deepEqual(await rewards.request(), { status: 'completed' });
  assert.equal(match.assisted, true);
  assert.equal(match.sides[0].buffTicks, 600);
  step(match, 600);
  assert.equal(match.sides[0].buffTicks, 600);
  command(match, 0, { type: 'pause', paused: false });
  step(match, 600);
  step(plain, 600);
  assert.equal(match.sides[0].buffTicks, 0);
  assert.equal(match.sides[0].coins - plain.sides[0].coins, 60);
  step(match, 20);
  step(plain, 20);
  assert.equal(match.sides[0].coins - plain.sides[0].coins, 60);
  assert.equal((await rewards.request()).status, 'unavailable');
  const restored = restore(snapshot(match));
  assert.equal(
    (await createRewardController(restored, async () => ({ status: 'completed' })).request())
      .status,
    'unavailable',
  );
});

test('no provider, dismissed, failed, rejected and malformed offers never grant', async () => {
  const match = createMatch('level-01', 1);
  assert.equal((await createRewardController(match).request()).status, 'unavailable');
  for (const status of ['dismissed', 'failed', 'unavailable'] as const) {
    assert.equal(
      (await createRewardController(match, async () => ({ status })).request()).status,
      status,
    );
  }
  assert.equal(
    (
      await createRewardController(match, () => {
        throw Error('offline');
      }).request()
    ).status,
    'failed',
  );
  assert.equal(
    (await createRewardController(match, () => Promise.reject(Error('offline'))).request()).status,
    'failed',
  );
  assert.equal(
    (await createRewardController(match, async () => ({ status: 'bogus' }) as never).request())
      .status,
    'failed',
  );
  assert.equal(match.sides[0].boostUsed, false);
  assert.equal(match.assisted, false);
});

test('cancel/dispose resolve immediately and invalidate late completion without affecting a new match', async () => {
  for (const operation of ['cancel', 'dispose'] as const) {
    const match = createMatch('level-01', 2);
    const next = createMatch('level-01', 2);
    const provider = deferred();
    const rewards = createRewardController(match, () => provider.promise);
    const request = rewards.request();
    rewards[operation]();
    assert.equal((await request).status, 'dismissed');
    provider.resolve({ status: 'completed' });
    await Promise.resolve();
    assert.equal(match.assisted, false);
    assert.equal(next.assisted, false);
    if (operation === 'dispose') assert.equal((await rewards.request()).status, 'unavailable');
  }
});

test('concurrent controllers cannot overwrite pending requests or grant twice; canceled provider must settle first', async () => {
  const match = createMatch('level-01', 3);
  const provider = deferred();
  const a = createRewardController(match, () => provider.promise);
  const b = createRewardController(match, async () => ({ status: 'completed' }));
  const request = a.request();
  assert.equal((await a.request()).status, 'unavailable');
  assert.equal((await b.request()).status, 'unavailable');
  a.cancel();
  assert.equal((await request).status, 'dismissed');
  assert.equal((await b.request()).status, 'unavailable');
  provider.resolve({ status: 'completed' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await b.request()).status, 'completed');
  assert.equal(match.sides[0].buffTicks, 600);
  assert.equal((await a.request()).status, 'unavailable');
});

test('completion after settlement is ignored and provider receives only offer metadata', async () => {
  const match = createMatch('level-01', 4);
  const provider = deferred();
  const rewards = createRewardController(match, (request) => {
    assert.deepEqual(request, { placement: 'income-boost', matchId: match.id });
    return provider.promise;
  });
  const request = rewards.request();
  match.phase = 'lost';
  match.winner = 1;
  match.sides[0].crystalHp = 0;
  provider.resolve({ status: 'completed' });
  assert.equal((await request).status, 'dismissed');
  assert.equal(match.sides[0].boostUsed, false);
});
