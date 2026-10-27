import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun } from '../src/core.mjs';
import { createRewards, rewardEligible } from '../src/rewards.mjs';

for (const status of ['completed', 'dismissed', 'failed', 'unavailable'])
  test(`supply grants only completed: ${status}`, async () => {
    const run = createRun();
    run.player.hp = 30;
    const rewards = createRewards({
      current: () => run,
      port: () => ({ available: true, offer: async () => ({ status }) }),
    });
    assert.equal(await rewards.offer('supply'), status);
    assert.equal(run.player.hp, status === 'completed' ? 70 : 30);
    assert.equal(run.weapon, status === 'completed' ? 'machine' : 'rifle');
    assert.equal(run.ammo, status === 'completed' ? 160 : 0);
    assert.equal(run.assisted, status === 'completed');
    assert.equal(run.rewardUsed.supply, status === 'completed');
    if (status === 'completed') assert.equal(await rewards.offer('supply'), 'unavailable');
  });

test('revive is 50%, once per room; unavailable SDK never changes the failed run', async () => {
  const run = createRun();
  run.phase = 'lost';
  run.player.hp = 0;
  assert.equal(rewardEligible(run, 'supply'), false);
  const rewards = createRewards({
    current: () => run,
    port: () => ({ available: true, offer: async () => ({ status: 'completed' }) }),
  });
  assert.equal(await rewards.offer('revive'), 'completed');
  assert.equal(run.player.hp, 60);
  assert.equal(run.phase, 'playing');
  assert.ok(run.player.invulnerable >= 2);
  run.phase = 'lost';
  run.player.hp = 0;
  assert.equal(await rewards.offer('revive'), 'unavailable');
  assert.equal(
    await createRewards({ current: () => run, port: () => null }).offer('revive'),
    'unavailable',
  );
});

test('request tokens reject cancellation, old rooms, replacement runs and repeated clicks without a display timeout', async () => {
  for (const action of ['cancel', 'room', 'restart', 'keep']) {
    let run = createRun(),
      complete;
    run.player.hp = 30;
    const original = run;
    const rewards = createRewards({
      current: () => run,
      port: () => ({
        available: true,
        offer: () =>
          new Promise((r) => {
            complete = r;
          }),
        cancel() {},
      }),
    });
    const waiting = rewards.offer('supply');
    assert.equal(await rewards.offer('supply'), 'unavailable');
    if (action === 'cancel') rewards.cancel();
    if (action === 'room') run.roomEpoch++;
    if (action === 'restart') run = createRun();
    complete({ status: 'completed' });
    assert.equal(await waiting, action === 'keep' ? 'completed' : 'expired');
    assert.equal(original.player.hp, action === 'keep' ? 70 : 30);
  }
});

for (const status of ['completed', 'dismissed', 'failed', 'unavailable'])
  test(`experience premium choice grants only completed: ${status}`, async () => {
    const run = createRun();
    run.phase = 'upgrade';
    run.upgradeReason = 'experience';
    run.choices = ['power', 'medical', 'overdrive'];
    const rewards = createRewards({
      current: () => run,
      port: () => ({ available: true, offer: async () => ({ status }) }),
    });
    assert.equal(await rewards.offer('overdrive'), status);
    assert.equal(run.phase, status === 'completed' ? 'playing' : 'upgrade');
    assert.equal(run.levelIndex, 0);
    assert.equal(run.stats.damageMultiplier, status === 'completed' ? 1.3 : 1);
    assert.equal(run.player.maxHp, status === 'completed' ? 150 : 120);
    if (status === 'completed') {
      assert.equal(await rewards.offer('overdrive'), 'unavailable');
      run.phase = 'upgrade';
      run.rank++;
      run.choices = ['rapid', 'mobility', 'overdrive'];
      assert.equal(
        await rewards.offer('overdrive'),
        'completed',
        'a later rank is a new opportunity',
      );
    }
  });

test('late advertisement cannot apply to a different rank or changed choices', async () => {
  for (const change of ['rank', 'choices']) {
    const run = createRun();
    run.phase = 'upgrade';
    run.upgradeReason = 'experience';
    run.choices = ['power', 'medical', 'overdrive'];
    let complete;
    const rewards = createRewards({
      current: () => run,
      port: () => ({
        available: true,
        offer: () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      }),
    });
    const promise = rewards.offer('overdrive');
    if (change === 'rank') run.rank++;
    else run.choices = ['rapid', 'mobility', 'overdrive'];
    complete({ status: 'completed' });
    assert.equal(await promise, 'expired');
    assert.equal(run.stats.damageMultiplier, 1);
  }
});

test('cancelled provider rejection cannot restore an obsolete reward screen', async () => {
  const run = createRun();
  run.player.hp = 30;
  let reject;
  let locked;
  const rewards = createRewards({
    current: () => run,
    locked: (v) => {
      locked = v;
    },
    port: () => ({
      available: true,
      offer: () =>
        new Promise((_, r) => {
          reject = r;
        }),
      cancel() {
        throw new Error('optional cleanup');
      },
    }),
  });
  const pending = rewards.offer('supply');
  rewards.cancel();
  assert.equal(locked, false);
  reject(new Error('late cancellation'));
  assert.equal(await pending, 'expired');
  assert.equal(run.player.hp, 30);
});
