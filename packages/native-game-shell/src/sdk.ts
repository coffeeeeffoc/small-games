import type { CanvasGameTarget } from '@coffeeeeffoc/canvas-game-adapter';

/** Native touch coordinates in the SDK's logical screen space. */
export type TouchEvent = {
  changedTouches: Array<{ clientX: number; clientY: number; identifier?: number }>;
};
/** Native Image supports Canvas 2D drawing without a DOM element. */
export type NativeImage = {
  src: string;
  width: number;
  height: number;
  onload: (() => void) | null;
  onerror: (() => void) | null;
};
export type InnerAudioContext = {
  src: string;
  loop: boolean;
  volume: number;
  play(): void;
  stop(): void;
  destroy(): void;
  onError(listener: () => void): void;
  offError(listener: () => void): void;
};
/** SDK-owned rewarded video lifecycle and completion notifications. */
export interface RewardedVideoAd {
  load(): Promise<void>;
  show(): Promise<void>;
  destroy(): void;
  onClose(listener: (result?: { isEnded?: boolean }) => void): void;
  offClose(listener: (result?: { isEnded?: boolean }) => void): void;
  onError(listener: () => void): void;
  offError(listener: () => void): void;
}
/** Allowlisted native API subset, owned solely by Shell. */
export interface NativeSdk {
  createCanvas(): CanvasGameTarget['canvas'];
  createImage?(): NativeImage;
  createInnerAudioContext?(): InnerAudioContext;
  getSystemInfoSync(): { windowWidth: number; windowHeight: number };
  onTouchEnd(listener: (event: TouchEvent) => void): void;
  offTouchEnd(listener: (event: TouchEvent) => void): void;
  onTouchStart?(listener: (event: TouchEvent) => void): void;
  offTouchStart?(listener: (event: TouchEvent) => void): void;
  onTouchMove?(listener: (event: TouchEvent) => void): void;
  offTouchMove?(listener: (event: TouchEvent) => void): void;
  onTouchCancel?(listener: (event: TouchEvent) => void): void;
  offTouchCancel?(listener: (event: TouchEvent) => void): void;
  onHide(listener: () => void): void;
  offHide(listener: () => void): void;
  onShow(listener: (options?: LaunchOptions) => void): void;
  offShow(listener: (options?: LaunchOptions) => void): void;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: string): void;
  removeStorageSync(key: string): void;
  getLogManager(): { info(...values: unknown[]): void };
  exitMiniProgram(options: { success(): void; fail(): void }): void;
  createRewardedVideoAd?(options: { adUnitId: string }): RewardedVideoAd;
}

export type LaunchOptions = { scene?: string | number };
