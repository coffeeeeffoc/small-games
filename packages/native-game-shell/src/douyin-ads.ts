import type { NativeAdvertisingSdk } from './ads.js';
import type { RewardedVideoAd } from './sdk.js';

/** tt owns a singleton and exposes show directly, without the wx-style load API. */
export type DouyinAdvertisingSdk = {
  createRewardedVideoAd?(options: {
    adUnitId: string;
    multiton: false;
  }): Omit<RewardedVideoAd, 'load' | 'destroy'> & { destroy(): Promise<void> };
};
const normalized = new WeakMap<DouyinAdvertisingSdk, NativeAdvertisingSdk>();

/** Shared by Canvas and Creator hosts; identity and physical ownership survive host recreation. */
export function normalizeDouyinAdvertisingSdk(sdk: DouyinAdvertisingSdk): NativeAdvertisingSdk {
  const cached = normalized.get(sdk);
  if (cached) return cached;
  let adActive = false;
  const adapter: NativeAdvertisingSdk = {
    createRewardedVideoAd: sdk.createRewardedVideoAd
      ? ({ adUnitId }) => {
          if (adActive) throw new Error('Douyin rewarded video is already active');
          const ad = sdk.createRewardedVideoAd!({ adUnitId, multiton: false });
          adActive = true;
          let destruction: Promise<void> | undefined;
          return {
            load: async () => undefined,
            show: () => ad.show(),
            onClose: (listener) => ad.onClose(listener),
            offClose: (listener) => ad.offClose(listener),
            onError: (listener) => ad.onError(listener),
            offError: (listener) => ad.offError(listener),
            destroy() {
              // Rejection retains both leases: the old singleton may still be alive.
              destruction ??= (async () => {
                await ad.destroy();
                adActive = false;
              })();
              return destruction;
            },
          };
        }
      : undefined,
  };
  normalized.set(sdk, adapter);
  return adapter;
}
