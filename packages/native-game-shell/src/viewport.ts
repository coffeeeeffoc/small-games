import type { CanvasGameTarget } from '@coffeeeeffoc/canvas-game-adapter';
import type { NativeSdk } from './sdk.js';

export type NativeViewportOptions = {
  aspectRatio?: number;
  rotateToFit?: boolean;
  refreshOnResize?: 'resume';
};

/** A native drawing view, not a DOM canvas or a copied game renderer. */
export function createNativeViewport(
  sdk: NativeSdk,
  raw: CanvasGameTarget['canvas'],
  options: NativeViewportOptions = {},
) {
  if (
    options.aspectRatio !== undefined &&
    (!Number.isFinite(options.aspectRatio) || options.aspectRatio <= 0)
  )
    throw new Error('Native viewport aspectRatio must be positive');
  const context = raw.getContext('2d');
  let x = 0,
    y = 0,
    width = 1,
    height = 1,
    rotated = false;
  const base = () => (rotated ? [0, 1, -1, 0, x + height, y] : [1, 0, 0, 1, x, y]);
  const setTransform = (a: number, b: number, c: number, d: number, e: number, f: number) => {
    const [aa, ab, ac, ad, ae, af] = base() as [number, number, number, number, number, number];
    context?.setTransform(
      aa * a + ac * b,
      ab * a + ad * b,
      aa * c + ac * d,
      ab * c + ad * d,
      aa * e + ac * f + ae,
      ab * e + ad * f + af,
    );
  };
  const viewContext =
    context &&
    new Proxy(context, {
      get(target, key) {
        if (key === 'setTransform')
          return (
            a: number | DOMMatrix2DInit,
            b?: number,
            c?: number,
            d?: number,
            e?: number,
            f?: number,
          ) => {
            if (typeof a === 'number') setTransform(a, b ?? 0, c ?? 0, d ?? 1, e ?? 0, f ?? 0);
            else
              setTransform(
                a.a ?? a.m11 ?? 1,
                a.b ?? a.m12 ?? 0,
                a.c ?? a.m21 ?? 0,
                a.d ?? a.m22 ?? 1,
                a.e ?? a.m41 ?? 0,
                a.f ?? a.m42 ?? 0,
              );
          };
        if (key === 'resetTransform') return () => setTransform(1, 0, 0, 1, 0, 0);
        const value: unknown = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set(target, key, value) {
        return Reflect.set(target, key, value, target);
      },
    });
  const canvas: CanvasGameTarget['canvas'] = {
    get width() {
      return width;
    },
    set width(_value: number) {
      throw new Error('Native viewport dimensions are host-owned');
    },
    get height() {
      return height;
    },
    set height(_value: number) {
      throw new Error('Native viewport dimensions are host-owned');
    },
    getContext: () => viewContext,
  };
  const resize = () => {
    const info = sdk.getSystemInfoSync();
    const clamp = (value: number, limit: number) =>
      Math.max(0, Math.min(limit, Number.isFinite(value) ? value : 0));
    const left = clamp(info.safeArea?.left ?? 0, info.windowWidth),
      right = Math.max(left + 1, clamp(info.safeArea?.right ?? info.windowWidth, info.windowWidth));
    let capsule = 0;
    try {
      capsule = sdk.getMenuButtonBoundingClientRect?.().bottom ?? 0;
    } catch {
      /* Optional capsule query. */
    }
    const top = clamp(Math.max(info.safeArea?.top ?? 0, capsule), info.windowHeight - 1),
      bottom = Math.max(
        top + 1,
        clamp(info.safeArea?.bottom ?? info.windowHeight, info.windowHeight),
      );
    const availableWidth = right - left,
      availableHeight = bottom - top;
    rotated = Boolean(
      options.rotateToFit &&
        options.aspectRatio &&
        (options.aspectRatio < 1
          ? availableWidth > availableHeight
          : availableHeight > availableWidth),
    );
    width = rotated ? availableHeight : availableWidth;
    height = rotated ? availableWidth : availableHeight;
    if (options.aspectRatio) {
      if (width / height > options.aspectRatio) width = height * options.aspectRatio;
      else height = width / options.aspectRatio;
    }
    x = left + (availableWidth - (rotated ? height : width)) / 2;
    y = top + (availableHeight - (rotated ? width : height)) / 2;
    raw.width = info.windowWidth;
    raw.height = info.windowHeight;
    const protectedView =
      rotated || x !== 0 || y !== 0 || width !== info.windowWidth || height !== info.windowHeight;
    if (context && protectedView) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = '#10221e';
      context.fillRect(0, 0, raw.width, raw.height);
      setTransform(1, 0, 0, 1, 0, 0);
      context.beginPath();
      context.rect(0, 0, width, height);
      context.clip();
    }
  };
  const point = (clientX: number, clientY: number) => {
    const local = rotated
      ? { x: clientY - y, y: x + height - clientX }
      : { x: clientX - x, y: clientY - y };
    return Number.isFinite(local.x) &&
      Number.isFinite(local.y) &&
      local.x >= 0 &&
      local.y >= 0 &&
      local.x < width &&
      local.y < height
      ? local
      : null;
  };
  resize();
  return { canvas, resize, point, getLayout: () => ({ x, y, width, height, rotated }) };
}
