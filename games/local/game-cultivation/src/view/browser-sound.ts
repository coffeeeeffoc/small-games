import type { CanvasGameTarget } from '@coffeeeeffoc/canvas-game-adapter';
const urls = import.meta.glob('../assets/audio/*.wav', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
/** Imported URLs are bundled for Standalone, Shell and immutable iframe artifacts. */
export const browserSound: NonNullable<CanvasGameTarget['createSound']> = (src, options) => {
  const audio = new Audio(urls[`../assets/audio/${src.split('/').pop()}`]);
  audio.loop = options?.loop ?? false;
  audio.volume = options?.volume ?? 0.65;
  audio.preload = 'auto';
  let disposed = false;
  return {
    play() {
      if (disposed) return;
      if (!audio.loop) audio.currentTime = 0;
      void audio.play().catch(() => undefined);
    },
    stop() {
      audio.pause();
      audio.currentTime = 0;
    },
    setVolume(value) {
      audio.volume = Math.max(0, Math.min(1, value));
    },
    dispose() {
      disposed = true;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    },
  };
};
