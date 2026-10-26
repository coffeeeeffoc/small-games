import { createPublishingInterstitialProvider } from './interstitial.js';

/** Only packages with existing natural-break ads install this optional provider. */
export function installPublishingHost(environment = globalThis) {
  const config = environment.SmallGamesPublishingConfig;
  if (
    !config ||
    config.provider !== undefined ||
    config.adsEnabled !== true ||
    config.adMode !== 'host' ||
    config.platform !== 'taptap-h5' ||
    !config.publishingInterstitials ||
    !/^[\w-]{1,160}$/.test(config.interstitialAdUnitId || '') ||
    /^(YOUR_|REPLACE_|TODO)/i.test(config.interstitialAdUnitId)
  )
    return;
  const provider = createPublishingInterstitialProvider(environment, config.interstitialAdUnitId);
  environment.SmallGamesPublishingConfig = Object.freeze({ ...config, provider });
  return provider;
}

if (typeof window !== 'undefined') installPublishingHost();
