import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCreatorAdBridge,
  installCreatorAdBridge,
  type CreatorAdEnvironment,
  type CreatorAdPlatform,
} from '../src/creator-ads.js';
import { createNativeAdProvider } from '../src/ads.js';

const opportunity = { id: 'game:speed:3', reward: { speed: 3 } };
const configuration = {
  platform: 'taptap' as const,
  adsEnabled: true,
  adUnitId: 'native-placement',
};
function fixture() {
  const close = new Set<(result?: { isEnded?: boolean }) => void>();
  const errors = new Set<() => void>();
  let lastClose: ((result?: { isEnded?: boolean }) => void) | undefined;
  const ad = {
    load: vi.fn(() => Promise.resolve()),
    show: vi.fn(() => Promise.resolve()),
    destroy: vi.fn<() => void | Promise<void>>(),
    onClose: vi.fn((listener: (result?: { isEnded?: boolean }) => void) => {
      lastClose = listener;
      close.add(listener);
    }),
    offClose: vi.fn((listener) => close.delete(listener)),
    onError: vi.fn((listener: () => void) => errors.add(listener)),
    offError: vi.fn((listener) => errors.delete(listener)),
  };
  const sdk = {
    createRewardedVideoAd: vi.fn(function (this: unknown, options: { adUnitId: string }) {
      expect(this).toBe(sdk);
      expect(options).toEqual({ adUnitId: 'native-placement' });
      return ad;
    }),
    createCanvas: vi.fn(() => {
      throw Error('The advertising bridge must not own a Canvas');
    }),
  };
  return {
    sdk,
    ad,
    close,
    errors,
    end(result?: { isEnded?: boolean }) {
      for (const listener of close) listener(result);
    },
    fail() {
      for (const listener of errors) listener();
    },
    late(result: { isEnded: boolean }) {
      lastClose?.(result);
    },
  };
}
const start = async (ad: ReturnType<typeof fixture>['ad']) => {
  for (let i = 0; i < 8 && ad.show.mock.calls.length === 0; i++) await Promise.resolve();
  expect(ad.show).toHaveBeenCalledTimes(1);
};
afterEach(() => vi.useRealTimers());

