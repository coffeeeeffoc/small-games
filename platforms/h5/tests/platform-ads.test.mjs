import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlatformAdProvider } from '../platform-ads.js';

function fixture(platform = 'taptap-h5', overrides = {}, options = {}) {
  const listeners = {},
    calls = [];
  const ad = {
    onClose: (fn) => {
      listeners.close = fn;
    },
    offClose: (fn) => {
      assert.equal(fn, listeners.close);
      calls.push('offClose');
    },
    onError: (fn) => {
      listeners.error = fn;
    },
    offError: (fn) => {
      assert.equal(fn, listeners.error);
      calls.push('offError');
    },
    load: async () => {
      calls.push('load');
    },
    show: async () => {
      calls.push('show');
    },
    destroy: () => {
      calls.push('destroy');
      if (platform === 'douyin') return Promise.resolve();
    },
    ...overrides,
  };
  const sdk = {
    createRewardedVideoAd(options) {
      assert.equal(this, sdk);
      calls.push(options);
      return ad;
    },
  };
  const environment = { tap: sdk, wx: sdk, tt: sdk, bl: sdk };
  const provider = createPlatformAdProvider({
    platform,
    environment,
    adUnitId: 'slot-1',
    timeoutMs: 20,
    ...options,
  });
  return { provider, listeners, calls, environment };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('Tap H5 shows during a slow startup preload and preserves long playback rewards', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let loaded;
  const f = fixture(
    'taptap-h5',
    {
      load: () =>
        new Promise((resolve) => {
          loaded = resolve;
        }),
    },
    { timeoutMs: 45000 },
  );
  const result = f.provider.show();
  await tick();
  assert.ok(f.calls.includes('show'), 'click does not wait for startup preload');
  t.mock.timers.tick(12000);
  loaded();
  await tick();
  t.mock.timers.tick(60000);
  f.listeners.close({ isEnded: true });
  assert.equal((await result).status, 'completed');
});

test('Tap H5 preloads without showing and consumes the same loaded instance on click', async () => {
  const f = fixture();
  await f.provider.preload();
  assert.equal(f.calls.filter((call) => call === 'load').length, 1);
  assert(!f.calls.includes('show'));
  const result = f.provider.show();
  await tick();
  assert.equal(f.calls.filter((call) => call === 'load').length, 1);
  assert.equal(f.calls.filter((call) => call === 'show').length, 1);
  f.listeners.close({ isEnded: true });
  assert.equal((await result).status, 'completed');
});

test('preload overlaps a click, cancels safely, and failed preloads can retry', async () => {
  for (const scenario of ['complete', 'cancel', 'load-rejected', 'sdk-error', 'timeout']) {
    let loaded, reject;
    const f = fixture('taptap-h5', {
      load: () =>
        new Promise((resolve, fail) => {
          loaded = resolve;
          reject = fail;
        }),
    });
    const first = f.provider.preload();
    assert.equal(f.provider.preload(), first, 'reuse in-flight preload');
    if (scenario === 'complete' || scenario === 'cancel') {
      const result = f.provider.show();
      if (scenario === 'cancel') f.provider.dispose();
      loaded();
      await tick();
      if (scenario === 'complete') {
        assert.equal(f.calls.filter((call) => call === 'show').length, 1);
        f.listeners.close({ isEnded: true });
      } else assert(!f.calls.includes('show'), 'cancelled loading never opens an ad');
      assert.equal((await result).status, scenario === 'complete' ? 'completed' : 'dismissed');
    } else {
      if (scenario === 'load-rejected') reject(new Error('no fill'));
      if (scenario === 'sdk-error') f.listeners.error({ errCode: 1004 });
      assert.equal(await first, false);
      const next = f.provider.show();
      loaded();
      await tick();
      f.listeners.close({ isEnded: true });
      assert.equal((await next).status, 'completed', scenario);
    }
    await first;
  }
  const f = fixture();
  await f.provider.preload();
  f.provider.dispose();
  assert.equal(f.calls.filter((call) => call === 'destroy').length, 1);
  assert(!f.calls.includes('show'));
});

