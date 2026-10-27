/** Legacy publishing owns eligibility/frequency/pause; this port only runs Tap interstitials. */
export function createPublishingInterstitialProvider(environment, adUnitId) {
  let prepared,
    active,
    disposed = false,
    suspended = false;
  const safe = (fn) => {
    try {
      return fn();
    } catch {
      return undefined;
    }
  };
  const valid = /^[\w-]{1,160}$/.test(adUnitId || '') && !/^(YOUR_|REPLACE_|TODO)/i.test(adUnitId);
  function finish(item, status) {
    if (!item || item.closed) return;
    const wasActive = active === item;
    item.closed = true;
    clearTimeout(item.timer);
    safe(() => item.ad.offLoad?.(item.loaded));
    safe(() => item.ad.offError?.(item.error));
    safe(() => item.ad.offClose?.(item.close));
    Promise.resolve(safe(() => item.ad.destroy())).catch(() => {});
    if (prepared === item) prepared = undefined;
    if (active === item) active = undefined;
    item.resolve?.({ status });
    if (wasActive) queueMicrotask(preload);
  }
  function preload() {
    if (
      disposed ||
      suspended ||
      prepared ||
      active ||
      !valid ||
      environment.document?.hidden ||
      typeof environment.tap?.createInterstitialAd !== 'function'
    )
      return;
    const ad = safe(() => environment.tap.createInterstitialAd({ adUnitId }));
    if (!ad || typeof ad.destroy !== 'function') return;
    const item = { ad, ready: false, closed: false, displayed: false };
    prepared = item;
    item.loaded = () => {
      if (!item.closed) {
        item.ready = true;
        clearTimeout(item.timer);
      }
    };
    item.close = () => finish(item, 'dismissed');
    item.error = () => finish(item, 'failed');
    item.timer = setTimeout(item.error, 10000);
    try {
      ad.onLoad(item.loaded);
      ad.onClose(item.close);
      ad.onError(item.error);
      if (!item.closed) Promise.resolve(ad.load()).then(item.loaded, item.error);
    } catch {
      item.error();
    }
  }
  const cancel = () => {
    finish(active, 'dismissed');
    finish(prepared, 'dismissed');
  };
  const input = () => {
    if (active && !active.displayed) finish(active, 'dismissed');
  };
  const visibility = () => {
    if (environment.document?.hidden) input();
    else preload();
  };
  const pagehide = (event) => {
    suspended = true;
    if (event.persisted) cancel();
    else provider.dispose();
  };
  const pageshow = () => {
    suspended = false;
    preload();
  };
  const provider = {
    get pending() {
      return !!active;
    },
    show(request = {}) {
      if (
        disposed ||
        suspended ||
        active ||
        environment.SmallGamesRewardAds?.pending ||
        request.kind !== 'interstitial' ||
        !request.opportunityId ||
        environment.document?.hidden
      )
        return Promise.resolve({ status: 'unavailable' });
      if (!prepared?.ready) {
        preload();
        return Promise.resolve({ status: 'unavailable' });
      }
      const item = prepared;
      prepared = undefined;
      active = item;
      return new Promise((resolve) => {
        item.resolve = resolve;
        item.timer = setTimeout(() => finish(item, 'failed'), 2000);
        try {
          // Ready inventory only: never retry or show after a late load response.
          const showing = item.ad.show();
          if (!showing || typeof showing.then !== 'function') return finish(item, 'failed');
          showing.then(
            () => {
              if (!item.closed) {
                item.displayed = true;
                clearTimeout(item.timer);
              }
            },
            () => finish(item, 'failed'),
          );
        } catch {
          finish(item, 'failed');
        }
      });
    },
    dispose() {
      disposed = true;
      cancel();
      environment.removeEventListener?.('pointerdown', input, true);
      environment.removeEventListener?.('keydown', input, true);
      environment.removeEventListener?.('pagehide', pagehide);
      environment.removeEventListener?.('pageshow', pageshow);
      environment.document?.removeEventListener?.('visibilitychange', visibility);
    },
  };
  environment.addEventListener?.('pointerdown', input, true);
  environment.addEventListener?.('keydown', input, true);
  environment.addEventListener?.('pagehide', pagehide);
  environment.addEventListener?.('pageshow', pageshow);
  environment.document?.addEventListener?.('visibilitychange', visibility);
  preload();
  return provider;
}

