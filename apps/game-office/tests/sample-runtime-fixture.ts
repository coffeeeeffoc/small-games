import type { CanvasGameTarget, CanvasPointerEvent } from '@coffeeeeffoc/canvas-game-adapter';
import { sceneManifest } from '../src/sample/scene.js';

export function surface(loadImage = async () => document.createElement('canvas'), width = 390) {
  let listener: ((event: CanvasPointerEvent) => void) | undefined;
  let draws = 0;
  const context = {
    save() {},
    restore() {},
    translate() {},
    scale() {},
    fillRect() {},
    clearRect() {},
    fillText() {},
    measureText: (value: string) => ({ width: value.length * 7 }),
    drawImage() {
      draws += 1;
    },
  } as unknown as CanvasRenderingContext2D;
  const target: CanvasGameTarget = {
    canvas: { width, height: 844, getContext: () => context },
    onTap: () => () => undefined,
    onPointer(callback) {
      listener = callback;
      return () => {
        listener = undefined;
      };
    },
    loadImage,
  };
  function point(name: keyof typeof sceneManifest.hotspots) {
    const rect = sceneManifest.hotspots[name];
    if (!rect) throw new Error(`Missing test hotspot: ${name}`);
    return {
      x: rect.x + rect.w / 2 + (width - 390) / 2,
      y: rect.y + rect.h / 2 + sceneManifest.scene.offsetY,
    };
  }
  const pointer = (
    phase: CanvasPointerEvent['phase'],
    name: keyof typeof sceneManifest.hotspots,
    pointerId = 1,
  ) => {
    listener?.({ phase, pointerId, ...point(name) });
  };
  return { target, pointer, draws: () => draws, listening: () => !!listener };
}
