import type { CanvasRenderSurface } from '@coffeeeeffoc/canvas-game-adapter';
import type { NativeSdk } from './sdk.js';
/** Keep SDK canvas creation and optional native event hooks inside the Shell boundary. */
export function nativeRenderSurface(
  sdk: NativeSdk,
  width: number,
  height: number,
): CanvasRenderSurface | null {
  const raw = sdk.createCanvas();
  const source = raw as unknown as CanvasRenderSurface['canvas'];
  raw.width = width;
  raw.height = height;
  const context = source.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true });
  if (
    !context ||
    typeof context.getParameter !== 'function' ||
    typeof context.getParameter(context.VERSION) !== 'string'
  )
    return null;
  let released = false;
  const listeners = new Map<string, Set<EventListener>>();
  const canvas: CanvasRenderSurface['canvas'] = {
    get width() {
      return raw.width;
    },
    set width(value) {
      raw.width = value;
    },
    get height() {
      return raw.height;
    },
    set height(value) {
      raw.height = value;
    },
    getContext() {
      return released ? null : context;
    },
    addEventListener(type, listener) {
      const group = listeners.get(type) ?? new Set();
      if (group.has(listener)) return;
      group.add(listener);
      listeners.set(type, group);
      source.addEventListener?.(type, listener);
    },
    removeEventListener(type, listener) {
      if (!listeners.get(type)?.delete(listener)) return;
      source.removeEventListener?.(type, listener);
    },
  };
  return {
    canvas,
    image: raw as unknown as CanvasImageSource,
    dispose() {
      if (released) return;
      released = true;
      for (const [type, group] of listeners)
        for (const listener of group) source.removeEventListener?.(type, listener);
      listeners.clear();
      context.getExtension('WEBGL_lose_context')?.loseContext();
      raw.width = raw.height = 0;
    },
  };
}