describe('Creator advertising composition', () => {
  it.each([
    [true, 'completed'],
    [false, 'dismissed'],
    [undefined, 'dismissed'],
    ['true', 'dismissed'],
  ])('requires explicit boolean SDK completion (%s)', async (isEnded, status) => {
    const f = fixture();
    const bridge = createCreatorAdBridge(configuration, { tap: f.sdk });
    const result = bridge.offer(opportunity);
    await start(f.ad);
    f.end({ isEnded: isEnded as boolean });
    f.late({ isEnded: true });
    await expect(result).resolves.toEqual({ status });
    expect(f.close.size + f.errors.size).toBe(0);
    expect(f.ad.destroy).toHaveBeenCalledTimes(1);
    expect(f.sdk.createCanvas).not.toHaveBeenCalled();
  });

  it.each([
    ['taptap', 'tap'],
    ['wechat', 'wx'],
    ['bilibili', 'bl'],
  ] as const)('uses only the explicitly selected %s SDK', async (platform, key) => {
    const f = fixture();
    const bridge = createCreatorAdBridge({ ...configuration, platform }, { [key]: f.sdk });
    const result = bridge.offer(opportunity);
    await start(f.ad);
    f.end({ isEnded: true });
    await expect(result).resolves.toEqual({ status: 'completed' });
  });

  it('normalizes tt direct show and retains its singleton across recreated Creator hosts', async () => {
    const f = fixture();
    let destroyed!: () => void;
    const destruction = new Promise<void>((resolve) => {
      destroyed = resolve;
    });
    const ad = { ...f.ad, load: undefined, destroy: vi.fn(() => destruction) };
    const tt = {
      createRewardedVideoAd: vi.fn(function (this: unknown, options: unknown) {
        expect(this).toBe(tt);
        expect(options).toEqual({ adUnitId: 'native-placement', multiton: false });
        return ad;
      }),
    };
    const config = { ...configuration, platform: 'douyin' as const };
    const first = createCreatorAdBridge(config, { tt });
    const result = first.offer(opportunity);
    await start(f.ad);
    first.dispose();
    await expect(result).resolves.toEqual({ status: 'dismissed' });
    const next = createCreatorAdBridge(config, { tt });
    await expect(next.offer(opportunity)).resolves.toEqual({ status: 'unavailable' });
    f.end({ isEnded: true });
    expect(next.available).toBe(false);
    expect(ad.destroy).toHaveBeenCalledOnce();
    destroyed();
    await vi.waitFor(() => expect(next.available).toBe(true));
    const second = next.offer(opportunity);
    await vi.waitFor(() => expect(f.ad.show).toHaveBeenCalledTimes(2));
    f.end({ isEnded: false });
    await expect(second).resolves.toEqual({ status: 'dismissed' });
    expect(tt.createRewardedVideoAd).toHaveBeenCalledTimes(2);
    expect(f.ad.load).not.toHaveBeenCalled();
    expect(f.sdk.createCanvas).not.toHaveBeenCalled();
  });

  it('fails closed for missing, disabled, placeholder or mismatched platform configuration', async () => {
    const f = fixture();
    for (const config of [
      { ...configuration, adsEnabled: false },
      { ...configuration, adUnitId: '' },
      { ...configuration, adUnitId: 'YOUR_AD_UNIT_ID' },
      { ...configuration, platform: 'taptap-h5' as CreatorAdPlatform },
    ]) {
      const bridge = createCreatorAdBridge(config, { tap: f.sdk });
      expect(bridge.available).toBe(false);
      await expect(bridge.offer(opportunity)).resolves.toEqual({ status: 'unavailable' });
    }
    const wrongSdk = createCreatorAdBridge(configuration, { wx: f.sdk });
    await expect(wrongSdk.offer(opportunity)).resolves.toEqual({ status: 'unavailable' });
    const missingMethod = createCreatorAdBridge(configuration, { tap: {} });
    await expect(missingMethod.offer(opportunity)).resolves.toEqual({ status: 'unavailable' });
    expect(f.sdk.createRewardedVideoAd).not.toHaveBeenCalled();
  });

  it('uses the shared runtime policy and never queues a second gesture during playback', async () => {
    const f = fixture();
    const bridge = createCreatorAdBridge(
      configuration,
      { tap: f.sdk },
      {
        config: { platform: { maxPerSession: 1 } },
      },
    );
    const result = bridge.offer(opportunity);
    await expect(bridge.offer(opportunity)).resolves.toEqual({ status: 'unavailable' });
    await start(f.ad);
    f.end({ isEnded: true });
    await expect(result).resolves.toEqual({ status: 'completed' });
    await expect(bridge.offer(opportunity)).resolves.toEqual({ status: 'unavailable' });
    expect(f.sdk.createRewardedVideoAd).toHaveBeenCalledTimes(1);
  });

  it('can cancel before the runtime starts without ever calling the SDK', async () => {
    const f = fixture();
    const bridge = createCreatorAdBridge(configuration, { tap: f.sdk });
    const result = bridge.offer(opportunity);
    bridge.cancel();
    await expect(result).resolves.toEqual({ status: 'dismissed' });
    expect(f.sdk.createRewardedVideoAd).not.toHaveBeenCalled();
    expect(bridge.available).toBe(true);
  });

  it('holds the physical SDK lease across cancellation, disposal and a new game host', async () => {
    const f = fixture();
    const first = createCreatorAdBridge(configuration, { tap: f.sdk });
    const result = first.offer(opportunity);
    await start(f.ad);
    first.cancel();
    first.dispose();
    await expect(result).resolves.toEqual({ status: 'dismissed' });
    const next = createCreatorAdBridge(configuration, { tap: f.sdk });
    expect(first.pending).toBe(true);
    expect(next.available).toBe(false);
    await expect(next.offer(opportunity)).resolves.toEqual({ status: 'unavailable' });
    f.end({ isEnded: true });
    expect(first.pending).toBe(false);
    expect(next.available).toBe(true);
    expect(f.close.size + f.errors.size).toBe(0);
    await expect(first.offer(opportunity)).resolves.toEqual({ status: 'unavailable' });
    expect(f.sdk.createRewardedVideoAd).toHaveBeenCalledTimes(1);
  });

  it('waits for asynchronous singleton destruction before another request', async () => {
    const f = fixture();
    let destroyed!: () => void;
    f.ad.destroy.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          destroyed = resolve;
        }),
    );
    const bridge = createCreatorAdBridge(configuration, { tap: f.sdk });
    const result = bridge.offer(opportunity);
    await start(f.ad);
    f.end({ isEnded: true });
    await expect(result).resolves.toEqual({ status: 'completed' });
    expect(bridge.available).toBe(false);
    destroyed();
    await Promise.resolve();
    expect(bridge.available).toBe(true);
  });

  it('cleans up timed-out playback, rejects late completion and forbids unconfirmed reentry', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const bridge = createCreatorAdBridge(configuration, { tap: f.sdk }, { timeoutMs: 50 });
    const result = bridge.offer(opportunity);
    await start(f.ad);
    await vi.advanceTimersByTimeAsync(50);
    await expect(result).resolves.toEqual({ status: 'failed' });
    expect(f.close.size + f.errors.size).toBe(0);
    expect(f.ad.destroy).toHaveBeenCalledTimes(1);
    f.late({ isEnded: true });
    const next = createCreatorAdBridge(configuration, { tap: f.sdk });
    await expect(next.offer(opportunity)).resolves.toEqual({ status: 'unavailable' });
    expect(f.sdk.createRewardedVideoAd).toHaveBeenCalledTimes(1);
  });

  it('handles load failure and SDK exceptions without a reward or leaked listeners', async () => {
    const f = fixture();
    f.ad.load.mockRejectedValueOnce(Error('no fill'));
    const provider = createNativeAdProvider(f.sdk, 'native-placement');
    await expect(provider.show({ opportunityId: 'speed' })).resolves.toEqual({ status: 'failed' });
    expect(f.ad.show).not.toHaveBeenCalled();
    expect(f.close.size + f.errors.size).toBe(0);
    expect(provider.available).toBe(true);
    f.sdk.createRewardedVideoAd.mockImplementationOnce(() => {
      throw Error('SDK unavailable');
    });
    await expect(provider.show({ opportunityId: 'speed' })).resolves.toEqual({ status: 'failed' });
    expect(provider.available).toBe(true);
  });

  it('ignores stale close callbacks delivered before playback starts', async () => {
    const f = fixture();
    f.ad.onClose.mockImplementationOnce((listener) => {
      listener({ isEnded: true });
      f.close.add(listener);
    });
    const bridge = createCreatorAdBridge(configuration, { tap: f.sdk });
    const result = bridge.offer(opportunity);
    await start(f.ad);
    expect(bridge.pending).toBe(true);
    f.end({ isEnded: false });
    await expect(result).resolves.toEqual({ status: 'dismissed' });
  });

  it('installs only an advertising port, without browser globals or a second host', () => {
    const f = fixture();
    const environment: CreatorAdEnvironment = { tap: f.sdk };
    const bridge = installCreatorAdBridge(configuration, environment);
    expect(environment.SmallGamesRewardAds).toBe(bridge);
    expect(Object.keys(bridge).sort()).toEqual([
      'available',
      'cancel',
      'dispose',
      'offer',
      'pending',
    ]);
    expect(() => installCreatorAdBridge(configuration, environment)).toThrow(/already installed/);
    expect(f.sdk.createCanvas).not.toHaveBeenCalled();
    expect(f.sdk.createRewardedVideoAd).not.toHaveBeenCalled();
    bridge.dispose();
  });
});
