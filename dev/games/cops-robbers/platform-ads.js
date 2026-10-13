/** Explicit channel selection; a TapTap H5 release never falls back to wx/tt/bl or a mock. */
export function createPlatformAdProvider({
  platform,
  adUnitId,
  environment = globalThis,
  timeoutMs = 45000,
}) {
  const globalName = { 'taptap-h5': 'tap', wechat: 'wx', douyin: 'tt', bilibili: 'bl' }[platform];
  let active,
    blocked = false;
  return {
    show(request = {}) {
      const sdk = globalName && environment[globalName];
      if (
        active ||
        blocked ||
        request.kind === 'interstitial' ||
        typeof sdk?.createRewardedVideoAd !== 'function' ||
        typeof adUnitId !== 'string' ||
        !/^[\w-]{1,160}$/.test(adUnitId) ||
        /^(YOUR_|REPLACE_|TODO)/i.test(adUnitId)
      )
        return Promise.resolve({ status: 'unavailable' });
      return new Promise((resolve) => {
        let ad,
          done = false,
          closed = false;
        const finish = (status) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          active = undefined;
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
          // tt owns a singleton: never give a new request listeners until destroy resolves.
          blocked = true;
          try {
            if (typeof ad?.destroy === 'function') {
              const destruction = ad.destroy();
              if (platform !== 'douyin' || typeof destruction?.then === 'function')
                Promise.resolve(destruction).then(
                  () => {
                    blocked = false;
                  },
                  () => {},
                );
            } else if (!ad || (closed && platform !== 'douyin')) blocked = false;
          } catch {
            /* Failed destruction keeps the old operation leased. */
          }
          resolve({ status });
        };
        const close = (result) => {
          closed = true;
          finish(result?.isEnded === true ? 'completed' : 'dismissed');
        };
        const error = () => finish('failed');
        const timer = setTimeout(() => finish('failed'), timeoutMs);
        active = () => finish('dismissed');
        try {
          ad = sdk.createRewardedVideoAd(
            platform === 'douyin' ? { adUnitId, multiton: false } : { adUnitId },
          );
          ad.onClose(close);
          ad.onError(error);
          const loaded = platform === 'douyin' ? Promise.resolve() : Promise.resolve(ad.load());
          void loaded
            .then(() => {
              if (!done) return ad.show();
            })
            .catch(error);
        } catch {
          error();
        }
      });
    },
    dispose() {
      active?.();
    },
  };
}
