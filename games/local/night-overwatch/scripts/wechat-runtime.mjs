import '../../../../platforms/competition/legacy-polyfills.js';
import { connectGameServices } from '../../../../platforms/competition/game-bootstrap.js';
import { installCreatorAdBridge } from '../../../../packages/native-game-shell/src/creator-ads.ts';

/** Installed before Creator; wx owns storage and networking, Creator owns Canvas and lifecycle. */
export function installWechatRuntime(config, sdk = globalThis.wx) {
  if (!sdk) throw new Error('WeChat SDK is unavailable');
  const storage = {
    source: 'wechat',
    get length() { return sdk.getStorageInfoSync().keys.length; },
    key(index) { return sdk.getStorageInfoSync().keys[index] ?? null; },
    getItem(key) { const value = sdk.getStorageSync(key); return value == null || value === '' ? null : value; },
    setItem(key, value) { sdk.setStorageSync(key, String(value)); },
    removeItem(key) { sdk.removeStorageSync(key); },
  };
  globalThis.__nightStorage = storage;
  globalThis.__COMPETITION_CONFIG__ = Object.freeze(config.service);
  globalThis.SmallGamesPublishingConfig = Object.freeze(config.ads);
  installCreatorAdBridge(config.ads);
  globalThis.SmallGamesServices = connectGameServices();
  sdk.showShareMenu?.({ menus: ['shareAppMessage'] });
}
