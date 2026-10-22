// Game-owned reward state; providers use the Game Host RewardOutcome contract.
(function (root) {
  root.WulongRewardHints = function ({ provider, timeoutMs = 180000 } = {}) {
    let generation = 0, remaining = 0, pending = false, providerBusy = false, cancel;
    const statuses = new Set(['completed', 'dismissed', 'unavailable', 'failed']);
    return {
      get available() { return provider?.available !== false && typeof provider?.show === 'function'; },
      get pending() { return pending; },
      get remaining() { return remaining; },
      reset() { this.cancel(); generation++; remaining = 0; },
      tick(seconds) { if (Number.isFinite(seconds) && seconds > 0) remaining = Math.max(0, remaining - seconds); },
      cancel() { cancel?.(); },
      async offer() {
        if (!this.available || pending || providerBusy || remaining > 0) return { status: 'unavailable' };
        const requested = generation;
        let timer, cancelled = false;
        pending = providerBusy = true;
        try {
          const interrupted = new Promise(resolve => {
            cancel = () => { cancelled = true; resolve({ status: 'dismissed' }); try { provider.cancel?.(); } catch {} };
            timer = setTimeout(() => { resolve({ status: 'failed' }); try { provider.cancel?.(); } catch {} }, timeoutMs);
          });
          const shown = Promise.resolve().then(() => cancelled ? { status: 'dismissed' } : provider.show({
            opportunityId: 'wulong-city:hint-highlight', kind: 'rewarded',
            onShown: () => clearTimeout(timer),
          })).finally(() => { providerBusy = false; });
          const result = await Promise.race([shown, interrupted]);
          const status = requested === generation && statuses.has(result?.status) ? result.status : 'dismissed';
          if (status === 'completed') remaining = 30;
          return { status };
        } catch { return { status: 'failed' }; }
        finally { clearTimeout(timer); cancel = undefined; pending = false; }
      },
    };
  };
})(globalThis);
