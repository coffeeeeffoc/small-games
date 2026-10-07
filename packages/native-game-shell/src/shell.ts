import { HostError, type GameDefinition, type GameInstance } from '@coffeeeeffoc/game-contract';
import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import type { CanvasGameTarget, CanvasPointerEvent } from '@coffeeeeffoc/canvas-game-adapter';
import { createNativeGameHost } from './host.js';
import { createNativeMedia } from './media.js';
import type { NativeSdk, TouchEvent } from './sdk.js';
import { createNativeViewport, type NativeViewportOptions } from './viewport.js';
export type { NativeViewportOptions } from './viewport.js';
export type ReviewedModule = {
  definition: GameDefinition<CanvasGameTarget>;
  content: DynamicContentEnvelope;
  viewport?: NativeViewportOptions;
};
export async function startNativeGame(
  sdk: NativeSdk | undefined,
  loadGame: () => Promise<ReviewedModule>,
  options: {
    adUnitId?: string;
    sessionId: string;
    platformId: string;
    resourceRoot?: string;
    canvas?: CanvasGameTarget['canvas'];
    viewport?: NativeViewportOptions;
  },
): Promise<GameInstance> {
  if (!sdk) throw new HostError({ code: 'UNAVAILABLE', message: 'Native SDK is unavailable' });
  const { sessionId } = options,
    event = 'game-lifecycle-failed';
  let instance: GameInstance | null = null;
  let hidden = false;
  let disposed = false;
  let disposal: Promise<void> | null = null;
  const subscriptions = new Set<() => void>();
  const cancelPointers = new Set<() => void>();
  let refreshViewport: (() => void) | undefined;
  const report = (error: unknown) => {
    try {
      sdk.getLogManager().info({ event, sessionId, message: String(error) });
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
    if (!disposed && !hidden) {
      hidden = true;
      for (const cancel of cancelPointers) safely(cancel);
      media.pause();
      instance?.pause();
    }
  };
  const resume = () => {
    if (!disposed && hidden) {
      hidden = false;
      refreshViewport?.();
      instance?.resume();
    }
  };
  const onHide = () => safely(pause);
  const onShow = () => safely(resume);
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
    const viewportOptions = options.viewport ?? module.viewport;
    const viewport = createNativeViewport(
      sdk,
      options.canvas ?? sdk.createCanvas(),
      viewportOptions,
    );
    refreshViewport = () => {
      if (disposed) return;
      for (const cancel of cancelPointers) safely(cancel);
      viewport.resize();
    };
    if (sdk.onWindowResize && sdk.offWindowResize) {
      const resize = () =>
        safely(() => {
          refreshViewport?.();
          if (!disposed && !hidden && viewportOptions?.refreshOnResize === 'resume')
            instance?.resume();
        });
      sdk.onWindowResize(resize);
      remember(() => sdk.offWindowResize?.(resize));
    }
    const host = createNativeGameHost(sdk, module.definition.manifest, module.content, options);
    instance = await module.definition.mount(
      {
        canvas: viewport.canvas,
        onTap(listener) {
          let candidate: { x: number; y: number; id: number } | null = null;
          const hasStart = Boolean(sdk.onTouchStart && sdk.offTouchStart);
          const cancel = () => {
            candidate = null;
          };
          const start = (event: TouchEvent) => {
            cancel();
            if (
              hidden ||
              disposed ||
              (event.touches && event.touches.length !== 1) ||
              event.changedTouches.length !== 1
            )
              return;
            const first = event.changedTouches[0]!;
            const p = viewport.point(first.clientX, first.clientY);
            if (p) candidate = { ...p, id: first.identifier ?? 0 };
          };
          const move = (event: TouchEvent) => {
            if (!candidate) return;
            if (event.touches && event.touches.length !== 1) return cancel();
            const first = event.changedTouches.find((p) => (p.identifier ?? 0) === candidate!.id);
            if (first) {
              const p = viewport.point(first.clientX, first.clientY);
              if (!p || Math.hypot(p.x - candidate.x, p.y - candidate.y) > 12) cancel();
            }
          };
          const touch = (event: TouchEvent) => {
            const saved = candidate;
            cancel();
            const first = event.changedTouches[0];
            if (
              !first ||
              hidden ||
              disposed ||
              event.touches?.length ||
              event.changedTouches.length !== 1
            )
              return;
            const p = viewport.point(first.clientX, first.clientY);
            if (
              p &&
              (!hasStart ||
                (saved &&
                  saved.id === (first.identifier ?? 0) &&
                  Math.hypot(p.x - saved.x, p.y - saved.y) <= 12))
            )
              listener(p.x, p.y);
          };
          if (hasStart) sdk.onTouchStart?.(start);
          if (sdk.onTouchMove && sdk.offTouchMove) sdk.onTouchMove(move);
          if (sdk.onTouchCancel && sdk.offTouchCancel) sdk.onTouchCancel(cancel);
          sdk.onTouchEnd(touch);
          cancelPointers.add(cancel);
          return remember(() => {
            cancel();
            sdk.offTouchEnd(touch);
            if (hasStart) sdk.offTouchStart?.(start);
            if (sdk.onTouchMove && sdk.offTouchMove) sdk.offTouchMove(move);
            if (sdk.onTouchCancel && sdk.offTouchCancel) sdk.offTouchCancel(cancel);
            cancelPointers.delete(cancel);
          });
        },
        onPress:
          sdk.onTouchStart && sdk.offTouchStart
            ? (start, end) => {
                let pointerId: number | null = null;
                const cancel = () => {
                  if (pointerId === null) return;
                  pointerId = null;
                  end();
                };
                const touchStart = (event: TouchEvent) => {
                  const first = event.changedTouches[0];
                  if (
                    (event.touches && event.touches.length > 1) ||
                    event.changedTouches.length > 1
                  )
                    return cancel();
                  if (!first || pointerId !== null || hidden || disposed) return;
                  const p = viewport.point(first.clientX, first.clientY);
                  if (!p) return;
                  pointerId = first.identifier ?? 0;
                  start(p.x, p.y);
                };
                const touchEnd = (event: TouchEvent) => {
                  if (event.changedTouches.some((point) => (point.identifier ?? 0) === pointerId))
                    cancel();
                };
                const touchCancel = (event: TouchEvent) => {
                  if (event.changedTouches.length === 0) cancel();
                  else touchEnd(event);
                };
                const touchMove = (event: TouchEvent) => {
                  if (event.touches && event.touches.length > 1) return cancel();
                  const point = event.changedTouches.find(
                    (point) => (point.identifier ?? 0) === pointerId,
                  );
                  if (point && !viewport.point(point.clientX, point.clientY)) cancel();
                };
                sdk.onTouchStart?.(touchStart);
                sdk.onTouchEnd(touchEnd);
                if (sdk.onTouchCancel && sdk.offTouchCancel) sdk.onTouchCancel(touchCancel);
                if (sdk.onTouchMove && sdk.offTouchMove) sdk.onTouchMove(touchMove);
                cancelPointers.add(cancel);
                return remember(() => {
                  safely(cancel);
                  safely(() => sdk.offTouchStart?.(touchStart));
                  safely(() => sdk.offTouchEnd(touchEnd));
                  if (sdk.onTouchCancel && sdk.offTouchCancel)
                    safely(() => sdk.offTouchCancel?.(touchCancel));
                  if (sdk.onTouchMove && sdk.offTouchMove)
                    safely(() => sdk.offTouchMove?.(touchMove));
                  cancelPointers.delete(cancel);
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
                    const mapped = viewport.point(point.clientX, point.clientY);
                    if (!mapped) {
                      const prior = active.get(pointerId);
                      active.delete(pointerId);
                      if (prior) listener({ ...prior, phase: 'cancel' });
                      continue;
                    }
                    const pointer = { phase, ...mapped, pointerId };
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
                  safely(cancel);
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