/** Best-effort ads at completed-game breaks; never wait for inventory at a break. */
export function createInterstitials(environment, adUnitId, rewardBusy) {
  let prepared,
    active,
    disposed = false,
    count = 0,
    shown = 0;
  let lastAd = Date.now();
  const seen = new Set();
  const safe = (fn) => {
    try {
      return fn();
    } catch {
      return undefined;
    }
  };
  const destroy = (item) => {
    if (!item || item.closed) return;
    item.closed = true;
    clearTimeout(item.timer);
    safe(() => item.ad.offLoad?.(item.loaded));
    safe(() => item.ad.offError?.(item.finish));
    safe(() => item.ad.offClose?.(item.finish));
    Promise.resolve(safe(() => item.ad.destroy())).catch(() => {});
    if (prepared === item) prepared = undefined;
    if (active === item) active = undefined;
  };
  const preload = () => {
    if (disposed || prepared || active || shown >= 3 || !adUnitId) return;
    const sdk = environment.tap;
    if (typeof sdk?.createInterstitialAd !== 'function') return;
    const ad = safe(() => sdk.createInterstitialAd({ adUnitId }));
    if (!ad || typeof ad.destroy !== 'function') return;
    const item = { ad, ready: false, closed: false, displayed: false };
    prepared = item;
    item.loaded = () => {
      if (!item.closed) {
        item.ready = true;
        clearTimeout(item.timer);
      }
    };
    item.finish = () => destroy(item);
    item.timer = setTimeout(item.finish, 10000);
    try {
      ad.onLoad(item.loaded);
      ad.onError(item.finish);
      ad.onClose(item.finish);
      if (!item.closed) Promise.resolve(ad.load()).then(item.loaded, item.finish);
    } catch {
      item.finish();
    }
  };
  const cancel = () => {
    destroy(active);
  };
  const input = () => {
    if (active && !active.displayed) cancel();
  };
  const visibility = () => {
    if (environment.document?.hidden) input();
  };
  environment.addEventListener?.('pointerdown', input, true);
  environment.addEventListener?.('keydown', input, true);
  environment.document?.addEventListener?.('visibilitychange', visibility);
  preload();
  return {
    get pending() {
      return !!active;
    },
    noteReward() {
      lastAd = Date.now();
    },
    atBreak(id, isCurrent) {
      if (disposed || !id || seen.has(id)) return false;
      seen.add(id);
      if (seen.size > 128) seen.delete(seen.values().next().value);
      count++;
      if (
        environment.SmallGamesDev?.isEnabled?.() ||
        rewardBusy() ||
        active ||
        environment.document?.hidden ||
        count < 2 ||
        shown >= 3 ||
        Date.now() - lastAd < 120000 ||
        !safe(isCurrent)
      )
        return false;
      if (!prepared?.ready) {
        preload();
        return false;
      }
      const item = prepared;
      prepared = undefined;
      active = item;
      item.timer = setTimeout(item.finish, 2000);
      // No load/retry here: a late inventory response must never interrupt the next round.
      try {
        const result = item.ad.show();
        if (!result || typeof result.then !== 'function') {
          item.finish();
          return false;
        }
        lastAd = Date.now();
        shown++;
        result.then(() => {
          if (item.closed) return;
          item.displayed = true;
          clearTimeout(item.timer);
        }, item.finish);
      } catch {
        item.finish();
        return false;
      }
      return true;
    },
    cancel,
    dispose() {
      disposed = true;
      cancel();
      destroy(prepared);
      environment.removeEventListener?.('pointerdown', input, true);
      environment.removeEventListener?.('keydown', input, true);
      environment.document?.removeEventListener?.('visibilitychange', visibility);
    },
  };
}
