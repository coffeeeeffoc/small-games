import { createTapGameServices } from './game-services.mjs';
import { startTapServiceScreen } from './service-screen.mjs';
export function openNativeTapPortal(options) {
  const { sdk, config, savePort } = options;
  if (config.competitionEnabled) globalThis.__installCompetition(config, sdk);
  const storage = {
    getItem: (key) => sdk.getStorageSync(key),
    setItem: (key, value) => sdk.setStorageSync(key, value),
  };
  const services = createTapGameServices({
    sdk,
    config,
    savePort,
    storage,
    backendSession: config.competitionEnabled
      ? () => globalThis.__competition.session()
      : undefined,
  });
  return startTapServiceScreen({ ...options, services });
}
