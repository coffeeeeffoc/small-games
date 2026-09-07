import { vi } from 'vitest';
import type { BilibiliSdk, TouchEvent } from '@coffeeeeffoc/shell-bilibili';
import type { BilibiliImage } from '../src/sdk.js';

export function fakeSdk() {
  const lines: Array<{ text: string; y: number }> = [];
  const rectangles: Array<{ y: number; height: number }> = [];
  const drawnImages: Array<{ src: string; coordinates: number[] }> = [];
  const images: BilibiliImage[] = [];
  const audio: Array<ReturnType<NonNullable<BilibiliSdk['createInnerAudioContext']>>> = [];
  const taps = new Set<(event: TouchEvent) => void>();
  const presses = new Set<(event: TouchEvent) => void>();
  const moves = new Set<(event: TouchEvent) => void>();
  const cancels = new Set<(event: TouchEvent) => void>();
  const context = {
    save() {},
    restore() {},
    scale() {},
    translate() {},
    transform() {},
    drawImage(image: { src: string }, ...coordinates: number[]) {
      drawnImages.push({ src: image.src, coordinates });
    },
    clearRect() {
      lines.length = 0;
      rectangles.length = 0;
      drawnImages.length = 0;
    },
    fillRect(_x: number, y: number, _width: number, height: number) {
      if (y === 0) {
        lines.length = 0;
        rectangles.length = 0;
        drawnImages.length = 0;
      } else if (height > 1) rectangles.push({ y, height });
    },
    fillText(text: string, _x: number, y: number) {
      lines.push({ text, y });
    },
    measureText(text: string) {
      return { width: text.length * 17 };
    },
  } as unknown as CanvasRenderingContext2D;
  const records = new Map<string, string>();
  const sdk: BilibiliSdk = {
    loadSubpackage: vi.fn((options) => {
      options.success();
      options.complete();
    }),
    createCanvas: () => ({ width: 390, height: 844, getContext: () => context }),
    createImage: () => {
      let src = '';
      const image: BilibiliImage = {
        width: 390,
        height: 504,
        onload: null,
        onerror: null,
        get src() {
          return src;
        },
        set src(value) {
          src = value;
          queueMicrotask(() => image.onload?.());
        },
      };
      images.push(image);
      return image;
    },
    createInnerAudioContext: () => {
      const sound = {
        src: '',
        loop: false,
        volume: 1,
        play: vi.fn(),
        stop: vi.fn(),
        destroy: vi.fn(),
        onError: vi.fn(),
        offError: vi.fn(),
      };
      audio.push(sound);
      return sound;
    },
    getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844 }),
    onTouchEnd: (listener) => {
      taps.add(listener);
    },
    offTouchEnd: (listener) => {
      taps.delete(listener);
    },
    onTouchStart: (listener) => {
      presses.add(listener);
    },
    offTouchStart: (listener) => {
      presses.delete(listener);
    },
    onTouchMove: (listener) => {
      moves.add(listener);
    },
    offTouchMove: (listener) => {
      moves.delete(listener);
    },
    onTouchCancel: (listener) => {
      cancels.add(listener);
    },
    offTouchCancel: (listener) => {
      cancels.delete(listener);
    },
    onHide: vi.fn(),
    offHide: vi.fn(),
    onShow: vi.fn(),
    offShow: vi.fn(),
    getStorageSync: (key) => records.get(key),
    setStorageSync: (key, value) => {
      records.set(key, value);
    },
    removeStorageSync: (key) => {
      records.delete(key);
    },
    getLogManager: () => ({ info: vi.fn() }),
    exitMiniProgram: vi.fn((options) => options.success()),
  };
  return {
    sdk,
    lines,
    records,
    rectangles,
    images,
    drawnImages,
    audio,
    choose(index = 0) {
      const button = rectangles[index];
      if (!button) throw new Error('Missing button');
      for (const tap of taps)
        tap({ changedTouches: [{ clientX: 30, clientY: button.y + button.height / 2 }] });
    },
    press(index = 0) {
      const button = rectangles[index];
      if (!button) throw new Error('Missing button');
      for (const press of presses)
        press({ changedTouches: [{ clientX: 30, clientY: button.y + button.height / 2 }] });
    },
    release() {
      for (const tap of taps) tap({ changedTouches: [] });
    },
    hasTap: () => taps.size > 0,
    touch(
      phase: 'down' | 'move' | 'up' | 'cancel',
      changedTouches: TouchEvent['changedTouches'] = [],
    ) {
      const listeners = { down: presses, move: moves, up: taps, cancel: cancels }[phase];
      for (const listener of listeners) listener({ changedTouches });
    },
    hasInput: () => presses.size + moves.size + taps.size + cancels.size > 0,
  };
}
