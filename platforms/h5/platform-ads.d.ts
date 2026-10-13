import type { AdProvider } from './publishing.js';

export function createPlatformAdProvider(options: {
  platform: 'taptap-h5' | 'wechat' | 'douyin' | 'bilibili';
  adUnitId?: string;
  environment?: object;
  timeoutMs?: number;
}): AdProvider & { dispose(): void };
