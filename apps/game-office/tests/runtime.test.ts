import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasGameTarget, CanvasPointerEvent } from '@coffeeeeffoc/canvas-game-adapter';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';
import { browserOfficeTarget } from '../src/first-person/browser.js';
import { WORLD } from '../src/first-person/model.js';
import { mountOfficeScene, type OfficeRuntime } from '../src/first-person/runtime.js';

function surface() {
  let pointer: ((event: CanvasPointerEvent) => void) | undefined;
  const sounds: Array<{
    play: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }> = [];
  const clear = vi.fn();
  const context = {
    clearRect: clear,
    fillRect() {},
    fillText() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    fill() {},
    stroke() {},
    createRadialGradient: () => ({ addColorStop() {} }),
  } as unknown as CanvasRenderingContext2D;
  const target: CanvasGameTarget = {
    canvas: { width: 800, height: 450, getContext: () => context },
    onTap: () => () => {},
    onPointer(listener) {
      pointer = listener;
      return () => {
        pointer = undefined;
      };
    },
    createSound() {
      const sound = { play: vi.fn(), stop: vi.fn(), dispose: vi.fn() };
      sounds.push(sound);
      return sound;
    },
  };
  return {
    target,
    sounds,
    clear,
    listening: () => !!pointer,
    pointer: (event: CanvasPointerEvent) => pointer?.(event),
  };
}

