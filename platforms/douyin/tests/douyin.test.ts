import { afterEach, expect, it, vi } from 'vitest';
import type { CanvasPointerEvent, CanvasSound } from '@coffeeeeffoc/canvas-game-adapter';
import { createNativeAdProvider } from '@coffeeeeffoc/native-game-shell';
import { createDouyinSdk, startDouyinGame } from '../src/index.js';
import { fixture } from './douyin.fixture.js';

afterEach(() => vi.useRealTimers());

it('runs tt input, cancel, visibility, audio and namespaced saves through the shared runtime', async () => {
  const f = fixture();
  const pointers: CanvasPointerEvent[] = [];
  const lifecycle = { pause: vi.fn(), resume: vi.fn(), dispose: vi.fn() };
  let sound!: CanvasSound;
  f.game.definition = {
    ...f.game.definition,
    async mount(target, host) {
      expect([target.canvas.width, target.canvas.height]).toEqual([390, 844]);
      target.onPointer!((event) => pointers.push(event));
      sound = target.createSound!('building-power-audio/connect.wav');
      sound.play();
      expect(await host.storage.read('progress')).toBeNull();
      await host.storage.write('progress', { level: 2 }, null);
      expect(await host.storage.read('progress')).toMatchObject({ value: { level: 2 } });
      await expect(host.ads.offer({ id: 'revive', reward: {} })).resolves.toEqual({
        status: 'unavailable',
      });
      return lifecycle;
    },
  };
  const instance = await startDouyinGame(f.sdk, f.game);
  expect(f.records.has('douyin:fixture:progress')).toBe(true);
  expect(f.audio.src).toBe('building-power-audio/connect.wav');
  f.emit('down');
  f.emit('move');
  f.emit('cancel', []);
  expect(pointers.map((p) => p.phase)).toEqual(['down', 'move', 'cancel']);
  expect(pointers[0]).toMatchObject({ x: 42, y: 83, pointerId: 7 });
  f.emit('down');
  for (const fn of f.hide) fn();
  expect(pointers.at(-1)?.phase).toBe('cancel');
  const count = pointers.length;
  f.emit('up');
  sound.play();
  expect(pointers).toHaveLength(count);
  expect(f.audio.play).toHaveBeenCalledOnce();
  expect(f.audio.stop).toHaveBeenCalledOnce();
  for (const fn of f.show) fn();
  expect(lifecycle.pause).toHaveBeenCalledOnce();
  expect(lifecycle.resume).toHaveBeenCalledOnce();
  await instance.dispose();
  await instance.dispose();
  expect(
    f.hide.size + f.show.size + Object.values(f.touch).reduce((n, set) => n + set.size, 0),
  ).toBe(0);
  expect(f.audio.destroy).toHaveBeenCalledOnce();
  expect(lifecycle.dispose).toHaveBeenCalledOnce();
});

it('rejects missing SDK, cleans up failed mounts, and propagates genuine storage failures', async () => {
  const f = fixture();
  await expect(startDouyinGame(undefined, f.game)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  f.game.definition = {
    ...f.game.definition,
    mount: async () => {
      throw new Error('mount failed');
    },
  };
  await expect(startDouyinGame(f.sdk, f.game)).rejects.toThrow('mount failed');
  expect(f.hide.size + f.show.size).toBe(0);
  const sdk = createDouyinSdk(f.sdk);
  f.records.set('save', 'retained');
  f.sdk.getStorageSync = () => {
    throw new Error('disk failure');
  };
  expect(() => sdk.getStorageSync('save')).toThrow('disk failure');
  expect(f.records.get('save')).toBe('retained');
});

it.each([true, false, undefined])(
  'tt singleton awards only explicit completion: %s',
  async (isEnded) => {
    const f = fixture();
    let close!: (result?: { isEnded?: boolean }) => void;
    const ad = {
      show: vi.fn(async () => {
        close({ isEnded });
        close({ isEnded: true });
      }),
      onClose: (fn: typeof close) => {
        close = fn;
      },
      offClose: vi.fn(),
      onError: vi.fn(),
      offError: vi.fn(),
      destroy: vi.fn(async () => undefined),
    };
    f.sdk.createRewardedVideoAd = vi.fn(() => ad);
    const provider = createNativeAdProvider(createDouyinSdk(f.sdk), 'placement');
    for (let i = 0; i < 2; i++) {
      await expect(provider.show({ opportunityId: 'revive' })).resolves.toEqual({
        status: isEnded === true ? 'completed' : 'dismissed',
      });
    }
    expect(f.sdk.createRewardedVideoAd).toHaveBeenCalledWith({
      adUnitId: 'placement',
      multiton: false,
    });
    expect(ad.offClose).toHaveBeenCalledTimes(2);
    expect(ad.offError).toHaveBeenCalledTimes(2);
  },
);

it.each(['reject', 'error', 'timeout'] as const)(
  'tt ad %s never rewards and releases its listeners',
  async (mode) => {
    vi.useFakeTimers();
    const f = fixture();
    let fail!: () => void;
    const ad = {
      show: vi.fn(async () => {
        if (mode === 'reject') throw new Error('no inventory');
        if (mode === 'error') fail();
      }),
      onClose: vi.fn(),
      offClose: vi.fn(),
      onError: (fn: () => void) => {
        fail = fn;
      },
      offError: vi.fn(),
      destroy: vi.fn(async () => undefined),
    };
    f.sdk.createRewardedVideoAd = () => ad;
    const provider = createNativeAdProvider(createDouyinSdk(f.sdk), 'placement', 50);
    const pending = provider.show({ opportunityId: 'revive' });
    await expect(provider.show({ opportunityId: 'bonus' })).resolves.toEqual({ status: 'failed' });
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).resolves.toEqual({
      status: mode === 'timeout' ? 'unavailable' : 'failed',
    });
    expect(ad.offClose).toHaveBeenCalledOnce();
    expect(ad.offError).toHaveBeenCalledOnce();
  },
);

