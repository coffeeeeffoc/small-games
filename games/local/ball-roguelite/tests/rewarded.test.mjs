import test from 'node:test';
import assert from 'node:assert/strict';
import { createRewardRequests, rewardProvider } from '../src/rewarded.mjs';
import { createGame, canReward, grantReward } from '../core.mjs';
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
};
function setup() {
  const pending = deferred(),
    first = createGame('endless');
  let current = first,
    calls = 0;
  const service = createRewardRequests({
    provider: {
      show: () => {
        calls++;
        return pending.promise;
      },
    },
    isCurrent: (run) => run === current,
    eligible: canReward,
    grant: grantReward,
  });
  return {
    first,
    service,
    pending,
    replace() {
      current = createGame('endless');
      return current;
    },
    get calls() {
      return calls;
    },
  };
}
for (const status of ['dismissed', 'failed', 'unavailable'])
  test(`ad ${status} never grants or consumes a reward`, async () => {
    const { service, first, pending } = setup(),
      result = service.request(first, 'resonance');
    pending.resolve({ status });
    assert.equal((await result).granted, false);
    assert.equal(first.rewards.resonance, 0);
    assert.equal(service.pending, false);
  });
test('complete is granted exactly once and concurrent/replayed requests are rejected', async () => {
  const fixture = setup(),
    result = fixture.service.request(fixture.first, 'resonance');
  assert.equal((await fixture.service.request(fixture.first, 'resonance')).status, 'unavailable');
  fixture.pending.resolve({ status: 'completed' });
  assert.equal((await result).granted, true);
  assert.equal((await fixture.service.request(fixture.first, 'resonance')).granted, false);
  assert.equal(fixture.calls, 1);
});
test('changing runs invalidates a late completed callback', async () => {
  const fixture = setup(),
    result = fixture.service.request(fixture.first, 'resonance');
  const next = fixture.replace();
  fixture.pending.resolve({ status: 'completed' });
  assert.equal((await result).granted, false);
  assert.equal(fixture.first.rewards.resonance, 0);
  assert.equal(next.rewards.resonance, 0);
});
test('exit cancels unresolved SDK request without waiting and late success stays ignored', async () => {
  const { service, first, pending } = setup(),
    result = service.request(first, 'resonance');
  service.cancel();
  assert.equal((await result).status, 'dismissed');
  pending.resolve({ status: 'completed' });
  await Promise.resolve();
  assert.equal(first.rewards.resonance, 0);
  assert.equal(service.pending, false);
});
test('SDK rejection and disposal release pending state without rewards', async () => {
  const fixture = setup(),
    result = fixture.service.request(fixture.first, 'resonance');
  fixture.pending.reject(new Error('SDK failed'));
  assert.equal((await result).status, 'failed');
  assert.equal(fixture.service.pending, false);
  fixture.service.dispose();
  assert.equal((await fixture.service.request(fixture.first, 'resonance')).granted, false);
});
test('no configured SDK means unavailable; explicit host provider and channel adapter are supported', () => {
  assert.equal(rewardProvider({}), null);
  assert.equal(
    rewardProvider({ SmallGamesPublishingConfig: { adMode: 'off', provider: { show() {} } } }),
    null,
  );
  const provider = { show() {} };
  assert.equal(
    rewardProvider({ SmallGamesPublishingConfig: { adMode: 'host', provider } }),
    provider,
  );
  let options;
  const environment = {
    SmallGamesPublishingConfig: {
      adMode: 'host',
      platform: 'taptap-h5',
      adUnitId: 'orbit_reward_01',
    },
    tap: { createRewardedVideoAd() {} },
  };
  assert.equal(
    rewardProvider(environment, (value) => {
      options = value;
      return provider;
    }),
    provider,
  );
  assert.equal(options.platform, 'taptap-h5');
  assert.equal(options.environment, environment);
});
