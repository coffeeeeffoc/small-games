/** Tap's close callback alone authorizes a reward; show/load only recover playback. */
export function createTapTapRewardedAds(sdk, adUnitId, timeoutMs = 120_000) {
  let pending,
    disposed = false,
    blocked = false;
  return {
    show() {
      if (
        disposed ||
        pending ||
        blocked ||
        typeof sdk?.createRewardedVideoAd !== 'function' ||
        typeof adUnitId !== 'string' ||
        !/^[\w-]{1,160}$/.test(adUnitId) ||
        /^(YOUR_|REPLACE_|TODO)/i.test(adUnitId)
      )
        return Promise.resolve({ status: 'unavailable' });
      return new Promise((resolve) => {
        let ad,
          timer,
          done = false,
          closed = false;
        const finish = (status) => {
          if (done) return;
          done = true;
          globalThis.clearTimeout(timer);
          pending = undefined;
          for (const [method, listener] of [
            ['offClose', close],
            ['offError', error],
          ]) {
            try {
              ad?.[method]?.(listener);
            } catch {
              /* Optional SDK cleanup. */
            }
          }
          // A cancelled, unclosed singleton cannot be reused until destruction succeeds.
          blocked = Boolean(ad && !closed);
          try {
            if (typeof ad?.destroy === 'function') {
              blocked = true;
              Promise.resolve(ad.destroy()).then(
                () => {
                  blocked = false;
                },
                () => {},
              );
            }
          } catch {
            /* Keep the old singleton leased if destruction fails. */
          }
          resolve({ status });
        };
        const close = (result) => {
          closed = true;
          finish(result?.isEnded === true ? 'completed' : 'dismissed');
        };
        const error = () => finish('failed');
        pending = () => finish('dismissed');
        timer = globalThis.setTimeout(() => finish('failed'), timeoutMs);
        try {
          ad = sdk.createRewardedVideoAd({ adUnitId });
          ad.onClose(close);
          ad.onError(error);
          Promise.resolve(ad.show()).catch(async () => {
            if (done) return;
            try {
              await ad.load();
              if (!done) await ad.show();
            } catch {
              error();
            }
          });
        } catch {
          error();
        }
      });
    },
    cancel() {
      pending?.();
    },
    dispose() {
      disposed = true;
      pending?.();
    },
  };
}
