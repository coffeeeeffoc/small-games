import { HostError, type GameDefinition, type GameInstance } from '@coffeeeeffoc/game-contract';
import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import type { CanvasGameTarget, CanvasPointerEvent } from '@coffeeeeffoc/canvas-game-adapter';
import { createNativeGameHost } from './host.js';
import { createNativeMedia } from './media.js';
import type { NativeSdk, TouchEvent } from './sdk.js';

/** Trusted local module provided only after its declared package loads. */
export type ReviewedModule = {
  definition: GameDefinition<CanvasGameTarget>;
  content: DynamicContentEnvelope;
};

/** Starts the reviewed native Game and owns SDK visibility subscriptions. */
export async function startNativeGame(
  sdk: NativeSdk | undefined,
  loadGame: () => Promise<ReviewedModule>,
  options: {
    adUnitId?: string;
    sessionId: string;
    platformId: string;
    resourceRoot?: string;
    canvas?: CanvasGameTarget['canvas'];
  },
): Promise<GameInstance> {
  if (!sdk) throw new HostError({ code: 'UNAVAILABLE', message: 'Native SDK is unavailable' });
  let instance: GameInstance | null = null;
  let hidden = false;
  let disposed = false;
  let disposal: Promise<void> | null = null;
  const subscriptions = new Set<() => void>();
  const cancelPointers = new Set<() => void>();
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
  const safely = (run: () => void) => {
    try {
      run();
    } catch (error) {
      report(error);
    }
  };
  const remember = (stop: () => void) => {
    const unsubscribe = () => {
      if (!subscriptions.delete(unsubscribe)) return;
      safely(stop);
    };
    subscriptions.add(unsubscribe);
    return unsubscribe;
  };
  const media = createNativeMedia(
    sdk,
    options.resourceRoot ?? '',
    () => !hidden && !disposed,
    report,
  );
  const pause = () => {
    if (!disposed) {
      hidden = true;
      for (const cancel of cancelPointers) safely(cancel);
      media.pause();
      instance?.pause();
    }
  };
  const resume = () => {
    if (!disposed) {
      hidden = false;
      instance?.resume();
    }
  };
  const onHide = () => safely(pause);
  const onShow = () => safely(resume);
  const atTouch = (listener: (x: number, y: number) => void) => (event: TouchEvent) => {
    const first = event.changedTouches[0];
    if (first && !hidden && !disposed) listener(first.clientX, first.clientY);
  };
  const cleanup = async () => {
    disposed = true;
    for (const cancel of cancelPointers) safely(cancel);
    for (const stop of subscriptions) stop();
    media.dispose();
    safely(() => sdk.offHide(onHide));
    safely(() => sdk.offShow(onShow));
    await instance?.dispose();
  };
  const dispose = () => (disposal ??= cleanup());
  try {
    sdk.onHide(onHide);
    sdk.onShow(onShow);
    const module = await loadGame();
    const canvas = options.canvas ?? sdk.createCanvas();
    const dimensions = sdk.getSystemInfoSync();
    canvas.width = dimensions.windowWidth;
    canvas.height = dimensions.windowHeight;
    const host = createNativeGameHost(sdk, module.definition.manifest, module.content, options);
    instance = await module.definition.mount(
      {
        canvas,
        onTap(listener) {
          const touch = atTouch(listener);
          sdk.onTouchEnd(touch);
          return remember(() => sdk.offTouchEnd(touch));
        },
        onPress:
          sdk.onTouchStart && sdk.offTouchStart
            ? (start, end) => {
                const touchStart = atTouch(start);
                const touchEnd = () => end();
                sdk.onTouchStart?.(touchStart);
                sdk.onTouchEnd(touchEnd);
                sdk.onTouchCancel?.(touchEnd);
                cancelPointers.add(touchEnd);
                return remember(() => {
                  safely(() => sdk.offTouchStart?.(touchStart));
                  safely(() => sdk.offTouchEnd(touchEnd));
                  safely(() => sdk.offTouchCancel?.(touchEnd));
                  cancelPointers.delete(touchEnd);
                });
              }
            : undefined,
        onPointer:
          sdk.onTouchStart &&
          sdk.offTouchStart &&
          sdk.onTouchMove &&
          sdk.offTouchMove &&
          sdk.onTouchCancel &&
          sdk.offTouchCancel
            ? (listener) => {
                const active = new Map<number, CanvasPointerEvent>();
                const cancel = () => {
                  const pointers = [...active.values()];
                  active.clear();
                  for (const pointer of pointers) listener({ ...pointer, phase: 'cancel' });
                };
                const touch = (phase: CanvasPointerEvent['phase']) => (event: TouchEvent) => {
                  if (hidden || disposed) return;
                  if (phase === 'cancel' && event.changedTouches.length === 0) return cancel();
                  for (const point of event.changedTouches) {
                    const pointerId = point.identifier ?? 0;
                    if (phase !== 'down' && !active.has(pointerId)) continue;
                    const pointer = { phase, x: point.clientX, y: point.clientY, pointerId };
                    if (phase === 'down' || phase === 'move') active.set(pointerId, pointer);
                    else active.delete(pointerId);
                    listener(pointer);
                  }
                };
                const down = touch('down');
                const move = touch('move');
                const up = touch('up');
                const cancelled = touch('cancel');
                sdk.onTouchStart?.(down);
                sdk.onTouchMove?.(move);
                sdk.onTouchEnd(up);
                sdk.onTouchCancel?.(cancelled);
                cancelPointers.add(cancel);
                return remember(() => {
                  active.clear();
                  safely(() => sdk.offTouchStart?.(down));
                  safely(() => sdk.offTouchMove?.(move));
                  safely(() => sdk.offTouchEnd(up));
                  safely(() => sdk.offTouchCancel?.(cancelled));
                  cancelPointers.delete(cancel);
                });
              }
            : undefined,
        ...media.target,
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
