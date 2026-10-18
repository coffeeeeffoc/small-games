/** Tap rewards require an explicit completed close. The deadline covers opening only. */
export function createTapTapRewardedAds(sdk, adUnitId, timeoutMs = 45_000) {
  let slot,
    pending,
    disposed = false,
    blocked = false;
  const available = () =>
    !disposed &&
    !blocked &&
    typeof sdk?.createRewardedVideoAd === 'function' &&
    typeof adUnitId === 'string' &&
    /^[\w-]{1,160}$/.test(adUnitId) &&
    !/^(YOUR_|REPLACE_|TODO)/i.test(adUnitId);
  function retire(entry, closed = false) {
    if (!entry || entry.retired) return;
    entry.retired = true;
    entry.release?.();
    globalThis.clearTimeout(entry.preloadTimer);
    if (slot === entry) slot = undefined;
    for (const [method, listener] of [
      ['offClose', entry.close],
      ['offError', entry.error],
    ]) {
      try {
        entry.ad?.[method]?.(listener);
      } catch {
        /* Optional host cleanup. */
      }
    }
    // A cancelled or failed SDK singleton stays leased until destruction succeeds.
    blocked = !closed;
    try {
      if (typeof entry.ad?.destroy === 'function') {
        blocked = true;
        Promise.resolve(entry.ad.destroy()).then(
          () => {
            blocked = false;
          },
          () => {},
        );
      }
    } catch {
      blocked = true;
    }
  }
  function acquire() {
    if (slot) return slot;
    const entry = { ad: sdk.createRewardedVideoAd({ adUnitId }), retired: false };
    entry.retirement = new Promise((resolve) => {
      entry.release = resolve;
    });
    slot = entry;
    entry.close = (result) => {
      if (entry.retired) return;
      if (pending?.entry === entry)
        pending.finish(result?.isEnded === true ? 'completed' : 'dismissed', true);
    };
    entry.error = () => {
      if (entry.retired) return;
      if (pending?.entry === entry) pending.finish('failed');
      else retire(entry);
    };
    try {
      entry.ad.onClose(entry.close);
      entry.ad.onError(entry.error);
    } catch (error) {
      retire(entry);
      throw error;
    }
    return entry;
  }
  function load(entry) {
    if (!entry.loading) {
      try {
        entry.loading = Promise.resolve(entry.ad.load());
      } catch (error) {
        entry.loading = Promise.reject(error);
      }
      entry.loading = entry.loading.finally(() => {
        entry.loading = undefined;
      });
    }
    return entry.loading;
  }
  return {
    async preload() {
      if (!available() || pending) return false;
      let entry;
      try {
        entry = acquire();
        if (entry.retired) return false;
        if (!entry.loading)
          entry.preloadTimer = globalThis.setTimeout(() => {
            if (!pending && !entry.retired) retire(entry);
          }, timeoutMs);
        await Promise.race([load(entry), entry.retirement]);
        globalThis.clearTimeout(entry.preloadTimer);
        return !entry.retired && !disposed;
      } catch {
        globalThis.clearTimeout(entry?.preloadTimer);
        if (!pending && entry) retire(entry);
        return false;
      }
    },
    show({ onShown } = {}) {
      if (!available() || pending) return Promise.resolve({ status: 'unavailable' });
      return new Promise((resolve) => {
        let timer,
          done = false,
          entry;
        const request = { entry: undefined, finish };
        function finish(status, closed = false) {
          if (done) return;
          done = true;
          globalThis.clearTimeout(timer);
          if (pending === request) pending = undefined;
          retire(entry, closed);
          resolve({ status });
        }
        const shown = () => {
          if (done || pending !== request) return;
          globalThis.clearTimeout(timer);
          try {
            onShown?.();
          } catch {
            /* Observer cannot authorize a reward. */
          }
        };
        // Missing show promises retain the finite opening deadline.
        const attempt = () => {
          try {
            const result = entry.ad.show();
            if (result && typeof result.then === 'function')
              return Promise.resolve(result).then(shown);
            return Promise.resolve();
          } catch (error) {
            return Promise.reject(error);
          }
        };
        pending = request;
        timer = globalThis.setTimeout(() => finish('failed'), timeoutMs);
        try {
          entry = acquire();
          request.entry = entry;
          if (entry.retired) {
            finish('failed');
            return;
          }
          globalThis.clearTimeout(entry.preloadTimer);
          attempt().catch(async () => {
            if (done) return;
            try {
              await load(entry);
              if (!done) await attempt();
            } catch {
              finish('failed');
            }
          });
        } catch {
          finish('failed');
        }
      });
    },
    cancel() {
      pending?.finish('dismissed');
    },
    dispose() {
      disposed = true;
      if (pending) pending.finish('dismissed');
      else retire(slot);
    },
  };
}
