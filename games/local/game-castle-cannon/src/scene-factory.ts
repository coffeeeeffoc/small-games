import type { CanvasGameTarget, CanvasRenderSurface } from '@coffeeeeffoc/canvas-game-adapter';
import { SiegeScene } from './scene.js';
export function createSiegeScene(
  factory: CanvasGameTarget['createRenderSurface'],
  cacheWorld = true,
): SiegeScene | null {
  if (!factory) return null;
  let surface: CanvasRenderSurface | null = null;
  try {
    surface = factory(768, 432);
    if (!surface) return null;
    const context = surface.canvas.getContext('webgl2', {
      antialias: true,
      preserveDrawingBuffer: true,
    });
    if (context) return new SiegeScene(surface, context, cacheWorld);
    surface.dispose();
    return null;
  } catch {
    surface?.dispose();
    return null;
  }
}
