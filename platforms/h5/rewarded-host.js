import { createPlatformAdProvider } from './platform-ads.js';

// Standalone composition for games which expose an optional rewarded-action port.
const config = globalThis.SmallGamesPublishingConfig || {};
if (config.adMode === 'host' && !globalThis.SmallGamesRewardAds) {
  const provider = createPlatformAdProvider({
    platform: config.platform,
    adUnitId: config.adUnitId,
  });
  globalThis.SmallGamesRewardAds = {
    offer: ({ id }) => provider.show({ opportunityId: id, kind: 'rewarded' }),
    cancel: () => provider.dispose(),
  };
  addEventListener('pagehide', () => provider.dispose());
  addEventListener('visibilitychange', () => {
    if (document.hidden) provider.dispose();
  });
}
