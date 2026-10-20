import type { AdOutcome, AdProvider } from './publishing.js';

export function createPlatformAdProvider(options: {
  platform: 'taptap-h5' | 'wechat' | 'douyin' | 'bilibili';
  adUnitId?: string;
  environment?: object;
  timeoutMs?: number;
  onEvent?: (event: { event: string; [key: string]: unknown }) => void;
}): AdProvider & {
  timeoutMs: number;
  show(request: {
    opportunityId?: string;
    kind?: 'rewarded' | 'interstitial';
    onShown?: () => void;
  }): Promise<AdOutcome>;
  preload(): Promise<boolean>;
  cancel(): void;
  /** Releases current resources; legacy callers may reuse this provider afterwards. */
  dispose(): void;
};
