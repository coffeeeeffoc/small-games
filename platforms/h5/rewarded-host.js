import { createPlatformAdProvider } from './platform-ads.js';

// Standalone composition for games which expose an optional rewarded-action port.
const config = globalThis.SmallGamesPublishingConfig || {};
if (config.adMode === 'host' && !globalThis.SmallGamesRewardAds) {
  const diagnostics = { revision: 'h5-ad-open-timeout-20261019', events: [] };
  const record = (event) => {
    diagnostics.events.push({ at: Date.now(), ...event });
    if (diagnostics.events.length > 40) diagnostics.events.shift();
    try {
      localStorage.setItem('xiangqi-five-ad-diagnostics', JSON.stringify(diagnostics));
    } catch {
      /* Storage can be unavailable in the host WebView. */
    }
  };
  const provider = createPlatformAdProvider({
    platform: config.platform,
    adUnitId: config.adUnitId,
    onEvent: record,
  });
  globalThis.SmallGamesRewardAds = {
    timeoutMs: provider.timeoutMs,
    diagnostics,
    offer: ({ id, onShown }) => provider.show({ opportunityId: id, kind: 'rewarded', onShown }),
    cancel: () => provider.cancel(),
  };
  void provider.preload();
  addEventListener('visibilitychange', () =>
    record({ event: 'visibility', hidden: document.hidden }),
  );
  // Full-screen ads hide the document too; only an actual exit cancels their close callback.
  addEventListener('pagehide', () => provider.dispose());
}
