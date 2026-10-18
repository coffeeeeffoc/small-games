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
        : operation === 'timeout'
          ? { show: () => new Promise(() => {}) }
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

test('preload and playback share one instance; idle cancel preserves preload', async () => {
  const f = fixture();
  assert.equal(await f.provider.preload(), true);
  f.provider.cancel();
  assert.deepEqual(f.calls, ['create', 'load']);
  const result = f.provider.show();
  await tick();
  assert.deepEqual(f.calls, ['create', 'load', 'show']);
  f.listeners.close({ isEnded: true });
  assert.equal((await result).status, 'completed');
});

test('a rejected show after successful preload performs a fresh recovery load', async () => {
  let shows = 0;
  const f = fixture({
    show: async () => {
      if (++shows === 1) throw Error('expired preload');
    },
  });
  assert.equal(await f.provider.preload(), true);
  const pending = f.provider.show();
  await tick();
  assert.equal(f.calls.filter((call) => call === 'load').length, 2);
  assert.equal(shows, 2);
  f.listeners.close({ isEnded: true });
  assert.equal((await pending).status, 'completed');
});

test('preload settles false on timeout, disposal or SDK error even if load never settles', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const ending of ['timeout', 'dispose', 'error']) {
    let loaded;
    const f = fixture(
      {
        load: () =>
          new Promise((resolve) => {
            loaded = resolve;
          }),
      },
      45_000,
    );
    const pending = f.provider.preload();
    if (ending === 'timeout') t.mock.timers.tick(45_000);
    else if (ending === 'error') f.listeners.error();
    else f.provider.dispose();
    assert.equal(await pending, false);
    loaded();
    await tick();
    assert.equal(f.calls.filter((call) => call === 'create').length, 1);
    assert(!f.calls.includes('show'));
    f.provider.dispose();
  }
});

test('opening deadline ends on shown, long video and end page do not time out', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let shown = 0,
    settled = false;
  const f = fixture({}, 45_000);
  const result = f.provider.show({ onShown: () => shown++ }).then((value) => {
    settled = true;
    return value;
  });
  await tick();
  assert.equal(shown, 1);
  t.mock.timers.tick(600_000);
  await tick();
  assert.equal(settled, false);
  f.listeners.close({ isEnded: true });
  assert.equal((await result).status, 'completed');
});

test('unresolved or missing show promise has finite deadline and cannot later reward', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const missing of [false, true]) {
    let opened,
      shown = 0;
    const f = fixture(
      {
        show: () =>
          missing
            ? undefined
            : new Promise((resolve) => {
                opened = resolve;
              }),
      },
      45_000,
    );
    const result = f.provider.show({ onShown: () => shown++ });
    const close = f.listeners.close;
    t.mock.timers.tick(45_000);
    assert.equal((await result).status, 'failed');
    opened?.();
    close({ isEnded: true });
    await tick();
    assert.equal(shown, 0);
  }
});

test('retired listeners cannot finish a new request and failed destruction retains lease', async () => {
  const f = fixture();
  const first = f.provider.show(),
    oldClose = f.listeners.close,
    oldError = f.listeners.error;
  f.provider.cancel();
  await first;
  await tick();
  let settled = false;
  const second = f.provider.show().then((value) => {
    settled = true;
    return value;
  });
  oldClose({ isEnded: true });
  oldError();
  await tick();
  assert.equal(settled, false);
  f.listeners.close({ isEnded: true });
  assert.equal((await second).status, 'completed');
  for (const destroy of [
    () => {
      throw Error('busy');
    },
    () => Promise.reject(Error('busy')),
  ]) {
    const failed = fixture({ destroy });
    const pending = failed.provider.show();
    failed.provider.cancel();
    await pending;
    await tick();
    failed.listeners.close({ isEnded: true });
    assert.equal((await failed.provider.show()).status, 'unavailable');
  }
});

test('failed preload retires its instance; disposed idle preload cannot revive', async () => {
  const failed = fixture({
    load: async () => {
      throw Error('no fill');
    },
  });
  assert.equal(await failed.provider.preload(), false);
  assert(failed.calls.includes('destroy'));
  let loaded;
  const f = fixture({
    load: () =>
      new Promise((resolve) => {
        loaded = resolve;
      }),
  });
  const preload = f.provider.preload();
  f.provider.dispose();
  loaded();
  assert.equal(await preload, false);
  assert.equal((await f.provider.show()).status, 'unavailable');
});

test('synchronous SDK error replay during registration never shows or loads a retired instance', async () => {
  for (const method of ['show', 'preload']) {
    const f = fixture({ onError: (listener) => listener({ errCode: 1 }) });
    const result = await f.provider[method]();
    assert.deepEqual(result, method === 'show' ? { status: 'failed' } : false);
    assert(!f.calls.includes('show'));
    assert(!f.calls.includes('load'));
    assert(f.calls.includes('destroy'));
  }
});
