import type { NativeSdk } from '@coffeeeeffoc/native-game-shell';

export interface TapTapSdk extends Omit<NativeSdk, 'getLogManager' | 'exitMiniProgram'> {
  getWindowInfo?(): ReturnType<NativeSdk['getSystemInfoSync']>;
  getLogManager?(): ReturnType<NativeSdk['getLogManager']>;
  exitMiniProgram?(options: Parameters<NativeSdk['exitMiniProgram']>[0]): void;
}
export function normalizeTapTapSdk(sdk: TapTapSdk | undefined): NativeSdk;
