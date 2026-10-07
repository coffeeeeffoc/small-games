import { startNativeGame, type ReviewedModule } from '@coffeeeeffoc/native-game-shell';
import { normalizeAlipaySdk, type AlipaySdk } from '../normalize.mjs';

export { normalizeAlipaySdk, createAlipaySdk } from '../normalize.mjs';
export type { AlipaySdk } from '../normalize.mjs';

export function startAlipayGame(sdk: AlipaySdk | undefined, game: ReviewedModule) {
  return startNativeGame(normalizeAlipaySdk(sdk), async () => game, {
    platformId: 'alipay',
    sessionId: `alipay-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  });
}
