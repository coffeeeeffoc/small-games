import { HostError } from '@coffeeeeffoc/game-contract';
import type { CanvasGameTarget, CanvasSound } from '@coffeeeeffoc/canvas-game-adapter';
import type { BilibiliSdk } from './sdk.js';

/** Shell-owned package resources; Games never access native SDK objects directly. */
export function createBilibiliMedia(
  sdk: BilibiliSdk,
  gameId: string,
  active: () => boolean,
  report: (error: unknown) => void,
) {
  let disposed = false;
  const pendingImages = new Set<() => void>();
  const sounds = new Set<CanvasSound>();
  const safely = (run: () => void) => {
    try {
      run();
    } catch (error) {
      report(error);
    }
  };
  const packageResource = (src: string) => {
    if (
      !/^[a-zA-Z0-9_./-]+$/.test(src) ||
      src.split('/').some((part) => !part || part === '.' || part === '..')
    )
      throw new HostError({
        code: 'INVALID_INPUT',
        message: 'Expected a local Game resource path',
      });
    return `${gameId}/${src}`;
  };
  const target: Pick<CanvasGameTarget, 'loadImage' | 'createSound'> = {
    loadImage: sdk.createImage
      ? (src) =>
          new Promise<CanvasImageSource>((resolve, reject) => {
            if (disposed)
              return reject(new HostError({ code: 'UNAVAILABLE', message: 'Game disposed' }));
            const path = packageResource(src);
            const image = sdk.createImage!();
            const finish = (error?: HostError) => {
              clearTimeout(timer);
              pendingImages.delete(cancel);
              image.onload = null;
              image.onerror = null;
              if (error) reject(error);
              // The SDK Image is drawImage-compatible, but is not a DOM HTMLImageElement.
              else resolve(image as unknown as CanvasImageSource);
            };
            const cancel = () =>
              finish(new HostError({ code: 'UNAVAILABLE', message: 'Game disposed' }));
            const timer = setTimeout(
              () => finish(new HostError({ code: 'TIMEOUT', message: 'Image load timed out' })),
              10_000,
            );
            pendingImages.add(cancel);
            image.onload = () => finish();
            image.onerror = () =>
              finish(new HostError({ code: 'UNAVAILABLE', message: 'Image load failed' }));
            try {
              image.src = path;
            } catch {
              image.onerror();
            }
          })
      : undefined,
    createSound: sdk.createInnerAudioContext
      ? (src, soundOptions) => {
          const path = packageResource(src);
          if (disposed) throw new HostError({ code: 'UNAVAILABLE', message: 'Game disposed' });
          const audio = sdk.createInnerAudioContext!();
          let destroyed = false;
          const onError = () => report(new Error(`Audio unavailable: ${path}`));
          const sound: CanvasSound = {
            play() {
              if (active() && !disposed && !destroyed) safely(() => audio.play());
            },
            stop() {
              if (!destroyed) safely(() => audio.stop());
            },
            setVolume(volume) {
              if (!destroyed)
                safely(() => {
                  audio.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0;
                });
            },
            dispose() {
              if (destroyed) return;
              destroyed = true;
              sounds.delete(sound);
              safely(() => audio.offError(onError));
              safely(() => audio.destroy());
            },
          };
          sounds.add(sound);
          safely(() => {
            audio.onError(onError);
            audio.src = path;
            audio.loop = soundOptions?.loop ?? false;
          });
          sound.setVolume?.(soundOptions?.volume ?? 1);
          return sound;
        }
      : undefined,
  };
  return {
    target,
    pause() {
      for (const sound of sounds) sound.stop();
    },
    dispose() {
      disposed = true;
      for (const cancel of pendingImages) cancel();
      for (const sound of sounds) sound.dispose();
    },
  };
}
