// TapTap H5 supplies tap; ordinary browsers must keep advertising unavailable.
export function createTapTapAdProvider(sdk, adUnitId, showTimeoutMs = 44000) {
  let pending, disposed = false, blocked = false;
  return {
    show() {
      let currentSdk;
      try { currentSdk = typeof sdk === 'function' ? sdk() : sdk; } catch {}
      if (disposed || pending || blocked || !currentSdk?.createRewardedVideoAd || typeof adUnitId !== 'string' || !adUnitId.trim())
        return Promise.resolve({ status: 'unavailable' });
      return new Promise(resolve => {
        let ad, settled = false, closed = false, timer;
        const startedAt = Date.now();
        const trace = (event, detail = {}) => console.info('[TapTapReward]', JSON.stringify({ event, elapsedMs: Date.now() - startedAt, ...detail }));
        const finish = (status, reason) => {
          if (settled) return;
          settled = true;
          trace('settled', { status, reason });
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
        const close = result => {
          trace('close', { isEnded: result?.isEnded === true, valueType: typeof result?.isEnded, ignored: settled });
          closed = true;
          finish(result?.isEnded === true ? 'completed' : 'dismissed', 'sdk-close');
        };
        const error = () => finish('failed', 'sdk-error');
        const shown = () => { if (settled) return; clearTimeout(timer); trace('shown', { ignored: false }); };
        const attempt = () => {
          if (settled) return;
          const opening = ad.show();
          // A missing Promise is not evidence that the native video opened.
          if (typeof opening?.then === 'function') return Promise.resolve(opening).then(shown);
        };
        pending = reason => finish('dismissed', reason);
        try {
          trace('requested');
          ad = currentSdk.createRewardedVideoAd({ adUnitId, multiton: false });
          ad.onClose(close);
          if (settled) return;
          ad.onError(error);
          if (settled) return;
          // Limit opening time only; displayed ads own their duration until the SDK closes them.
          timer = setTimeout(() => finish('failed', 'open-timeout'), showTimeoutMs);
          Promise.resolve().then(attempt).catch(async () => {
            if (settled) return;
            trace('retry-load');
            try {
              await ad.load();
              if (!settled) await attempt();
            } catch { error(); }
          });
        } catch { error(); }
      });
    },
    cancel() { pending?.('cancel'); },
    dispose() { disposed = true; pending?.('dispose'); },
  };
}
