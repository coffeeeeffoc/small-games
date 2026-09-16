import { HostError, gameManifestSchema, type GameInstance } from '@coffeeeeffoc/game-contract';
import { startNativeGame, type ReviewedModule } from '@coffeeeeffoc/native-game-shell';
import type { BilibiliSdk } from './sdk.js';
export type { ReviewedModule } from '@coffeeeeffoc/native-game-shell';

/** Only this immutable, locally reviewed package name is accepted; URL strings are never loaded. */
export async function loadReviewedGame(
  sdk: BilibiliSdk | undefined,
  name: string,
  getReviewedModule: () => ReviewedModule,
  timeoutMs = 5_000,
): Promise<ReviewedModule> {
  if (!['cultivation', 'office', 'arena', 'cricket'].includes(name))
    throw new HostError({
      code: 'INVALID_INPUT',
      message: 'Only predeclared Game packages are allowed',
    });
  if (!sdk?.loadSubpackage)
    throw new HostError({ code: 'UNAVAILABLE', message: 'Bilibili SDK is unavailable' });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new HostError({ code: 'TIMEOUT', message: 'Subpackage load timed out' })),
      timeoutMs,
    );
    try {
      sdk.loadSubpackage({
        name,
        success() {
          clearTimeout(timer);
          resolve();
        },
        fail() {
          clearTimeout(timer);
          reject(new HostError({ code: 'UNAVAILABLE', message: 'Subpackage load failed' }));
        },
        complete() {},
      });
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
  const module = getReviewedModule();
  const manifest = gameManifestSchema.parse(module.definition.manifest);
  if (
    manifest.gameId !== name ||
    !manifest.loadModes.includes('bilibili-subpackage') ||
    manifest.entry !== `${name}/game.js`
  )
    throw new HostError({ code: 'INVALID_INPUT', message: 'Unreviewed Game Manifest' });
  return module;
}

export function startBilibiliShell(
  sdk: BilibiliSdk | undefined,
  getReviewedModule: () => ReviewedModule,
  options: {
    adUnitId?: string;
    sessionId: string;
    gameId?: 'cultivation' | 'office' | 'arena' | 'cricket';
    canvas?: Parameters<typeof startNativeGame>[2]['canvas'];
  },
): Promise<GameInstance> {
  return startNativeGame(
    sdk,
    () => loadReviewedGame(sdk, options.gameId ?? 'cultivation', getReviewedModule),
    {
      ...options,
      platformId: 'bilibili',
      resourceRoot: options.gameId ?? 'cultivation',
    },
  );
}
