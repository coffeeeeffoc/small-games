import { createSimulationAdProvider } from '../publishing.js';
import { createPlatformAdProvider } from '../platform-ads.js';

let channelConfig, channelProvider;
/** Standalone Game Host composition; SDK selection stays out of gameplay and reward rules. */
export function hintAdProvider(environment = globalThis) {
  const config = environment.SmallGamesPublishingConfig;
  const host = environment.SmallGamesRewardAds;
  if (config?.adMode === 'off') return undefined;
  if (typeof host?.offer === 'function') return {
    show: () => host.offer({ id: 'cops-robbers:hint', reward: { hint: 1 } }),
    dispose: () => host.dispose?.(),
  };
  if (config?.provider) return config.provider;
  if (config?.platform) {
    if (channelConfig !== config) {
      channelConfig = config;
      channelProvider = createPlatformAdProvider({ platform: config.platform, adUnitId: config.adUnitId, environment });
    }
    return channelProvider;
  }
  return config?.adMode === 'host' ? undefined : createSimulationAdProvider();
}
