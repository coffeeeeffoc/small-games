import type {
  CanvasGameTarget,
  CanvasPointerEvent,
  CanvasSound,
} from '@coffeeeeffoc/canvas-game-adapter';

// Vite resolves the same source assets for standalone and embedded Web shells.
const files = import.meta.glob('../../public/office-scene/audio/*.wav', {
  eager: true,
  query: '?url',
  import: 'default',
});
const assetUrl = (path: string) => {
  const url = files[`../../public/${path}`];
  if (typeof url !== 'string') throw new Error(`Missing office asset: ${path}`);
  return url;
};

export function browserOfficeTarget(
  canvas: HTMLCanvasElement,
): CanvasGameTarget & { dispose(): void } {
  const listeners = new Set<() => void>();

  const point = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    };
  };
  return {
    canvas,
    dispose() {
      listeners.forEach((stop) => stop());
      listeners.clear();
    },
    onTap(listener) {
      const click = (event: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        listener(
          ((event.clientX - rect.left) * canvas.width) / rect.width,
          ((event.clientY - rect.top) * canvas.height) / rect.height,
        );
      };
      canvas.addEventListener('click', click);
      const stop = () => {
        canvas.removeEventListener('click', click);
        listeners.delete(stop);
      };
      listeners.add(stop);
      return stop;
    },
    onPointer(listener) {
      const events = {
        pointerdown: 'down',
        pointermove: 'move',
        pointerup: 'up',
        pointercancel: 'cancel',
        lostpointercapture: 'cancel',
      } as const;
      const handlers = Object.entries(events).map(([name, phase]) => {
        const handler = (event: Event) => {
          const pointer = event as PointerEvent;
          if (phase === 'down') canvas.setPointerCapture?.(pointer.pointerId);
          const value: CanvasPointerEvent = {
            phase,
            ...point(pointer),
            pointerId: pointer.pointerId,
          };
          listener(value);
        };
        canvas.addEventListener(name, handler);
        return () => canvas.removeEventListener(name, handler);
      });
      const stop = () => {
        handlers.forEach((remove) => remove());
        listeners.delete(stop);
      };
      listeners.add(stop);
      return stop;
    },
    createSound(src, options = {}): CanvasSound {
      const sound = new Audio(assetUrl(src));
      sound.preload = 'none';
      sound.loop = options.loop ?? false;
      sound.volume = options.volume ?? 1;
      return {
        play() {
          void sound.play().catch(() => undefined);
        },
        stop() {
          sound.pause();
          sound.currentTime = 0;
        },
        setVolume(volume) {
          sound.volume = Math.max(0, Math.min(1, volume));
        },
        dispose() {
          sound.pause();
          sound.removeAttribute('src');
          sound.load();
        },
      };
    },
  };
}
