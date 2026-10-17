import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { createTapTapRewardedAds } from '../rewarded-ads.mjs';

function fixture(overrides = {}, timeoutMs = 50) {
  const listeners = {},
    calls = [];
  const ad = {
    onClose: (fn) => {
      listeners.close = fn;
    },
    onError: (fn) => {
      listeners.error = fn;
    },
    offClose: (fn) => {
      assert.equal(fn, listeners.close);
      calls.push('offClose');
    },
    offError: (fn) => {
      assert.equal(fn, listeners.error);
      calls.push('offError');
    },
    show: async () => {
      calls.push('show');
    },
    load: async () => {
      calls.push('load');
    },
    destroy: () => {
      calls.push('destroy');
    },
    ...overrides,
  };
  const sdk = {
    createRewardedVideoAd(options) {
      assert.equal(this, sdk);
      assert.deepEqual(options, { adUnitId: 'slot' });
      calls.push('create');
      return ad;
    },
  };
  return { provider: createTapTapRewardedAds(sdk, 'slot', timeoutMs), calls, listeners };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('only explicit full-view close rewards; duplicate clicks and callbacks cannot award twice', async () => {
  for (const value of [undefined, {}, { isEnded: false }, { isEnded: 'true' }, { isEnded: true }]) {
    const f = fixture(),
      result = f.provider.show();
    assert.equal((await f.provider.show()).status, 'unavailable');
    f.listeners.close(value);
    f.listeners.close({ isEnded: true });
    assert.equal((await result).status, value?.isEnded === true ? 'completed' : 'dismissed');
    assert.deepEqual(f.calls, ['create', 'show', 'offClose', 'offError', 'destroy']);
    f.provider.dispose();
  }
});

test('Tap show retries load/show once; a fulfilled show promise alone gives no reward', async () => {
  let shows = 0;
  const f = fixture({
    show: async () => {
      if (++shows === 1) throw Error('not loaded');
    },
  });
  let settled = false;
  const result = f.provider.show().then((value) => {
    settled = true;
    return value;
  });
  await tick();
  assert.equal(shows, 2);
  assert(f.calls.includes('load'));
  assert.equal(settled, false);
  f.listeners.close({ isEnded: true });
  assert.equal((await result).status, 'completed');
});

test('missing config/SDK, error, failed retry, timeout, cancellation and disposal never reward', async () => {
  for (const [sdk, id] of [
    [{}, 'slot'],
    [null, 'slot'],
    [{}, ''],
    [{}, 'YOUR_SLOT'],
  ])
    assert.equal((await createTapTapRewardedAds(sdk, id).show()).status, 'unavailable');
  for (const operation of ['error', 'timeout', 'cancel', 'dispose', 'load-failed']) {
    const overrides =
      operation === 'load-failed'
        ? {
            show: async () => {
              throw Error('not loaded');
            },
            load: async () => {
              throw Error('no fill');
            },
          }
        : {};
    const f = fixture(overrides, 5),
      result = f.provider.show();
    if (operation === 'error') f.listeners.error({ errCode: 1 });
    if (operation === 'cancel' || operation === 'dispose') f.provider[operation]();
    assert.equal(
      (await result).status,
      ['cancel', 'dispose'].includes(operation) ? 'dismissed' : 'failed',
    );
    f.listeners.close({ isEnded: true });
    if (operation === 'dispose') assert.equal((await f.provider.show()).status, 'unavailable');
    f.provider.dispose();
  }
});

test('a cancelled SDK singleton remains blocked until destroy confirms cleanup', async () => {
  let destroy;
  const f = fixture({
    destroy: () =>
      new Promise((resolve) => {
        destroy = resolve;
      }),
  });
  const result = f.provider.show();
  f.provider.cancel();
  assert.equal((await result).status, 'dismissed');
  assert.equal((await f.provider.show()).status, 'unavailable');
  f.listeners.close({ isEnded: true });
  destroy();
  await tick();
  const next = f.provider.show();
  f.listeners.close({ isEnded: true });
  assert.equal((await next).status, 'completed');
  destroy();
});
