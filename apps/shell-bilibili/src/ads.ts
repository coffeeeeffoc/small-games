import type { AdProvider } from '@coffeeeeffoc/ad-runtime';
import type { RewardOutcome } from '@coffeeeeffoc/game-contract';
import type { BilibiliSdk } from './sdk.js';

/** Channel-owned placement; only explicit SDK isEnded=true permits a reward. */
export function createBilibiliAdProvider(
  sdk: BilibiliSdk,
  adUnitId?: string,
  timeoutMs = 120_000,
): AdProvider {
  return {
    async show() {
      if (!adUnitId || !sdk.createRewardedVideoAd) return { status: 'unavailable' };
      const ad = sdk.createRewardedVideoAd({ adUnitId });
      return new Promise<RewardOutcome>((resolve) => {
        let done = false;
        const finish = (status: RewardOutcome['status']) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          for (const cleanup of [
            () => ad.offClose(close),
            () => ad.offError(error),
            () => ad.destroy(),
          ]) {
            try {
              cleanup();
            } catch {
              /* SDK cleanup failures do not change the validated outcome. */
            }
          }
          resolve({ status });
        };
        const close = (result?: { isEnded?: boolean }) =>
          finish(result?.isEnded === true ? 'completed' : 'dismissed');
        const error = () => finish('failed');
        const timer = setTimeout(() => finish('unavailable'), timeoutMs);
        try {
          ad.onClose(close);
          ad.onError(error);
          void ad
            .load()
            .then(() => {
              if (!done) return ad.show();
            })
            .catch(error);
        } catch {
          error();
        }
      });
    },
  };
}