test('opening still times out, diagnostics explain the phase and never affect rewards', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const events = [];
  const f = fixture(
    'taptap-h5',
    { show: () => new Promise(() => {}) },
    { timeoutMs: 45000, onEvent: (event) => events.push(event) },
  );
  const result = f.provider.show();
  await tick();
  t.mock.timers.tick(45000);
  assert.equal((await result).status, 'failed');
  assert(events.some((event) => event.event === 'timeout' && event.phase === 'opening'));
  f.listeners.close({ isEnded: true });
  assert.equal(f.calls.filter((call) => call === 'destroy').length, 1);
  const other = fixture(
    'taptap-h5',
    {},
    {
      onEvent() {
        throw new Error('diagnostics failed');
      },
    },
  );
  const success = other.provider.show();
  await tick();
  other.listeners.close({ isEnded: true });
  assert.equal((await success).status, 'completed');
});

test('a displayed Tap ad keeps its reward listener through 10 minutes on its end card', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let settled = false,
    shown = 0;
  const f = fixture('taptap-h5', {}, { timeoutMs: 45000 });
  const result = f.provider
    .show({
      onShown() {
        shown++;
      },
    })
    .then((outcome) => {
      settled = true;
      return outcome;
    });
  await tick();
  t.mock.timers.tick(600000);
  await tick();
  assert.equal(settled, false, 'display success must cancel the deadline, not extend it');
  assert.equal(shown, 1);
  f.listeners.close({ isEnded: true });
  assert.equal((await result).status, 'completed');
});

test('unconfirmed or late display success never disables the opening deadline or revives a cancelled ad', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const cancel of [false, true]) {
    let shown,
      notified = 0;
    const f = fixture('taptap-h5', {
      show: () =>
        new Promise((resolve) => {
          shown = resolve;
        }),
    });
    const pending = f.provider.show({
      onShown() {
        notified++;
      },
    });
    await tick();
    if (cancel) f.provider.dispose();
    else t.mock.timers.tick(20);
    assert.equal((await pending).status, cancel ? 'dismissed' : 'failed');
    shown();
    await tick();
    f.listeners.close({ isEnded: true });
    assert.equal(notified, 0);
    assert.equal(f.calls.filter((call) => call === 'destroy').length, 1);
  }
  const f = fixture('taptap-h5', { show: () => undefined });
  const pending = f.provider.show();
  await tick();
  t.mock.timers.tick(20);
  assert.equal(
    (await pending).status,
    'failed',
    'a missing SDK promise is not display confirmation',
  );
});

for (const platform of ['taptap-h5', 'wechat', 'douyin', 'bilibili'])
  test(`${platform}: SDK receiver, parameters, explicit completion and listener cleanup`, async () => {
    const f = fixture(platform);
    const keep = { 'taptap-h5': 'tap', wechat: 'wx', douyin: 'tt', bilibili: 'bl' }[platform];
    for (const name of ['tap', 'wx', 'tt', 'bl'])
      if (name !== keep)
        f.environment[name] = {
          createRewardedVideoAd() {
            throw new Error('wrong channel');
          },
        };
    const shown = f.provider.show({ kind: 'rewarded' });
    assert.equal((await f.provider.show()).status, 'unavailable');
    await tick();
    assert.deepEqual(
      f.calls[0],
      platform === 'douyin' ? { adUnitId: 'slot-1', multiton: false } : { adUnitId: 'slot-1' },
    );
    assert.equal(f.calls.includes('load'), platform !== 'douyin');
    assert.ok(f.calls.includes('show'));
    f.listeners.close({ isEnded: true });
    f.listeners.close({ isEnded: true });
    assert.deepEqual(await shown, { status: 'completed' });
    assert.equal(f.calls.filter((call) => call === 'destroy').length, 1);
    assert.ok(f.calls.includes('offClose') && f.calls.includes('offError'));
  });

