import { describe, expect, it, vi } from 'vitest';
import type { CanvasGameTarget, CanvasPointerEvent } from '@coffeeeeffoc/canvas-game-adapter';
import type { NativeSdk, TouchEvent } from './sdk.js';
import { startNativeGame, type ReviewedModule } from './shell.js';
vi.mock('./host.js', () => ({ createNativeGameHost: () => ({}) }));
vi.mock('./media.js', () => ({
  createNativeMedia: () => ({ target: {}, pause: vi.fn(), dispose: vi.fn() }),
}));
function fixture() {
  let info = {
    windowWidth: 390,
    windowHeight: 844,
    safeArea: { left: 10, top: 30, right: 380, bottom: 810 },
  };
  const lists = new Map<string, Set<(e: TouchEvent) => void>>();
  const sdk = {
    getSystemInfoSync: () => info,
    getMenuButtonBoundingClientRect: () => ({ bottom: 80 }),
    createCanvas: () => ({ width: 0, height: 0, getContext: () => null }),
    getLogManager: () => ({ info: vi.fn() }),
  } as unknown as NativeSdk;
  for (const event of [
    'Hide',
    'Show',
    'WindowResize',
    'TouchStart',
    'TouchMove',
    'TouchEnd',
    'TouchCancel',
  ]) {
    const set = new Set<(e: TouchEvent) => void>();
    lists.set(event, set);
    Object.assign(sdk, {
      ['on' + event]: (fn: (e: TouchEvent) => void) => set.add(fn),
      ['off' + event]: (fn: (e: TouchEvent) => void) => set.delete(fn),
    });
  }
  const emit = (event: string, points: number[][] = [], active?: number[][]) => {
    const convert = (p: number[]) => ({ clientX: p[0]!, clientY: p[1]!, identifier: p[2] ?? 1 });
    for (const f of [...lists.get(event)!])
      f({ changedTouches: points.map(convert), touches: active?.map(convert) });
  };
  let target!: CanvasGameTarget;
  const instance = { pause: vi.fn(), resume: vi.fn(), dispose: vi.fn() };
  const mount = vi.fn((value: CanvasGameTarget) => {
    target = value;
    return instance;
  });
  const module = { definition: { manifest: {}, mount }, content: {} } as unknown as ReviewedModule;
  return {
    sdk,
    emit,
    module,
    mount,
    instance,
    target: () => target,
    count: () => [...lists.values()].reduce((n, set) => n + set.size, 0),
    landscape: () => {
      info = {
        windowWidth: 844,
        windowHeight: 390,
        safeArea: { left: 10, top: 0, right: 810, bottom: 374 },
      };
    },
  };
}
describe('native viewport input and lifecycle', () => {
  it('maps valid taps and rejects drag, cancellation, multiple fingers and hidden releases', async () => {
    const f = fixture(),
      game = await startNativeGame(f.sdk, async () => f.module, {
        sessionId: 'test',
        platformId: 'test',
      });
    const tap = vi.fn();
    f.target().onTap(tap);
    f.emit('TouchStart', [[30, 100]]);
    f.emit('TouchEnd', [[30, 100]], []);
    expect(tap).toHaveBeenLastCalledWith(20, 20);
    f.emit('TouchStart', [[30, 100]]);
    f.emit('TouchMove', [[70, 100]]);
    f.emit('TouchEnd', [[30, 100]], []);
    f.emit('TouchStart', [[30, 100]]);
    f.emit('TouchCancel');
    f.emit('TouchEnd', [[30, 100]], []);
    f.emit('TouchStart', [[30, 100]]);
    f.emit(
      'TouchStart',
      [[40, 100, 2]],
      [
        [30, 100],
        [40, 100, 2],
      ],
    );
    f.emit('TouchEnd', [[30, 100]], []);
    f.emit('TouchStart', [[30, 100]]);
    f.emit('Hide');
    f.emit('Show');
    f.emit('TouchEnd', [[30, 100]], []);
    expect(tap).toHaveBeenCalledTimes(1);
    expect(f.instance.pause).toHaveBeenCalledOnce();
    expect(f.instance.resume).toHaveBeenCalledOnce();
    await game.dispose();
    await game.dispose();
    expect(f.count()).toBe(0);
    expect(f.instance.dispose).toHaveBeenCalledOnce();
  });
  it('cancels pointers on unsafe-area exit, resize, background and explicit unsubscribe', async () => {
    const f = fixture();
    f.module.viewport = { aspectRatio: 390 / 844, rotateToFit: true, refreshOnResize: 'resume' };
    const game = await startNativeGame(f.sdk, async () => f.module, {
      sessionId: 'test',
      platformId: 'test',
    });
    const pointers: CanvasPointerEvent[] = [],
      off = f.target().onPointer!((p) => pointers.push(p));
    f.emit('TouchStart', [
      [30, 100],
      [40, 110, 2],
    ]);
    expect(pointers.map((p) => p.phase)).toEqual(['down', 'down']);
    f.emit('TouchMove', [[30, 50]]);
    expect(pointers.at(-1)?.phase).toBe('cancel');
    f.landscape();
    f.emit('WindowResize');
    expect(pointers.at(-1)).toMatchObject({ phase: 'cancel', pointerId: 2 });
    expect(f.mount).toHaveBeenCalledOnce();
    expect(f.instance.resume).toHaveBeenCalledOnce();
    const width = f.target().canvas.width,
      height = f.target().canvas.height;
    expect(width / height).toBeCloseTo(390 / 844);
    f.emit('TouchStart', [[100, 120, 3]]);
    f.emit('Hide');
    expect(pointers.at(-1)?.phase).toBe('cancel');
    f.emit('WindowResize');
    expect(f.instance.resume).toHaveBeenCalledOnce();
    f.emit('Show');
    expect(f.instance.resume).toHaveBeenCalledTimes(2);
    f.emit('TouchStart', [[100, 120, 4]]);
    off();
    expect(pointers.at(-1)?.phase).toBe('cancel');
    await game.dispose();
    expect(f.count()).toBe(0);
  });
  it('releases held presses when sliding into the capsule or adding another finger', async () => {
    const f = fixture(),
      game = await startNativeGame(f.sdk, async () => f.module, {
        sessionId: 'test',
        platformId: 'test',
      });
    const start = vi.fn(),
      end = vi.fn();
    f.target().onPress!(start, end);
    f.emit('TouchStart', [[30, 100]]);
    expect(start).toHaveBeenCalledWith(20, 20);
    f.emit('TouchMove', [[30, 20]]);
    expect(end).toHaveBeenCalledOnce();
    f.emit('TouchStart', [[30, 100]]);
    f.emit(
      'TouchStart',
      [[40, 100, 2]],
      [
        [30, 100],
        [40, 100, 2],
      ],
    );
    expect(end).toHaveBeenCalledTimes(2);
    await game.dispose();
    expect(f.count()).toBe(0);
  });
});
