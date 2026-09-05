import { vi } from 'vitest';
import type { BilibiliSdk, TouchEvent } from '@coffeeeeffoc/shell-bilibili';

export function fakeSdk() {
  const lines: Array<{ text: string; y: number }> = [];
  const rectangles: Array<{ y: number; height: number }> = [];
  let tap: ((event: TouchEvent) => void) | null = null;
  const context = {
    save() {},
    restore() {},
    scale() {},
    clearRect() {
      lines.length = 0;
      rectangles.length = 0;
    },
    fillRect(_x: number, y: number, _width: number, height: number) {
      if (y === 0) {
        lines.length = 0;
        rectangles.length = 0;
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
    getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844 }),
    onTouchEnd: (listener) => {
      tap = listener;
    },
    offTouchEnd: () => {
      tap = null;
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
    choose(index = 0) {
      const button = rectangles[index];
      if (!button) throw new Error('Missing button');
      tap?.({ changedTouches: [{ clientX: 30, clientY: button.y + button.height / 2 }] });
    },
    hasTap: () => tap !== null,
  };
}