test('TapTap missing SDK/slot and native Tap selector cannot fall back to another channel', async () => {
  for (const options of [
    {
      platform: 'taptap-h5',
      adUnitId: 'slot',
      environment: {
        wx: {
          createRewardedVideoAd() {
            assert.fail();
          },
        },
      },
    },
    { platform: 'taptap-h5', environment: fixture().environment },
    { platform: 'taptap-h5', adUnitId: 'YOUR_AD_UNIT_ID', environment: fixture().environment },
    { platform: 'unknown-channel', adUnitId: 'slot', environment: fixture().environment },
  ])
    assert.equal((await createPlatformAdProvider(options).show()).status, 'unavailable');
});

test('only boolean isEnded=true rewards, never missing/false/truthy payloads', async () => {
  for (const result of [undefined, {}, { isEnded: false }, { isEnded: 1 }, { isEnded: 'true' }]) {
    const f = fixture(),
      shown = f.provider.show();
    f.listeners.close(result);
    assert.equal((await shown).status, 'dismissed');
  }
});

test('errors, load/show rejection and timeout settle without a reward', async () => {
  for (const overrides of [
    {
      load: async () => {
        throw new Error('no fill');
      },
      show: async () => {
        throw new Error('not ready');
      },
    },
    {
      show: async () => {
        throw new Error('show failed');
      },
    },
    {
      load: () => new Promise(() => {}),
      show: async () => {
        throw new Error('not ready');
      },
    },
  ])
    assert.equal((await fixture('taptap-h5', overrides).provider.show()).status, 'failed');
  const f = fixture(),
    shown = f.provider.show();
  f.listeners.error();
  assert.equal((await shown).status, 'failed');
  f.listeners.close({ isEnded: true });
  assert.equal(f.calls.filter((call) => call === 'destroy').length, 1);
});

test('dispose settles promptly; unresolved or failed singleton destruction blocks reentry', async () => {
  let finishDestroy;
  const f = fixture('douyin', {
    destroy: () =>
      new Promise((resolve) => {
        finishDestroy = resolve;
      }),
  });
  const shown = f.provider.show();
  f.provider.dispose();
  assert.equal((await shown).status, 'dismissed');
  assert.equal((await f.provider.show()).status, 'unavailable');
  finishDestroy();
  await tick();
  const next = f.provider.show();
  f.listeners.close({ isEnded: true });
  assert.equal((await next).status, 'completed');
  finishDestroy();
  for (const destroy of [
    undefined,
    () => undefined,
    () => {
      throw new Error('cleanup');
    },
    () => Promise.reject(new Error('cleanup')),
  ]) {
    const other = fixture('douyin', { destroy }),
      pending = other.provider.show();
    other.provider.dispose();
    await pending;
    await tick();
    assert.equal((await other.provider.show()).status, 'unavailable');
  }
  const closed = fixture('douyin', { destroy: undefined }),
    last = closed.provider.show();
  closed.listeners.close({ isEnded: true });
  assert.equal((await last).status, 'completed');
  assert.equal((await closed.provider.show()).status, 'unavailable');
});

test('host SDK injected after initial launch is picked up on the next explicit request', async () => {
  const environment = {},
    f = fixture();
  const provider = createPlatformAdProvider({
    platform: 'taptap-h5',
    adUnitId: 'slot',
    environment,
  });
  assert.equal((await provider.show()).status, 'unavailable');
  environment.tap = f.environment.tap;
  const shown = provider.show();
  f.listeners.close({ isEnded: true });
  assert.equal((await shown).status, 'completed');
});

test('Tap starts preloading at creation, then clicks show first and recover only once', async () => {
  for (const failure of ['none', 'first', 'both', 'throw']) {
    let shows = 0,
      loads = 0;
    const f = fixture('taptap-h5', {
      load: async () => {
        loads++;
      },
      show() {
        shows++;
        if (failure === 'throw' && shows === 1) throw new Error('not ready');
        return failure === 'both' || (failure === 'first' && shows === 1)
          ? Promise.reject(new Error('not ready'))
          : Promise.resolve();
      },
    });
    assert.equal(loads, 1, 'startup preload requires no click');
    await tick();
    const pending = f.provider.show();
    await tick();
    assert.equal(shows, failure === 'none' ? 1 : 2);
    assert.equal(loads, failure === 'none' ? 1 : 2);
    if (failure !== 'both') f.listeners.close({ isEnded: true });
    assert.equal((await pending).status, failure === 'both' ? 'failed' : 'completed');
  }
});