const mounted: OfficeRuntime[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
  for (const runtime of mounted.splice(0)) await runtime.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function finish(runtime: OfficeRuntime) {
  runtime.action('start');
  runtime.getView().state.player = { x: 11.5, z: 15.1, yaw: 0, pitch: 0 };
  runtime.action('interact');
  expect(runtime.getView().state.status).toBe('won');
}

describe('office runtime and browser input', () => {
  it('moves and looks, clears held input on host pause, and disposes all frame/audio callbacks', async () => {
    const fake = surface(),
      onView = vi.fn();
    const runtime = mountOfficeScene(fake.target, createInMemoryGameHost(), onView, 17);
    mounted.push(runtime);
    await vi.advanceTimersByTimeAsync(0);
    expect(runtime.getView().state.seed).toBe(17);
    runtime.action('start');
    const initial = structuredClone(runtime.getView().state.player);
    fake.pointer({ phase: 'down', pointerId: 1, x: 70, y: 370 });
    fake.pointer({ phase: 'move', pointerId: 1, x: 70, y: 305 });
    runtime.look(0.2, 0.1);
    await vi.advanceTimersByTimeAsync(350);
    expect(runtime.getView().state.player.z).toBeGreaterThan(initial.z);
    expect(runtime.getView().state.player.yaw).toBeCloseTo(0.2);
    expect(fake.sounds.some((sound) => sound.play.mock.calls.length > 0)).toBe(true);
    runtime.pause();
    const paused = structuredClone(runtime.getView().state);
    runtime.move(1, 1);
    runtime.look(1, 1);
    runtime.action('crouch');
    await vi.advanceTimersByTimeAsync(1000);
    expect(runtime.getView().state).toEqual(paused);
    expect(fake.sounds.every((sound) => sound.stop.mock.calls.length > 0)).toBe(true);
    runtime.resume();
    await vi.advanceTimersByTimeAsync(150);
    expect(runtime.getView().state.player).toEqual(paused.player);
    expect(runtime.getView().state.elapsed).toBeGreaterThan(paused.elapsed);
    await runtime.dispose();
    const views = onView.mock.calls.length,
      frames = fake.clear.mock.calls.length;
    runtime.action('retry');
    runtime.redraw();
    runtime.move(1, 0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onView).toHaveBeenCalledTimes(views);
    expect(fake.clear).toHaveBeenCalledTimes(frames);
    expect(fake.listening()).toBe(false);
    expect(fake.sounds.every((sound) => sound.dispose.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows a failed score save and persists it only after an explicit retry', async () => {
    const base = createInMemoryGameHost();
    const write = vi.fn(base.storage.write).mockRejectedValueOnce(new Error('offline'));
    const runtime = mountOfficeScene(
      surface().target,
      { ...base, storage: { ...base.storage, write } },
      vi.fn(),
    );
    mounted.push(runtime);
    finish(runtime);
    await vi.advanceTimersByTimeAsync(0);
    expect(runtime.getView().saving).toContain('重试');
    expect(await base.storage.read('office:first-person:v2')).toBeNull();
    await runtime.retrySave();
    expect(runtime.getView().saving).toBe('成绩已保存');
    expect((await base.storage.read('office:first-person:v2'))?.value).toMatchObject({
      version: 2,
      cleared: true,
      bestScore: runtime.getView().state.score,
    });
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('serializes two completed runs and waits for every queued save on disposal', async () => {
    const base = createInMemoryGameHost();
    const releases: Array<() => void> = [];
    const waiting = [0, 1].map(
      () =>
        new Promise<void>((resolve) => {
          releases.push(resolve);
        }),
    );
    let writes = 0;
    const host = {
      ...base,
      storage: {
        ...base.storage,
        async write(...args: Parameters<typeof base.storage.write>) {
          await waiting[writes++];
          return base.storage.write(...args);
        },
      },
    };
    const onView = vi.fn(),
      runtime = mountOfficeScene(surface().target, host, onView);
    mounted.push(runtime);
    try {
      finish(runtime);
      await vi.advanceTimersByTimeAsync(0);
      runtime.newWeek(43);
      runtime.getView().state.score = 30;
      finish(runtime);
      const score = runtime.getView().state.score;
      await vi.advanceTimersByTimeAsync(0);
      expect(writes).toBe(1);
      let finished = false;
      const disposal = runtime.dispose().then(() => {
        finished = true;
      });
      const calls = onView.mock.calls.length;
      releases[0]();
      await vi.advanceTimersByTimeAsync(0);
      expect(writes).toBe(2);
      expect(finished).toBe(false);
      releases[1]();
      await disposal;
      expect((await base.storage.read('office:first-person:v2'))?.value).toMatchObject({
        cleared: true,
        bestScore: score,
      });
      expect(onView).toHaveBeenCalledTimes(calls);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      releases.forEach((release) => release());
    }
  });

  it('does not show an old run save failure in the next run', async () => {
    const base = createInMemoryGameHost();
    let fail!: (error: Error) => void;
    const waiting = new Promise<never>((_resolve, reject) => {
      fail = reject;
    });
    const runtime = mountOfficeScene(
      surface().target,
      {
        ...base,
        storage: { ...base.storage, write: () => waiting },
      },
      vi.fn(),
    );
    mounted.push(runtime);
    finish(runtime);
    await vi.advanceTimersByTimeAsync(0);
    runtime.action('retry');
    runtime.action('start');
    fail(new Error('old run offline'));
    await vi.advanceTimersByTimeAsync(0);
    expect(runtime.getView().state.status).toBe('playing');
    expect(runtime.getView().saving).toBe('');
  });

  it('publishes timeout loss immediately even inside the view throttle interval', async () => {
    const statuses: string[] = [];
    const runtime = mountOfficeScene(surface().target, createInMemoryGameHost(), (view) => {
      statuses.push(view.state.status);
    });
    mounted.push(runtime);
    await vi.advanceTimersByTimeAsync(0);
    runtime.action('start');
    runtime.getView().state.elapsed = WORLD.timeLimit - 0.01;
    await vi.advanceTimersByTimeAsync(34);
    expect(statuses.at(-1)).toBe('lost');
  });

  it('maps browser multi-touch coordinates into canvas space and removes every subscription', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 400;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 30, 400, 200));
    const capture = vi.fn();
    Object.defineProperty(canvas, 'setPointerCapture', { value: capture });
    const target = browserOfficeTarget(canvas),
      listener = vi.fn();
    const unsubscribe = target.onPointer!(listener);
    function pointer(type: string, pointerId: number, clientX: number, clientY: number) {
      const event = new MouseEvent(type, { clientX, clientY });
      Object.defineProperty(event, 'pointerId', { value: pointerId });
      canvas.dispatchEvent(event);
    }
    pointer('pointerdown', 7, 120, 80);
    pointer('pointermove', 7, 220, 130);
    pointer('lostpointercapture', 7, 220, 130);
    expect(capture).toHaveBeenCalledWith(7);
    expect(listener.mock.calls.map(([event]) => event)).toEqual([
      { phase: 'down', pointerId: 7, x: 200, y: 100 },
      { phase: 'move', pointerId: 7, x: 400, y: 200 },
      { phase: 'cancel', pointerId: 7, x: 400, y: 200 },
    ]);
    const tapped = vi.fn();
    const stopTap = target.onTap(tapped);
    target.dispose();
    pointer('pointerdown', 8, 120, 80);
    canvas.click();
    expect(listener).toHaveBeenCalledTimes(3);
    expect(tapped).not.toHaveBeenCalled();
    unsubscribe();
    stopTap();
  });
});
