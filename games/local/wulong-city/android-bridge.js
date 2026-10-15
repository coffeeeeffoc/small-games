// Present only inside the installed APK; the Java bridge never exposes credentials.
(function (root) {
  const host = root.WulongAndroidHost;
  if (!host || typeof host.capabilities !== 'function') return;
  let config;
  try { config = JSON.parse(host.capabilities()); } catch { return; }
  let sequence = 0, active;
  const provider = {
    show(request) {
      if (!config.rewarded || active || request.kind !== 'rewarded' || request.opportunityId !== 'wulong-city:hint-highlight')
        return Promise.resolve({ status: 'unavailable' });
      return new Promise(resolve => {
        const id = String(++sequence);
        active = { id, resolve };
        try { host.showRewarded(id, request.opportunityId); }
        catch { root.WulongNative.deliver(id, 'failed'); }
      });
    },
    cancel() {
      if (!active) return;
      const id = active.id;
      try { host.cancelRewarded(id); } finally { root.WulongNative.deliver(id, 'dismissed'); }
    },
  };
  root.WulongNative = {
    provider: config.rewarded ? provider : undefined,
    deliver(id, status) {
      if (!active || active.id !== id) return;
      const resolve = active.resolve;
      active = undefined;
      resolve({ status: ['completed', 'dismissed', 'unavailable', 'failed'].includes(status) ? status : 'failed' });
    },
    share(text) { host.share(String(text).slice(0, 500)); },
    privacy() { host.privacy(); },
    exit() { host.exit(); },
  };
  root.addEventListener('pagehide', () => provider.cancel());
})(globalThis);
