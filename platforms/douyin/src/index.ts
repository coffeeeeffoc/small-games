import { HostError } from '@coffeeeeffoc/game-contract';
import {
  startNativeGame,
  type NativeSdk,
  type ReviewedModule,
  type RewardedVideoAd,
} from '@coffeeeeffoc/native-game-shell';

/** Only the tt capabilities used by the shared runtime; no wx/bl globals or DOM. */
export interface DouyinSdk extends Omit<NativeSdk, 'getLogManager' | 'createRewardedVideoAd'> {
  createRewardedVideoAd?(options: {
    adUnitId: string;
    multiton: false;
  }): Omit<RewardedVideoAd, 'load' | 'destroy'> & { destroy(): Promise<void> };
}

/** Translate tt's singleton ad ownership without changing the shared native runtime. */
export function createDouyinSdk(sdk: DouyinSdk): NativeSdk {
  let adActive = false;
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
    // Mini-game tt returns '' for missing keys; genuine storage failures must propagate.
    getStorageSync: (key) => sdk.getStorageSync(key),
    setStorageSync: (key, value) => sdk.setStorageSync(key, value),
    removeStorageSync: (key) => sdk.removeStorageSync(key),
    // tt feedback logs require login; local single-player sessions do not request an account.
    getLogManager: () => ({ info: (...values) => console.info(...values) }),
    exitMiniProgram: (options) => sdk.exitMiniProgram(options),
    createRewardedVideoAd: sdk.createRewardedVideoAd
      ? ({ adUnitId }) => {
          if (adActive) throw new Error('Douyin rewarded video is already active');
          const ad = sdk.createRewardedVideoAd!({ adUnitId, multiton: false });
          adActive = true;
          let destroying = false;
          return {
            // tt recommends show directly; the shared provider still owns completion and cleanup.
            load: async () => undefined,
            show: () => ad.show(),
            onClose: (listener) => ad.onClose(listener),
            offClose: (listener) => ad.offClose(listener),
            onError: (listener) => ad.onError(listener),
            offError: (listener) => ad.offError(listener),
            destroy() {
              if (destroying) return;
              destroying = true;
              // Detaching listeners does not stop an old ad from notifying the next request.
              try {
                void ad.destroy().then(
                  () => {
                    adActive = false;
                  },
                  () => {
                    /* Keep the lease: the old SDK operation may still be alive. */
                  },
                );
              } catch {
                // Missing/throwing destroy is also fail-closed, never a reusable singleton.
              }
            },
          };
        }
      : undefined,
  };
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
