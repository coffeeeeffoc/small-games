import {
  startNativeGame,
  type NativeSdk,
  type ReviewedModule,
} from '@coffeeeeffoc/native-game-shell';

/** wx owns the platform capabilities; no browser shim is needed by Canvas Games. */
export function startWechatGame(sdk: NativeSdk, game: ReviewedModule, adUnitId?: string) {
  return startNativeGame(sdk, async () => game, {
    platformId: 'wechat',
    adUnitId,
    sessionId: `wechat-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  });
}
