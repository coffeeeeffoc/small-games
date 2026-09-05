import * as reviewed from './entry.js';
import { startBilibiliShell } from './shell.js';
import type { BilibiliSdk } from './sdk.js';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const taps = new Map<unknown, (event: PointerEvent) => void>();
const sdk: BilibiliSdk = {
  loadSubpackage(options) {
    options.success();
    options.complete();
  },
  createCanvas: () => canvas,
  getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844 }),
  onTouchEnd(listener) {
    const tap = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      listener({
        changedTouches: [
          {
            clientX: ((event.clientX - rect.left) * 390) / rect.width,
            clientY: ((event.clientY - rect.top) * 844) / rect.height,
          },
        ],
      });
    };
    taps.set(listener, tap);
    canvas.addEventListener('pointerup', tap);
  },
  offTouchEnd(listener) {
    const tap = taps.get(listener);
    if (tap) canvas.removeEventListener('pointerup', tap);
    taps.delete(listener);
  },
  onHide() {},
  offHide() {},
  onShow() {},
  offShow() {},
  getStorageSync: (key) => localStorage.getItem(key),
  setStorageSync: (key, value) => localStorage.setItem(key, value),
  removeStorageSync: (key) => localStorage.removeItem(key),
  getLogManager: () => ({ info: (...values) => console.info(...values) }),
  exitMiniProgram: (options) => {
    options.success();
    window.location.reload();
  },
};
void startBilibiliShell(sdk, () => reviewed, { sessionId: 'bilibili-dev-preview' });
