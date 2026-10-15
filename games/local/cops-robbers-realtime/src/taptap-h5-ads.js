// TapTap H5 supplies tap; ordinary browsers must keep advertising unavailable.
export function createTapTapAdProvider(sdk, adUnitId, timeoutMs = 44000) {
  let pending, disposed = false, blocked = false;
  return {
    show() {
      if (disposed || pending || blocked || !sdk?.createRewardedVideoAd || typeof adUnitId !== 'string' || !adUnitId.trim())
        return Promise.resolve({ status: 'unavailable' });
      return new Promise(resolve => {
        let ad, settled = false, closed = false, timer;
        const finish = status => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try { ad?.offClose(close); } catch {}
          try { ad?.offError(error); } catch {}
          pending = undefined;
          // Keep an unclosed SDK singleton leased until destruction is confirmed.
          blocked = Boolean(ad && !closed);
          if (blocked && typeof ad.destroy === 'function') {
            try { Promise.resolve(ad.destroy()).then(() => { blocked = false; }, () => {}); } catch {}
          }
          resolve({ status });
        };
        const close = result => { closed = true; finish(result?.isEnded === true ? 'completed' : 'dismissed'); };
        const error = () => finish('failed');
        pending = () => finish('dismissed');
        try {
          ad = sdk.createRewardedVideoAd({ adUnitId, multiton: false });
          ad.onClose(close);
          ad.onError(error);
          timer = setTimeout(() => finish('failed'), timeoutMs);
          Promise.resolve(ad.show()).catch(async () => {
            if (settled) return;
            try { await ad.load(); if (!settled) await ad.show(); } catch { error(); }
          });
        } catch { error(); }
      });
    },
    cancel() { pending?.(); },
    dispose() { disposed = true; pending?.(); },
  };
}
