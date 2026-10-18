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

test('Tap H5 full viewing after 12s loading and 60s playback keeps its reward', async (t) => {
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
    { platform: 'taptap', adUnitId: 'slot', environment: fixture().environment },
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
    },
    {
      show: async () => {
        throw new Error('show failed');
      },
    },
    { load: () => new Promise(() => {}) },
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
