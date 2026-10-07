import { describe, expect, it, vi } from 'vitest';
import type { NativeSdk } from './sdk.js';
import { nativeRenderSurface } from './render-surface.js';

describe('Shell-owned render surfaces', () => {
  it('rejects unavailable WebGL rather than treating a 2D canvas as 3D', () => {
    const sdk = { createCanvas: () => ({ getContext: () => null }) } as unknown as NativeSdk;
    expect(nativeRenderSurface(sdk, 768, 432)).toBeNull();
  });
  it('forwards dimensions/events and releases a context exactly once', () => {
    const loseContext = vi.fn(),
      removeEventListener = vi.fn(),
      addEventListener = vi.fn();
    const context = {
      VERSION: 1,
      getParameter: () => 'WebGL 2.0',
      getExtension: () => ({ loseContext }),
    };
    const raw = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      addEventListener,
      removeEventListener,
    };
    const sdk = { createCanvas: () => raw } as unknown as NativeSdk;
    const surface = nativeRenderSurface(sdk, 768, 432)!;
    const listener = vi.fn();
    expect(surface.image).toBe(raw);
    expect(raw.width).toBe(768);
    surface.canvas.width = 384;
    expect(raw.width).toBe(384);
    surface.canvas.addEventListener('webglcontextlost', listener);
    surface.canvas.addEventListener('webglcontextlost', listener);
    expect(addEventListener).toHaveBeenCalledTimes(1);
    surface.dispose();
    surface.dispose();
    expect(removeEventListener).toHaveBeenCalledWith('webglcontextlost', listener);
    expect(loseContext).toHaveBeenCalledTimes(1);
    expect(surface.canvas.getContext('webgl2')).toBeNull();
    expect(raw.width).toBe(0);
  });
});
