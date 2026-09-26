import { expect, vi } from 'vitest';
import type { ReviewedModule, TouchEvent } from '@coffeeeeffoc/native-game-shell';
import type { DouyinSdk } from '../src/index.js';

export function fixture() {
  const touch = {
    down: new Set<(event: TouchEvent) => void>(),
    move: new Set<(event: TouchEvent) => void>(),
    up: new Set<(event: TouchEvent) => void>(),
    cancel: new Set<(event: TouchEvent) => void>(),
  };
  const hide = new Set<() => void>();
  const show = new Set<() => void>();
  const records = new Map<string, string>();
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
  const sdk: DouyinSdk = {
    createCanvas() {
      expect(this).toBe(sdk);
      return { width: 0, height: 0, getContext: () => null };
    },
    createInnerAudioContext() {
      expect(this).toBe(sdk);
      return audio;
    },
    getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844 }),
    onTouchStart: (fn) => {
      touch.down.add(fn);
    },
    offTouchStart: (fn) => {
      touch.down.delete(fn);
    },
    onTouchMove: (fn) => {
      touch.move.add(fn);
    },
    offTouchMove: (fn) => {
      touch.move.delete(fn);
    },
    onTouchEnd: (fn) => {
      touch.up.add(fn);
    },
    offTouchEnd: (fn) => {
      touch.up.delete(fn);
    },
    onTouchCancel: (fn) => {
      touch.cancel.add(fn);
    },
    offTouchCancel: (fn) => {
      touch.cancel.delete(fn);
    },
    onHide: (fn) => {
      hide.add(fn);
    },
    offHide: (fn) => {
      hide.delete(fn);
    },
    onShow: (fn) => {
      show.add(fn);
    },
    offShow: (fn) => {
      show.delete(fn);
    },
    getStorageSync(key) {
      return records.get(key) ?? '';
    },
    setStorageSync: (key, value) => {
      records.set(key, value);
    },
    removeStorageSync: (key) => {
      records.delete(key);
    },
    exitMiniProgram: (options) => options.success(),
  };
  const game: ReviewedModule = {
    definition: {
      manifest: {
        gameId: 'fixture',
        version: '1.0.0',
        gameContractVersion: 1,
        contentSchemaVersion: 1,
        capabilities: ['storage', 'advertising'],
        loadModes: ['native-package'],
        entry: 'game.js',
        integrity: 'fixture',
      },
      mount: vi.fn(async () => ({ pause: vi.fn(), resume: vi.fn(), dispose: vi.fn() })),
    },
    content: { gameId: 'fixture', schemaVersion: 1, revision: 0, payload: {} },
  };
  const emit = (
    phase: keyof typeof touch,
    points = [{ identifier: 7, clientX: 42, clientY: 83 }],
  ) => {
    for (const fn of touch[phase]) fn({ changedTouches: points });
  };
  return { sdk, game, touch, emit, hide, show, records, audio };
}
