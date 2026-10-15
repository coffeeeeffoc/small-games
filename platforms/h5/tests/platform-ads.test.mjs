import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlatformAdProvider } from '../platform-ads.js';

function fixture(platform = 'taptap-h5', overrides = {}) {
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
  });
  return { provider, listeners, calls, environment };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

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
