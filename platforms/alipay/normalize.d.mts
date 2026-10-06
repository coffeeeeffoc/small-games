import type { NativeSdk } from '@coffeeeeffoc/native-game-shell';
type KeyboardListener = (event: { value: string }) => void;
type KeyboardCallbacks = {
  success?(result?: unknown): void;
  fail?(error: unknown): void;
  complete?(result?: unknown): void;
};
export interface AlipayContentSdk {
  getFileSystemManager?():
    | {
        readFile?(options: {
          filePath: string;
          encoding: string;
          success(result: { data: string | ArrayBuffer }): void;
          fail(error: unknown): void;
        }): void;
      }
    | undefined;
  showKeyboard?(
    options: KeyboardCallbacks & {
      defaultValue: string;
      maxLength: number;
      multiple: boolean;
      confirmHold: boolean;
      confirmType: string;
    },
  ): void;
  hideKeyboard?(options: KeyboardCallbacks): void;
  onKeyboardInput?(listener: KeyboardListener): void;
  offKeyboardInput?(listener: KeyboardListener): void;
  onKeyboardConfirm?(listener: KeyboardListener): void;
  offKeyboardConfirm?(listener: KeyboardListener): void;
  onKeyboardComplete?(listener: KeyboardListener): void;
  offKeyboardComplete?(listener: KeyboardListener): void;
}
export interface AlipaySdk
  extends AlipayContentSdk,
    Omit<
      NativeSdk,
      | 'getStorageSync'
      | 'setStorageSync'
      | 'removeStorageSync'
      | 'getLogManager'
      | 'exitMiniProgram'
      | 'createRewardedVideoAd'
    > {
  getStorageSync(options: { key: string }): { data?: unknown; error?: number };
  setStorageSync(options: { key: string; data: string }): { error?: number } | void;
  removeStorageSync(options: { key: string }): { error?: number } | void;
  exitMiniProgram?(options: { success(): void; fail(): void }): void;
}
export function normalizeAlipaySdk(sdk: AlipaySdk | undefined): NativeSdk & AlipayContentSdk;
export const createAlipaySdk: typeof normalizeAlipaySdk;
