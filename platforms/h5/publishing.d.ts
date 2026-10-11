export type AdOutcome = Readonly<{ status: 'completed' | 'dismissed' | 'unavailable' | 'failed' }>;
export type ShareOutcome = Readonly<{
  status: 'shared' | 'copied' | 'cancelled' | 'unavailable' | 'failed';
  url: string;
}>;
export type ChallengeParams = Readonly<Record<string, string | number | boolean | undefined>>;
export type ShareRequest = Readonly<{
  title?: string;
  text?: string;
  params?: ChallengeParams;
  url?: string;
}>;
export type AdProvider = {
  show(request: { opportunityId: string; kind?: 'rewarded' | 'interstitial' }): Promise<AdOutcome>;
  dispose?(): void;
};
export function publicChallengeUrl(base: string, params?: ChallengeParams): string;
export function shareChallenge(
  options: ShareRequest,
  environment?: typeof globalThis,
): Promise<ShareOutcome>;
export function createSimulationAdProvider(options?: {
  document?: Document;
  root?: HTMLElement;
  durationMs?: number;
}): AdProvider & { dispose(): void };
export function createH5Publishing(options: {
  gameId: string;
  title: string;
  adMode?: 'mock' | 'off' | 'host';
  provider?: AdProvider;
  publicUrl?: string;
  root?: HTMLElement;
  pause?: () => (() => void) | void;
  durationMs?: number;
  cooldownMs?: number;
  maxPerSession?: number;
  now?: () => number;
  environment?: typeof globalThis;
}): Readonly<{
  share(request?: ShareRequest): Promise<ShareOutcome>;
  rewarded(request: { placement: string }): Promise<AdOutcome>;
  interstitial(request: { placement: string; naturalBreak: true }): Promise<AdOutcome>;
  dispose(): void;
}>;
