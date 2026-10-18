/** Explicit channel selection; a TapTap H5 release never falls back to wx/tt/bl or a mock. */
export function createPlatformAdProvider({
  platform,
  adUnitId,
  environment = globalThis,
  timeoutMs = 45000,
  onEvent,
}) {
  const globalName = { 'taptap-h5': 'tap', wechat: 'wx', douyin: 'tt', bilibili: 'bl' }[platform];
  let active,
    prepared,
    blocked = false;
  const trace = (event, detail = {}) => {
    try {
      onEvent?.({ event, ...detail });
    } catch {
      /* Diagnostics cannot interrupt rewards. */
    }
  };
  const sdkAvailable = () =>
    Boolean(globalName) &&
    typeof environment[globalName]?.createRewardedVideoAd === 'function' &&
    typeof adUnitId === 'string' &&
    /^[\w-]{1,160}$/.test(adUnitId) &&
    !/^(YOUR_|REPLACE_|TODO)/i.test(adUnitId);
  const release = (ad, closed = false) => {
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
  };
  return {
    timeoutMs: timeoutMs + 1000,
    preload() {
      if (platform !== 'taptap-h5' || active || blocked || !sdkAvailable())
        return Promise.resolve(false);
      if (prepared) return prepared.loaded;
      try {
        const item = { ad: environment[globalName].createRewardedVideoAd({ adUnitId }) };
        prepared = item;
        trace('preload');
        item.loaded = new Promise((resolve) => {
          let done = false,
            listening = false;
          const finish = (loaded) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            item.detach();
            trace(loaded ? 'loaded' : 'preload-failed');
            if (!loaded && prepared === item) {
              prepared = undefined;
              release(item.ad);
            }
            resolve(loaded);
          };
          const timer = setTimeout(() => finish(false), timeoutMs);
          item.cancel = () => finish(false);
          const error = (cause) => {
            if (done) return;
            trace('error', {
              phase: 'preloading',
              code: typeof cause?.errCode === 'number' ? cause.errCode : null,
            });
            finish(false);
          };
          item.detach = () => {
            if (!listening) return;
            listening = false;
            try {
              item.ad.offError?.(error);
            } catch {
              /* Optional SDK cleanup. */
            }
          };
          try {
            item.ad.onError(error);
            listening = true;
            Promise.resolve(item.ad.load()).then(() => finish(true), error);
          } catch (cause) {
            error(cause);
          }
        });
        return item.loaded;
      } catch {
        trace('preload-failed');
        return Promise.resolve(false);
      }
    },
    show(request = {}) {
      const sdk = globalName && environment[globalName];
      if (active || blocked || request.kind === 'interstitial' || !sdkAvailable()) {
        trace('unavailable');
        return Promise.resolve({ status: 'unavailable' });
      }
      return new Promise((resolve) => {
        let ad,
          warmup,
          phase = 'loading',
          done = false,
          closed = false;
        const finish = (status) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          warmup?.cancel();
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
          release(ad, closed);
          trace('result', { status });
          resolve({ status });
        };
        const close = (result) => {
          trace('close', {
            isEnded: typeof result?.isEnded === 'boolean' ? result.isEnded : null,
            completionType: typeof result?.isEnded,
          });
          closed = true;
          finish(result?.isEnded === true ? 'completed' : 'dismissed');
        };
        const error = (cause) => {
          if (done) return;
          trace('error', {
            phase,
            code: typeof cause?.errCode === 'number' ? cause.errCode : null,
          });
          finish('failed');
        };
        const expired = () => {
          trace('timeout', { phase });
          finish('failed');
        };
        let timer = setTimeout(expired, timeoutMs);
        active = () => {
          trace('cancel', { phase });
          finish('dismissed');
        };
        try {
          warmup = prepared;
          prepared = undefined;
          warmup?.detach();
          ad =
            warmup?.ad ||
            sdk.createRewardedVideoAd(
              platform === 'douyin' ? { adUnitId, multiton: false } : { adUnitId },
            );
          ad.onClose(close);
          ad.onError(error);
          trace('load', { preloaded: Boolean(warmup) });
          const loaded = warmup
            ? warmup.loaded
            : platform === 'douyin'
              ? Promise.resolve()
              : Promise.resolve(ad.load());
          void loaded
            .then((ready) => {
              if (done) return;
              if (warmup && !ready) return error();
              phase = 'opening';
              trace('show');
              const showing = ad.show();
              if (platform !== 'taptap-h5' || typeof showing?.then !== 'function') return showing;
              return showing.then(() => {
                if (done) return;
                // Only opening has a deadline; playback/end-card duration belongs to the SDK.
                clearTimeout(timer);
                phase = 'playing';
                trace('shown');
                request.onShown?.();
              });
            })
            .catch(error);
        } catch {
          error();
        }
      });
    },
    dispose() {
      active?.();
      if (prepared) {
        const item = prepared;
        prepared = undefined;
        item.cancel();
        release(item.ad);
      }
    },
  };
}
