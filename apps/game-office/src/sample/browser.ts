import type {
  CanvasGameTarget,
  CanvasPointerEvent,
  CanvasSound,
} from '@coffeeeeffoc/canvas-game-adapter';

// Vite resolves the same source assets for standalone and embedded Web shells.
const files = import.meta.glob('../../public/office-scene/**/*.{png,webp,jpg,jpeg,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
});
const assetUrl = (path: string) => {
  const url = files[`../../public/${path}`];
  if (typeof url !== 'string') throw new Error(`Missing office asset: ${path}`);
  return url;
};

export function browserSampleTarget(
  canvas: HTMLCanvasElement,
): CanvasGameTarget & { dispose(): void } {
  const pending = new Set<() => void>();
  let disposed = false;
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
      disposed = true;
      pending.forEach((cancel) => cancel());
      pending.clear();
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
      return () => canvas.removeEventListener('click', click);
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
      return () => handlers.forEach((stop) => stop());
    },
    loadImage(src) {
      return new Promise((resolve, reject) => {
        if (disposed) {
          reject(new Error('Scene disposed'));
          return;
        }
        const image = new Image();
        const cancel = () => {
          cleanup();
          image.src = '';
          reject(new Error('图片加载取消或超时'));
        };
        const timer = setTimeout(cancel, 15000);
        const cleanup = () => {
          clearTimeout(timer);
          image.onload = image.onerror = null;
          pending.delete(cancel);
        };
        pending.add(cancel);
        image.onload = () => {
          cleanup();
          resolve(image);
        };
        image.onerror = () => {
          cleanup();
          reject(new Error(`图片加载失败：${src}`));
        };
        try {
          image.src = assetUrl(src);
        } catch (error) {
          cleanup();
          reject(error);
        }
      });
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
