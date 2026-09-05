import {
  HostError,
  gameManifestSchema,
  type GameDefinition,
  type GameInstance,
} from '@coffeeeeffoc/game-contract';
import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import type { CultivationCanvasTarget } from '@coffeeeeffoc/game-cultivation/canvas';
import { createBilibiliGameHost } from './host.js';
import type { BilibiliSdk } from './sdk.js';

/** Trusted local module provided only after its declared package loads. */
export type ReviewedModule = {
  definition: GameDefinition<CultivationCanvasTarget>;
  content: DynamicContentEnvelope;
};

/** Only this immutable, locally reviewed package name is accepted; URL strings are never loaded. */
export async function loadReviewedGame(
  sdk: BilibiliSdk | undefined,
  name: string,
  getReviewedModule: () => ReviewedModule,
  timeoutMs = 5_000,
): Promise<ReviewedModule> {
  if (name !== 'cultivation')
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
    manifest.entry !== 'cultivation/game.js'
  )
    throw new HostError({ code: 'INVALID_INPUT', message: 'Unreviewed Game Manifest' });
  return module;
}

/** Starts the reviewed native Game and owns SDK visibility subscriptions. */
export async function startBilibiliShell(
  sdk: BilibiliSdk | undefined,
  getReviewedModule: () => ReviewedModule,
  options: { adUnitId?: string; sessionId: string },
): Promise<GameInstance> {
  if (!sdk) throw new HostError({ code: 'UNAVAILABLE', message: 'Bilibili SDK is unavailable' });
  let instance: GameInstance | null = null;
  let hidden = false;
  let disposed = false;
  let disposal: Promise<void> | null = null;
  const report = (error: unknown) => {
    try {
      sdk.getLogManager().info({
        event: 'game-lifecycle-failed',
        sessionId: options.sessionId,
        message: String(error),
      });
    } catch {
      /* Observational SDK failures must not escape lifecycle callbacks. */
    }
  };
  const pause = () => {
    if (!disposed) {
      hidden = true;
      instance?.pause();
    }
  };
  const resume = () => {
    if (!disposed) {
      hidden = false;
      instance?.resume();
    }
  };
  const onHide = () => {
    try {
      pause();
    } catch (error) {
      report(error);
    }
  };
  const onShow = () => {
    try {
      resume();
    } catch (error) {
      report(error);
    }
  };
  const cleanup = async () => {
    disposed = true;
    for (const stop of [() => sdk.offHide(onHide), () => sdk.offShow(onShow)]) {
      try {
        stop();
      } catch (error) {
        report(error);
      }
    }
    await instance?.dispose();
  };
  const dispose = () => {
    disposal ??= cleanup();
    return disposal;
  };
  try {
    sdk.onHide(onHide);
    sdk.onShow(onShow);
    const module = await loadReviewedGame(sdk, 'cultivation', getReviewedModule);
    const canvas = sdk.createCanvas();
    const dimensions = sdk.getSystemInfoSync();
    canvas.width = dimensions.windowWidth;
    canvas.height = dimensions.windowHeight;
    const host = createBilibiliGameHost(sdk, module.definition.manifest, module.content, options);
    instance = await module.definition.mount(
      {
        canvas,
        onTap(listener) {
          const touch = (event: {
            changedTouches: Array<{ clientX: number; clientY: number }>;
          }) => {
            const first = event.changedTouches[0];
            if (first) listener(first.clientX, first.clientY);
          };
          sdk.onTouchEnd(touch);
          return () => sdk.offTouchEnd(touch);
        },
      },
      host,
    );
    if (hidden) instance.pause();
    return { pause, resume, dispose };
  } catch (error) {
    await dispose().catch(report);
    throw error;
  }
}