test('recovery reuses an in-flight preload and cancellation prevents the second show', async () => {
  for (const cancel of [false, true]) {
    let loaded,
      loads = 0,
      shows = 0;
    const f = fixture('taptap-h5', {
      load: () => {
        loads++;
        return new Promise((resolve) => {
          loaded = resolve;
        });
      },
      show: async () => {
        if (++shows === 1) throw new Error('not ready');
      },
    });
    const pending = f.provider.show();
    await tick();
    assert.equal(loads, 1);
    if (cancel) f.provider.cancel();
    loaded();
    await tick();
    assert.equal(shows, cancel ? 1 : 2);
    if (!cancel) f.listeners.close({ isEnded: true });
    assert.equal((await pending).status, cancel ? 'dismissed' : 'completed');
  }
});

test('show rejection with onError never retries an already released instance', async () => {
  let shows = 0;
  const g = fixture('taptap-h5', {
    show() {
      shows++;
      g.listeners.error({ errCode: 1004 });
      return Promise.reject(new Error('SDK reported failure'));
    },
  });
  const pending = g.provider.show();
  assert.equal((await pending).status, 'failed');
  await tick();
  assert.equal(shows, 1);
  assert.equal(g.calls.filter((call) => call === 'load').length, 1);
  assert.equal(g.calls.filter((call) => call === 'destroy').length, 1);
});

test('synchronous close/error registration settles without later loading or showing', async () => {
  for (const event of ['close', 'error']) {
    const f = fixture('wechat', {
      onClose(fn) {
        if (event === 'close') fn({ isEnded: true });
      },
      onError(fn) {
        fn({ errCode: 1004 });
      },
    });
    assert.equal((await f.provider.show()).status, event === 'close' ? 'completed' : 'failed');
    await tick();
    assert(!f.calls.includes('load'));
    assert(!f.calls.includes('show'));
    assert.equal(f.calls.filter((call) => call === 'destroy').length, 1);
  }
  let detached = 0,
    loads = 0;
  const f = fixture('taptap-h5', {
    onError(fn) {
      fn({ errCode: 1004 });
    },
    offError() {
      detached++;
    },
    load() {
      loads++;
    },
  });
  await tick();
  assert.equal(loads, 0, 'synchronous preload failure must not load the retired ad');
  assert.equal(detached, 1);
  f.provider.dispose();
});

test('throwing onShown observers never retry, fail or reward a displayed ad', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  let settled = false,
    notifications = 0;
  const pending = f.provider
    .show({
      onShown() {
        notifications++;
        throw new Error('observer failure');
      },
    })
    .then((result) => {
      settled = true;
      return result;
    });
  await tick();
  t.mock.timers.tick(600000);
  await tick();
  assert.equal(settled, false);
  assert.equal(notifications, 1);
  assert.equal(f.calls.filter((call) => call === 'show').length, 1);
  assert.equal(f.calls.filter((call) => call === 'load').length, 1);
  f.listeners.close({ isEnded: true });
  assert.equal((await pending).status, 'completed');
});

for (const ended of [true, false, undefined, 'true'])
  test('Tap native has a separate cancellable lease and strict completion: ' + ended, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = fixture('taptap');
    let shown = false;
    const pending = f.provider.show({
      onShown: () => {
        shown = true;
      },
    });
    await tick();
    assert.deepEqual(f.calls[0], { adUnitId: 'slot-1', multiton: true });
    assert.equal(shown, true);
    t.mock.timers.tick(90000);
    f.listeners.close({ isEnded: ended });
    assert.equal((await pending).status, ended === true ? 'completed' : 'dismissed');
    const next = f.provider.show();
    await tick();
    f.provider.cancel();
    assert.equal((await next).status, 'dismissed');
  });
