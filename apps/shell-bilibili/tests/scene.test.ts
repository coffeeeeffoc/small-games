import { describe, expect, it, vi } from 'vitest';
import { startBilibiliShell, reviewedOffice } from '@coffeeeeffoc/shell-bilibili';
import type { CanvasGameTarget } from '@coffeeeeffoc/canvas-game-adapter';
import type { BilibiliImage } from '../src/sdk.js';
import { fakeSdk } from './fixture.js';

describe('native Office scene capabilities', () => {
  it('loads local scene media, cancels pointers on pause and owns final resource cleanup', async () => {
    const fake = fakeSdk();
    const canvas = fake.sdk.createCanvas();
    const createCanvas = vi.fn(fake.sdk.createCanvas);
    fake.sdk.createCanvas = createCanvas;
    const images: BilibiliImage[] = [];
    fake.sdk.createImage = () => {
      const image: BilibiliImage = {
        src: '',
        width: 100,
        height: 200,
        onload: null,
        onerror: null,
      };
      images.push(image);
      return image;
    };
    const audio = {
      src: '',
      loop: false,
      volume: 1,
      play: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      onError: vi.fn(),
      offError: vi.fn(),
    };
    fake.sdk.createInnerAudioContext = () => audio;
    let target!: CanvasGameTarget;
    const shell = await startBilibiliShell(
      fake.sdk,
      () => ({
        ...reviewedOffice,
        definition: {
          ...reviewedOffice.definition,
          async mount(value) {
            target = value;
            return { pause() {}, resume() {}, async dispose() {} };
          },
        },
      }),
      { gameId: 'office', sessionId: 'scene-capabilities', canvas },
    );
    expect(target.canvas).toBe(canvas);
    expect(createCanvas).not.toHaveBeenCalled();
    const loaded = target.loadImage!('office-scene/background.png');
    expect(images[0].src).toBe('office/office-scene/background.png');
    images[0].onload!();
    expect(await loaded).toBe(images[0]);
    expect(images[0].onload).toBeNull();
    await expect(target.loadImage!('../other/game.js')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    const broken = target.loadImage!('office-scene/missing.png');
    images[1].onerror!();
    await expect(broken).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    const pending = target.loadImage!('office-scene/pending.png');
    const rejectedOnDispose = expect(pending).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    const sound = target.createSound!('office-scene/footsteps.wav', { loop: true, volume: 0.4 });
    expect(audio).toMatchObject({
      src: 'office/office-scene/footsteps.wav',
      loop: true,
      volume: 0.4,
    });
    sound.setVolume!(2);
    expect(audio.volume).toBe(1);
    sound.play();
    const pointer = vi.fn();
    target.onPointer!(pointer);
    fake.touch('down', [{ identifier: 7, clientX: 20, clientY: 30 }]);
    fake.touch('move', [{ identifier: 7, clientX: 40, clientY: 50 }]);
    expect(pointer.mock.calls.map(([event]) => event.phase)).toEqual(['down', 'move']);
    shell.pause();
    expect(pointer).toHaveBeenLastCalledWith({ phase: 'cancel', pointerId: 7, x: 40, y: 50 });
    expect(audio.stop).toHaveBeenCalledOnce();
    fake.touch('down', [{ identifier: 8, clientX: 60, clientY: 70 }]);
    sound.play();
    expect(pointer).toHaveBeenCalledTimes(3);
    expect(audio.play).toHaveBeenCalledOnce();
    shell.resume();
    fake.touch('down', [{ identifier: 8, clientX: 60, clientY: 70 }]);
    fake.touch('cancel');
    expect(pointer).toHaveBeenLastCalledWith({ phase: 'cancel', pointerId: 8, x: 60, y: 70 });
    sound.play();
    expect(audio.play).toHaveBeenCalledTimes(2);
    await shell.dispose();
    await rejectedOnDispose;
    await shell.dispose();
    sound.play();
    expect(audio.destroy).toHaveBeenCalledOnce();
    expect(audio.offError).toHaveBeenCalledWith(audio.onError.mock.calls[0][0]);
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(images[2].onload).toBeNull();
    expect(fake.hasInput()).toBe(false);
  });

  it('moves and looks around the native Office scene, then clears input and audio on pause', async () => {
    vi.useFakeTimers();
    const fake = fakeSdk();
    const instance = await startBilibiliShell(fake.sdk, () => reviewedOffice, {
      gameId: 'office',
      sessionId: 'office-scene',
    });
    const text = () => fake.lines.map((line) => line.text);
    const tap = (x: number, y: number) => {
      const point = [{ identifier: 1, clientX: x, clientY: y }];
      fake.touch('down', point);
      fake.touch('up', point);
    };
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(text().join(' ')).toContain('周一');
      expect(fake.paths.length).toBeGreaterThan(100);
      tap(195, 844 * 0.65 + 28);
      expect(text()).toContain('暂停');

      const beforeLook = structuredClone(fake.paths);
      fake.touch('down', [{ identifier: 2, clientX: 285, clientY: 410 }]);
      fake.touch('move', [{ identifier: 2, clientX: 345, clientY: 430 }]);
      fake.touch('up', [{ identifier: 2, clientX: 345, clientY: 430 }]);
      await vi.advanceTimersByTimeAsync(34);
      expect(fake.paths).not.toEqual(beforeLook);

      const beforeMove = structuredClone(fake.paths);
      fake.touch('down', [{ identifier: 3, clientX: 80, clientY: 720 }]);
      fake.touch('move', [{ identifier: 3, clientX: 80, clientY: 655 }]);
      await vi.advanceTimersByTimeAsync(350);
      expect(fake.paths).not.toEqual(beforeMove);
      expect(fake.audio.some((sound) => vi.mocked(sound.play).mock.calls.length > 0)).toBe(true);
      vi.mocked(fake.sdk.onHide).mock.calls[0][0]();
      const before = [...text()];
      const frame = structuredClone(fake.paths);
      fake.touch('move', [{ identifier: 3, clientX: 100, clientY: 600 }]);
      await vi.advanceTimersByTimeAsync(1000);
      expect(text()).toEqual(before);
      expect(fake.paths).toEqual(frame);
      expect(fake.audio.every((sound) => vi.mocked(sound.stop).mock.calls.length > 0)).toBe(true);
      vi.mocked(fake.sdk.onShow).mock.calls[0][0]();
      expect(text()).toContain('暂停');
    } finally {
      await instance.dispose();
      expect(fake.hasInput()).toBe(false);
      expect(fake.audio.every((sound) => vi.mocked(sound.destroy).mock.calls.length === 1)).toBe(
        true,
      );
      const frame = structuredClone(fake.paths);
      await vi.advanceTimersByTimeAsync(1000);
      expect(fake.paths).toEqual(frame);
      vi.useRealTimers();
    }
  });
});
