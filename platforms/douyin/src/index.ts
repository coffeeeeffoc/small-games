import { HostError } from '@coffeeeeffoc/game-contract';
import {
  startNativeGame,
  type NativeSdk,
  type ReviewedModule,
  normalizeDouyinAdvertisingSdk,
  type DouyinAdvertisingSdk,
} from '@coffeeeeffoc/native-game-shell';

/** Only the tt capabilities used by the shared runtime; no wx/bl globals or DOM. */
export interface DouyinSdk
  extends Omit<NativeSdk, 'getLogManager' | 'createRewardedVideoAd'>,
    DouyinAdvertisingSdk {}

const normalized = new WeakMap<DouyinSdk, NativeSdk>();

/** Translate tt's singleton ad ownership without changing the shared native runtime. */
export function createDouyinSdk(sdk: DouyinSdk): NativeSdk {
  const cached = normalized.get(sdk);
  if (cached) return cached;
  const adapter: NativeSdk = {
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
    // Mini-game tt returns '' for missing keys; genuine storage failures must propagate.
    getStorageSync: (key) => sdk.getStorageSync(key),
    setStorageSync: (key, value) => sdk.setStorageSync(key, value),
    removeStorageSync: (key) => sdk.removeStorageSync(key),
    // tt feedback logs require login; local single-player sessions do not request an account.
    getLogManager: () => ({ info: (...values) => console.info(...values) }),
    exitMiniProgram: (options) => sdk.exitMiniProgram(options),
    createRewardedVideoAd: normalizeDouyinAdvertisingSdk(sdk).createRewardedVideoAd,
  };
  normalized.set(sdk, adapter);
  return adapter;
}

export async function startDouyinGame(
  sdk: DouyinSdk | undefined,
  game: ReviewedModule,
  adUnitId?: string,
) {
  if (!sdk) throw new HostError({ code: 'UNAVAILABLE', message: 'Douyin tt SDK is unavailable' });
  return startNativeGame(createDouyinSdk(sdk), async () => game, {
    platformId: 'douyin',
    adUnitId,
    sessionId: `douyin-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  });
}
