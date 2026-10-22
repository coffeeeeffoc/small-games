import { createPlatformAdProvider } from '../platform-ads.js';

// Resolve the SDK per request for both H5 startup and the existing native caller.
export function createTapTapAdProvider(sdk, adUnitId, showTimeoutMs = 44000) {
  let disposed = false;
  const provider = createPlatformAdProvider({
    platform: 'taptap-h5',
    adUnitId,
    timeoutMs: showTimeoutMs,
    environment: {
      get tap() {
        try {
          const current = typeof sdk === 'function' ? sdk() : sdk;
          if (typeof current?.createRewardedVideoAd !== 'function') return undefined;
          return {
            createRewardedVideoAd: options =>
              current.createRewardedVideoAd({ ...options, multiton: false }),
          };
        } catch { return undefined; }
      },
    },
    onEvent: event => console.info('[TapTapReward]', JSON.stringify(event)),
  });
  return {
    show(request) {
      return disposed ? Promise.resolve({ status: 'unavailable' }) : provider.show(request);
    },
    cancel() { provider.cancel(); },
    dispose() { disposed = true; provider.dispose(); },
  };
}
