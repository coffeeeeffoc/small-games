import { startNativeGame, type ReviewedModule } from '@coffeeeeffoc/native-game-shell';
import { normalizeTapTapSdk, type TapTapSdk } from '../normalize.mjs';

export { normalizeTapTapSdk } from '../normalize.mjs';
export type { TapTapSdk } from '../normalize.mjs';

/** Starts on the host's tap Canvas and lifecycle, with no DOM or other-platform aliases. */
export function startTapTapGame(sdk: TapTapSdk | undefined, game: ReviewedModule) {
  return startNativeGame(normalizeTapTapSdk(sdk), async () => game, {
    platformId: 'taptap',
    sessionId: `taptap-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  });
}