it('blocks B until timed-out A is destroyed, then isolates B from A late completion', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const makeAd = () => {
    const listeners = new Set<(result: { isEnded: boolean }) => void>();
    let finishDestroy!: () => void;
    const destroyed = new Promise<void>((resolve) => {
      finishDestroy = resolve;
    });
    return {
      show: vi.fn(async () => undefined),
      onClose: (fn: (result: { isEnded: boolean }) => void) => {
        listeners.add(fn);
      },
      offClose: (fn: (result: { isEnded: boolean }) => void) => {
        listeners.delete(fn);
      },
      onError: vi.fn(),
      offError: vi.fn(),
      destroy: vi.fn(() => destroyed),
      finishDestroy,
      emit() {
        for (const fn of listeners) fn({ isEnded: true });
      },
    };
  };
  const a = makeAd();
  let singleton = a;
  f.sdk.createRewardedVideoAd = vi.fn(() => singleton);
  const provider = createNativeAdProvider(createDouyinSdk(f.sdk), 'placement', 50);
  const first = provider.show({ opportunityId: 'A' });
  await vi.advanceTimersByTimeAsync(50);
  await expect(first).resolves.toEqual({ status: 'unavailable' });
  const blocked = provider.show({ opportunityId: 'B' });
  await Promise.resolve();
  a.emit(); // Old code delivers A's late completion to B on the same singleton.
  await expect(blocked).resolves.toEqual({ status: 'failed' });
  expect(f.sdk.createRewardedVideoAd).toHaveBeenCalledOnce();
  expect(a.destroy).toHaveBeenCalledOnce();

  a.finishDestroy();
  await Promise.resolve();
  await Promise.resolve();
  const b = makeAd();
  singleton = b; // The SDK can now provide a genuinely new instance.
  const settled = vi.fn();
  const next = provider.show({ opportunityId: 'B' });
  void next.then(settled);
  await Promise.resolve();
  a.emit();
  await Promise.resolve();
  expect(settled).not.toHaveBeenCalled();
  expect(b.show).toHaveBeenCalledOnce();
  b.emit();
  await expect(next).resolves.toEqual({ status: 'completed' });
  expect(b.destroy).toHaveBeenCalledOnce();
  b.finishDestroy();
  await Promise.resolve();
});

it.each(['resolve', 'reject', 'throw'] as const)(
  'keeps a completed request leased until destroy succeeds: %s',
  async (mode) => {
    const f = fixture();
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const destroyed = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    let close!: (result?: { isEnded?: boolean }) => void;
    const ad = {
      show: vi.fn(async () => {
        close({ isEnded: true });
      }),
      onClose: (fn: typeof close) => {
        close = fn;
      },
      offClose: vi.fn(),
      onError: vi.fn(),
      offError: vi.fn(),
      destroy: vi.fn(() => {
        if (mode === 'throw') throw new Error('destroy failed');
        return destroyed;
      }),
    };
    f.sdk.createRewardedVideoAd = vi.fn(() => ad);
    const provider = createNativeAdProvider(createDouyinSdk(f.sdk), 'placement');
    await expect(provider.show({ opportunityId: 'A' })).resolves.toEqual({ status: 'completed' });
    await expect(provider.show({ opportunityId: 'B' })).resolves.toEqual({ status: 'failed' });
    expect(f.sdk.createRewardedVideoAd).toHaveBeenCalledOnce();
    expect(ad.destroy).toHaveBeenCalledOnce();
    if (mode === 'reject') reject(new Error('destroy rejected'));
    else resolve();
    await Promise.resolve();
    await expect(provider.show({ opportunityId: 'B' })).resolves.toEqual({
      status: mode === 'resolve' ? 'completed' : 'failed',
    });
    expect(f.sdk.createRewardedVideoAd).toHaveBeenCalledTimes(mode === 'resolve' ? 2 : 1);
  },
);
