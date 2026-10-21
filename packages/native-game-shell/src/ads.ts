import type { AdProvider } from '@coffeeeeffoc/ad-runtime';
import type { RewardOutcome } from '@coffeeeeffoc/game-contract';
import type { NativeSdk } from './sdk.js';

/** Advertising alone never needs a second Canvas or a second game lifecycle. */
export type NativeAdvertisingSdk = Pick<NativeSdk, 'createRewardedVideoAd'>;
export type NativeAdProvider = AdProvider & {
  readonly available: boolean;
  readonly pending: boolean;
  cancel(): void;
  dispose(): void;
};

// An SDK owns one physical ad surface, including across disposed/recreated game hosts.
const leases = new WeakMap<NativeAdvertisingSdk, object>();
export function isNativeAdUnitConfigured(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[\w-]{1,160}$/.test(value) &&
    !/^(YOUR_|REPLACE_|TODO)/i.test(value)
  );
}

/** Only an explicit SDK isEnded=true permits a reward. Cancellation never proves closure. */
export function createNativeAdProvider(
  sdk: NativeAdvertisingSdk,
  adUnitId?: string,
  timeoutMs = 120_000,
): NativeAdProvider {
  let disposed = false;
  let active: { cancel(): void } | undefined;
  const configured =
    isNativeAdUnitConfigured(adUnitId) && typeof sdk?.createRewardedVideoAd === 'function';
  const available = () => configured && !disposed && !leases.has(sdk);
  return Object.freeze({
    get available() {
      return available();
    },
    get pending() {
      return Boolean(active);
    },
    show() {
      if (!available()) return Promise.resolve<RewardOutcome>({ status: 'unavailable' });
      const lease = {};
      leases.set(sdk, lease);
      const releaseLease = () => {
        if (leases.get(sdk) === lease) leases.delete(sdk);
      };
      let ad: ReturnType<NonNullable<NativeAdvertisingSdk['createRewardedVideoAd']>>;
      try {
        ad = sdk.createRewardedVideoAd!({ adUnitId: adUnitId! });
      } catch {
        releaseLease();
        return Promise.resolve<RewardOutcome>({ status: 'failed' });
      }
      return new Promise<RewardOutcome>((resolve) => {
        let settled = false,
          finished = false,
          cancelled = false,
          opening = false;
        const settle = (status: RewardOutcome['status']) => {
          if (settled) return;
          settled = true;
          resolve({ status });
        };
        const finish = (status: RewardOutcome['status'], closed: boolean) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          if (active === operation) active = undefined;
          for (const cleanup of [() => ad.offClose(close), () => ad.offError(error)]) {
            try {
              cleanup();
            } catch {
              /* Stale callbacks still pass through the finished guard. */
            }
          }
          try {
            const destruction: unknown = ad.destroy();
            if (destruction && typeof (destruction as PromiseLike<unknown>).then === 'function') {
              // Some native SDKs asynchronously release a singleton ad instance.
              Promise.resolve(destruction).then(releaseLease, () => {});
            } else if (closed || !opening) releaseLease();
            // A timed-out open ad with no confirmed destruction stays unavailable.
          } catch {
            // Failed SDK destruction must not permit another physical playback.
          }
          settle(cancelled ? 'dismissed' : status);
        };
        const close = (result?: { isEnded?: boolean }) => {
          // A singleton SDK may replay an old close when a listener is attached.
          if (opening) finish(result?.isEnded === true ? 'completed' : 'dismissed', true);
        };
        const error = () => finish('failed', !opening);
        const operation = {
          cancel() {
            if (finished) return;
            cancelled = true;
            settle('dismissed');
            if (!opening) finish('dismissed', true);
            // An already opened SDK ad retains its lease/listeners until close or timeout.
          },
        };
        active = operation;
        const timer = setTimeout(() => finish('failed', false), Math.max(1, timeoutMs));
        try {
          ad.onClose(close);
          if (finished) return;
          ad.onError(error);
          if (finished) return;
          Promise.resolve(ad.load())
            .then(() => {
              if (finished) return;
              opening = true;
              return Promise.resolve(ad.show()).catch(() => finish('failed', true));
            })
            .catch(error);
        } catch {
          error();
        }
      });
    },
    cancel() {
      active?.cancel();
    },
    dispose() {
      disposed = true;
      active?.cancel();
    },
  });
}
