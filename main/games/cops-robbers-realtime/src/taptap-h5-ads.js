// TapTap H5 supplies tap; ordinary browsers must keep advertising unavailable.
export function createTapTapAdProvider(sdk, adUnitId) {
  let pending, disposed = false;
  return {
    show() {
      if (disposed || pending || !sdk?.createRewardedVideoAd || typeof adUnitId !== 'string' || !adUnitId.trim())
        return Promise.resolve({ status: 'unavailable' });
      return new Promise(resolve => {
        let ad, settled = false, timer;
        const finish = status => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try { ad?.offClose(close); } catch {}
          try { ad?.offError(error); } catch {}
          pending = undefined;
          resolve({ status });
        };
        const close = result => finish(result?.isEnded === true ? 'completed' : 'dismissed');
        const error = () => finish('failed');
        pending = () => finish('dismissed');
        try {
          ad = sdk.createRewardedVideoAd({ adUnitId, multiton: false });
          ad.onClose(close);
          ad.onError(error);
          timer = setTimeout(() => finish('failed'), 44000);
          Promise.resolve(ad.show()).catch(async () => {
            if (settled) return;
            try { await ad.load(); if (!settled) await ad.show(); } catch { error(); }
          });
        } catch { error(); }
      });
    },
    dispose() { disposed = true; pending?.(); },
  };
}
