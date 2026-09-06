import { resolveManagedPlacement, type ManagedAdConfig } from '@coffeeeeffoc/ad-config';
import type { AdProvider, AdProviderRequest } from '@coffeeeeffoc/ad-runtime';
import type { RewardOutcome } from '@coffeeeeffoc/game-contract';

export type ManagedAdProviderOptions = Readonly<{
  now?: () => number;
  intervalMs?: number;
}>;

/** In-page rewarded advertisement; a reward requires watching the configured full duration. */
export function createManagedAdProvider(
  plan: ManagedAdConfig,
  options: ManagedAdProviderOptions = {},
): AdProvider {
  const now = options.now ?? Date.now;
  const intervalMs = options.intervalMs ?? 250;
  return {
    show(request: AdProviderRequest): Promise<RewardOutcome> {
      const placement = resolveManagedPlacement(plan, request.opportunityId);
      if (!placement) return Promise.resolve({ status: 'unavailable' });
      return new Promise<RewardOutcome>((resolve) => {
        const root = document.createElement('div');
        root.className = 'managed-ad';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', placement.creative.title);
        const title = document.createElement('h2');
        title.textContent = placement.creative.title;
        const body = document.createElement('p');
        body.textContent = placement.creative.body ?? '';
        const cta = document.createElement('strong');
        cta.textContent = placement.creative.ctaLabel;
        const countdown = document.createElement('p');
        countdown.className = 'managed-ad-countdown';
        countdown.textContent = `剩余 ${Math.ceil(placement.creative.durationMs / 1000)} 秒`;
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = '关闭';
        root.append(title, body, cta, countdown, close);
        document.body.appendChild(root);

        let settled = false;
        const startedAt = now();
        const timer = setInterval(() => {
          const remaining = placement.creative.durationMs - (now() - startedAt);
          if (remaining <= 0) finish({ status: 'completed' });
          else countdown.textContent = `剩余 ${Math.ceil(remaining / 1000)} 秒`;
        }, intervalMs);
        const finish = (outcome: RewardOutcome) => {
          if (settled) return;
          settled = true;
          clearInterval(timer);
          root.remove();
          resolve(outcome);
        };
        close.addEventListener('click', () => finish({ status: 'dismissed' }));
      });
    },
  };
}
