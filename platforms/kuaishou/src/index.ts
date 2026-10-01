import { HostError } from '@coffeeeeffoc/game-contract';
import {
  startNativeGame,
  type NativeSdk,
  type ReviewedModule,
} from '@coffeeeeffoc/native-game-shell';

/** ks capabilities used by Canvas games. Advertising needs a separate verified adapter. */
export interface KuaishouSdk
  extends Omit<NativeSdk, 'getLogManager' | 'createRewardedVideoAd' | 'exitMiniProgram'> {
  exitMiniProgram?(options: { success(): void; fail(): void }): void;
}

/** Preserve SDK receivers and storage failures; no browser, wx or tt compatibility globals. */
export function createKuaishouSdk(sdk: KuaishouSdk): NativeSdk {
  const required = [
    'createCanvas',
    'getSystemInfoSync',
    'onTouchEnd',
    'offTouchEnd',
    'onHide',
    'offHide',
    'onShow',
    'offShow',
    'getStorageSync',
    'setStorageSync',
    'removeStorageSync',
  ] as const;
  for (const method of required) {
    if (typeof sdk[method] !== 'function')
      throw new HostError({ code: 'UNAVAILABLE', message: `Kuaishou ks.${method} is unavailable` });
  }
  return {
    createCanvas: () => sdk.createCanvas(),
    createImage: sdk.createImage?.bind(sdk),
    createInnerAudioContext: sdk.createInnerAudioContext?.bind(sdk),
    getSystemInfoSync: () => sdk.getSystemInfoSync(),
    onTouchStart: sdk.onTouchStart?.bind(sdk),
    offTouchStart: sdk.offTouchStart?.bind(sdk),
    onTouchMove: sdk.onTouchMove?.bind(sdk),
    offTouchMove: sdk.offTouchMove?.bind(sdk),
    onTouchEnd: (listener) => sdk.onTouchEnd(listener),
    offTouchEnd: (listener) => sdk.offTouchEnd(listener),
    onTouchCancel: sdk.onTouchCancel?.bind(sdk),
    offTouchCancel: sdk.offTouchCancel?.bind(sdk),
    onHide: (listener) => sdk.onHide(listener),
    offHide: (listener) => sdk.offHide(listener),
    onShow: (listener) => sdk.onShow(listener),
    offShow: (listener) => sdk.offShow(listener),
    getStorageSync: (key) => sdk.getStorageSync(key),
    setStorageSync: (key, value) => sdk.setStorageSync(key, value),
    removeStorageSync: (key) => sdk.removeStorageSync(key),
    getLogManager: () => ({ info: (...values) => console.info(...values) }),
    exitMiniProgram: (options) => {
      if (sdk.exitMiniProgram) sdk.exitMiniProgram(options);
      else options.fail();
    },
  };
}

export function startKuaishouGame(sdk: KuaishouSdk | undefined, game: ReviewedModule) {
  if (!sdk) throw new HostError({ code: 'UNAVAILABLE', message: 'Kuaishou ks SDK is unavailable' });
  return startNativeGame(createKuaishouSdk(sdk), async () => game, {
    platformId: 'kuaishou',
    sessionId: `kuaishou-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  });
}
