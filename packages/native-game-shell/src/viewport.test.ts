import { describe, expect, it, vi } from 'vitest';
import type { CanvasGameTarget } from '@coffeeeeffoc/canvas-game-adapter';
import type { NativeSdk } from './sdk.js';
import { createNativeViewport } from './viewport.js';

function fixture() {
  let info: ReturnType<NativeSdk['getSystemInfoSync']> = { windowWidth: 390, windowHeight: 844 };
  let capsule = 0;
  const context = {
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillStyle: '',
  };
  const raw = {
    width: 0,
    height: 0,
    getContext: () => context,
  } as unknown as CanvasGameTarget['canvas'];
  const sdk = {
    getSystemInfoSync: () => info,
    getMenuButtonBoundingClientRect: () => ({ bottom: capsule }),
  } as NativeSdk;
  return {
    raw,
    context,
    sdk,
    update: (next: typeof info, bottom = 0) => {
      info = next;
      capsule = bottom;
    },
  };
}
describe('native safe drawing viewport', () => {
  it('preserves legacy dimensions and coordinates without SDK safety information', () => {
    const f = fixture(),
      view = createNativeViewport(f.sdk, f.raw);
    expect(view.canvas.width).toBe(390);
    expect(view.canvas.height).toBe(844);
    expect(f.context.setTransform).not.toHaveBeenCalled();
    expect(f.context.clip).not.toHaveBeenCalled();
    expect(view.point(123, 456)).toEqual({ x: 123, y: 456 });
    expect(view.point(-1, 20)).toBeNull();
    expect(view.point(390, 20)).toBeNull();
  });
  it('combines safe area and capsule, clips rendering, and inversely maps coordinates', () => {
    const f = fixture();
    f.update(
      {
        windowWidth: 390,
        windowHeight: 844,
        safeArea: { left: 12, top: 30, right: 378, bottom: 810 },
      },
      88,
    );
    const view = createNativeViewport(f.sdk, f.raw);
    expect(view.getLayout()).toEqual({ x: 12, y: 88, width: 366, height: 722, rotated: false });
    expect(view.point(22, 98)).toEqual({ x: 10, y: 10 });
    expect(view.point(22, 87)).toBeNull();
    view.canvas.getContext('2d')!.setTransform(2, 0, 0, 2, 5, 6);
    expect(f.context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 17, 94);
    view.canvas.getContext('2d')!.resetTransform();
    expect(f.context.setTransform).toHaveBeenLastCalledWith(1, 0, 0, 1, 12, 88);
    expect(f.context.rect).toHaveBeenCalledWith(0, 0, 366, 722);
    expect(f.context.clip).toHaveBeenCalledOnce();
  });
  it('rotates opt-in portrait content in physical landscape and updates without remount', () => {
    const f = fixture();
    f.update(
      {
        windowWidth: 844,
        windowHeight: 390,
        safeArea: { left: 24, top: 0, right: 810, bottom: 374 },
      },
      32,
    );
    const view = createNativeViewport(f.sdk, f.raw, { aspectRatio: 390 / 844, rotateToFit: true });
    const layout = view.getLayout();
    expect(layout.rotated).toBe(true);
    expect(layout.width / layout.height).toBeCloseTo(390 / 844);
    expect(view.point(layout.x + layout.height - 70, layout.y + 30)).toEqual({ x: 30, y: 70 });
    view.canvas.getContext('2d')!.setTransform(2, 0, 0, 2, 0, 0);
    expect(f.context.setTransform).toHaveBeenLastCalledWith(
      0,
      2,
      -2,
      0,
      layout.x + layout.height,
      layout.y,
    );
    f.update({ windowWidth: 390, windowHeight: 844 });
    view.resize();
    expect(view.getLayout()).toEqual({ x: 0, y: 0, width: 390, height: 844, rotated: false });
    expect(f.raw.width).toBe(390);
    expect(f.raw.height).toBe(844);
  });
  it('rejects invalid aspect ratios before touching the canvas', () => {
    const f = fixture();
    expect(() => createNativeViewport(f.sdk, f.raw, { aspectRatio: 0 })).toThrow('positive');
  });
});
