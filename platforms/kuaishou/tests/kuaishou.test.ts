import { expect, it, vi } from 'vitest';
import type { CanvasPointerEvent } from '@coffeeeeffoc/canvas-game-adapter';
import { createNativeAdProvider } from '@coffeeeeffoc/native-game-shell';
import { createKuaishouSdk, startKuaishouGame } from '../src/index.js';
import { fixture } from './kuaishou.fixture.js';

it('runs ks input and namespaced saves, then releases input, media and visibility', async () => {
  const f = fixture();
  const pointers: CanvasPointerEvent[] = [];
  const lifecycle = { pause: vi.fn(), resume: vi.fn(), dispose: vi.fn() };
  f.game.definition = {
    ...f.game.definition,
    async mount(target, host) {
      target.onPointer!((event) => pointers.push(event));
      const sound = target.createSound!('confirmation.wav');
      sound.play();
      await host.storage.write('progress', { wins: 2 }, null);
      expect(await host.storage.read('progress')).toMatchObject({ value: { wins: 2 } });
      return lifecycle;
    },
  };
  const instance = await startKuaishouGame(f.sdk, f.game);
  expect(f.records.has('kuaishou:fixture:progress')).toBe(true);
  f.emit('down');
  f.emit('move');
  for (const hide of f.hide) hide();
  expect(pointers.map((p) => p.phase)).toEqual(['down', 'move', 'cancel']);
  f.emit('up');
  expect(pointers).toHaveLength(3);
  for (const hide of f.hide) hide();
  for (const show of f.show) show();
  for (const show of f.show) show();
  expect(lifecycle.pause).toHaveBeenCalledOnce();
  expect(lifecycle.resume).toHaveBeenCalledOnce();
  expect(f.audio.stop).toHaveBeenCalledOnce();
  await instance.dispose();
  await instance.dispose();
  expect(
    f.hide.size + f.show.size + Object.values(f.touch).reduce((n, set) => n + set.size, 0),
  ).toBe(0);
  expect(f.audio.destroy).toHaveBeenCalledOnce();
  expect(lifecycle.dispose).toHaveBeenCalledOnce();
});

it('only the finger that started a hold can release it, and background cancels once', async () => {
  const f = fixture();
  const start = vi.fn(),
    end = vi.fn();
  f.game.definition = {
    ...f.game.definition,
    async mount(target) {
      target.onPress!(start, end);
      return { pause() {}, resume() {}, async dispose() {} };
    },
  };
  const instance = await startKuaishouGame(f.sdk, f.game);
  f.emit('down');
  f.emit('down', [{ identifier: 8, clientX: 10, clientY: 20 }]);
  f.emit('up', [{ identifier: 8, clientX: 10, clientY: 20 }]);
  expect(start).toHaveBeenCalledOnce();
  expect(end).not.toHaveBeenCalled();
  f.emit('up');
  expect(end).toHaveBeenCalledOnce();
  f.emit('down');
  for (const hide of f.hide) hide();
  f.emit('up');
  await instance.dispose();
  expect(end).toHaveBeenCalledTimes(2);
});

it('fails missing capabilities and storage faults explicitly; optional exit and ads fail closed', async () => {
  const f = fixture();
  expect(() => startKuaishouGame(undefined, f.game)).toThrow('ks SDK is unavailable');
  expect(() => createKuaishouSdk({ ...f.sdk, onShow: undefined } as never)).toThrow('ks.onShow');
  const sdk = createKuaishouSdk({ ...f.sdk, exitMiniProgram: undefined });
  const fail = vi.fn();
  sdk.exitMiniProgram({
    success: () => {
      throw new Error('unexpected exit');
    },
    fail,
  });
  expect(fail).toHaveBeenCalledOnce();
  expect(await createNativeAdProvider(sdk, 'placement').show({ opportunityId: 'bonus' })).toEqual({
    status: 'unavailable',
  });
  f.records.set('save', 'retained');
  f.sdk.getStorageSync = () => {
    throw new Error('disk failure');
  };
  expect(() => createKuaishouSdk(f.sdk).getStorageSync('save')).toThrow('disk failure');
  expect(f.records.get('save')).toBe('retained');
});
