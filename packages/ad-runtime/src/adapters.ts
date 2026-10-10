import type { RewardOutcome } from '@coffeeeeffoc/game-contract';

import type { AdProvider, AdProviderRequest } from './runtime.js';

/** Completion callbacks owned by an SDK adapter and never exposed through Game Host. */
export type CallbackAdCallbacks = Readonly<{
  completed(): void;
  dismissed(): void;
  unavailable(): void;
  failed(): void;
}>;

/** Wraps a callback SDK and accepts only its first terminal callback. */
export function createCallbackAdProvider(
  start: (request: AdProviderRequest, callbacks: CallbackAdCallbacks) => void | (() => void),
  options: { timeoutMs?: number } = {},
): AdProvider {
  return {
    show(request) {
      return new Promise<RewardOutcome>((resolve) => {
        let settled = false;
        let cleanup: void | (() => void);
        const release = () => {
          try {
            cleanup?.();
          } catch {
            /* Cleanup cannot change a verified outcome. */
          }
          cleanup = undefined;
        };
        const timer = setTimeout(() => finish('failed'), Math.max(1, options.timeoutMs ?? 45000));
        const finish = (status: RewardOutcome['status']) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          release();
          resolve({ status });
        };
        try {
          cleanup = start(request, {
            completed: () => finish('completed'),
            dismissed: () => finish('dismissed'),
            unavailable: () => finish('unavailable'),
            failed: () => finish('failed'),
          });
          if (settled) release(); // SDKs may complete synchronously before returning teardown.
        } catch {
          finish('failed');
        }
      });
    },
  };
}

/** Scriptable provider used to verify runtime outcomes without a platform SDK. */
export type TestAdProvider = AdProvider & { readonly requests: AdProviderRequest[] };

/** Creates a deterministic provider whose outcomes are consumed in order. */
export function createTestAdProvider(outcomes: Array<RewardOutcome | Error>): TestAdProvider {
  const requests: AdProviderRequest[] = [];
  return {
    requests,
    async show(request) {
      requests.push(request);
      const outcome = outcomes.shift() ?? { status: 'unavailable' };
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
}
