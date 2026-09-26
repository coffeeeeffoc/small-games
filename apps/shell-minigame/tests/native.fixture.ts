import { expect, vi } from 'vitest';
import type { NativeSdk, TouchEvent } from '@coffeeeeffoc/native-game-shell';
import type { StandaloneBilibiliSdk } from '@coffeeeeffoc/platform-bilibili';

export function fakeSdk() {
  const labels = new Map<string, number>();
  const touches = new Set<(event: TouchEvent) => void>();
  const shows = new Set<Parameters<NativeSdk['onShow']>[0]>();
  const hides = new Set<() => void>();
  const records = new Map<string, string>();
  const audio: Array<{
    play: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }> = [];
  const context = new Proxy(
    {
      fillRect(_x: number, y: number) {
        if (y === 0) labels.clear();
      },
      fillText(text: string, _x: number, y: number) {
        labels.set(text, y);
      },
      measureText(text: string) {
        return { width: text.length * 17 };
      },
      createLinearGradient() {
        return { addColorStop() {} };
      },
      createRadialGradient() {
        return { addColorStop() {} };
      },
    },
    {
      get(target, key) {
        return Reflect.get(target, key) ?? (() => {});
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  const sdk: StandaloneBilibiliSdk = {
    createCanvas: () => ({ width: 390, height: 844, getContext: () => context }),
    createInnerAudioContext() {
      const sound = {
        src: '',
        loop: false,
        volume: 1,
        play: vi.fn(),
        stop: vi.fn(),
        destroy: vi.fn(),
        onError() {},
        offError() {},
      };
      audio.push(sound);
      return sound;
    },
    getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844 }),
    onTouchEnd: (listener) => {
      touches.add(listener);
    },
    offTouchEnd: (listener) => {
      touches.delete(listener);
    },
    onShow: (listener) => {
      shows.add(listener);
    },
    offShow: (listener) => {
      shows.delete(listener);
    },
    onHide: (listener) => {
      hides.add(listener);
    },
    offHide: (listener) => {
      hides.delete(listener);
    },
    getStorageSync: (key) => records.get(key),
    setStorageSync: (key, value) => {
      records.set(key, value);
    },
    removeStorageSync: (key) => {
      records.delete(key);
    },
    getLogManager: () => ({ info() {} }),
    exitMiniProgram: (options) => options.success(),
    launchSuccess: vi.fn(),
    checkScene: (options) => options.success({ isExist: true }),
    navigateToScene: vi.fn((options) => options.success()),
    addShortcut: vi.fn((options) => options.success()),
    showToast: vi.fn(),
  };
  return {
    sdk,
    labels,
    records,
    audio,
    shows,
    hides,
    choose(text: string) {
      const label = [...labels].reverse().find(([value]) => value.includes(text));
      expect(label, `Missing action ${text}`).toBeDefined();
      for (const tap of [...touches])
        tap({ changedTouches: [{ clientX: 30, clientY: label![1] - 10 }] });
    },
    has(text: string) {
      return [...labels.keys()].some((label) => label.includes(text));
    },
  };
}
