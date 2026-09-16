import type { NativeSdk } from '@coffeeeeffoc/native-game-shell';
export type {
  TouchEvent,
  NativeImage as BilibiliImage,
  InnerAudioContext,
  RewardedVideoAd,
} from '@coffeeeeffoc/native-game-shell';
/** Bilibili keeps ownership of the reviewed subpackage loader. */
export interface BilibiliSdk extends NativeSdk {
  loadSubpackage(options: {
    name: string;
    success(): void;
    fail(): void;
    complete(): void;
  }): unknown;
}
