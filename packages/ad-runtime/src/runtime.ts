import { evaluateAdOffer, type AdConfigLayers } from '@coffeeeeffoc/ad-config';
import type {
  AdAuthority,
  AdvertisingPort,
  RewardOpportunity,
  RewardOutcome,
  TelemetryPort,
} from '@coffeeeeffoc/game-contract';

/** Minimal request visible to an advertising provider, excluding the Game reward and SDK details. */
export type AdProviderRequest = Readonly<{ opportunityId: string }>;

/** Host- or managed-owned adapter that validates one advertisement playback. */
export interface AdProvider {
  show(request: AdProviderRequest): Promise<RewardOutcome>;
}

/** Immutable construction inputs for one Game Session advertising runtime. */
export type AdRuntimeOptions = Readonly<{
  authority: AdAuthority;
  config?: AdConfigLayers;
  host?: AdProvider;
  managed?: AdProvider;
  telemetry?: TelemetryPort;
  now?: () => number;
}>;

async function trackSafely(
  telemetry: TelemetryPort | undefined,
  event: string,
  properties: Readonly<Record<string, string>>,
): Promise<void> {
  try {
    await telemetry?.track(event, properties);
  } catch {
    // Advertising telemetry is observational and must never affect the Game outcome.
  }
}

/** Creates a single-authority AdvertisingPort with policy, failure, and frequency handling. */
export function createAdRuntime(options: AdRuntimeOptions): AdvertisingPort {
  const authority = options.authority;
  const config = options.config ?? {};
  const now = options.now ?? Date.now;
  const history = new Map<string, number[]>();
  const queues = new Map<string, Promise<void>>();
  const provider =
    authority === 'host' ? options.host : authority === 'managed' ? options.managed : null;

  async function runOffer(opportunity: RewardOpportunity): Promise<RewardOutcome> {
    if (authority === 'none' || !provider) return { status: 'unavailable' };
    const shownAt = history.get(opportunity.id) ?? [];
    const offeredAt = now();
    const decision = evaluateAdOffer(config, opportunity.id, shownAt, offeredAt);
    if (!decision.allowed) return { status: 'unavailable' };

    try {
      const outcome = await provider.show({ opportunityId: opportunity.id });
      // A dismissal still represents an impression; unavailable/failed attempts do not.
      if (outcome.status === 'completed' || outcome.status === 'dismissed') {
        shownAt.push(offeredAt);
        history.set(opportunity.id, shownAt);
      }
      await trackSafely(options.telemetry, 'ad.offer.completed', {
        opportunityId: opportunity.id,
        authority,
        status: outcome.status,
      });
      return outcome;
    } catch {
      await trackSafely(options.telemetry, 'ad.offer.failed', {
        opportunityId: opportunity.id,
        authority,
      });
      return { status: 'failed' };
    }
  }

  return Object.freeze({
    async offer(opportunity: RewardOpportunity): Promise<RewardOutcome> {
      const previous = queues.get(opportunity.id) ?? Promise.resolve();
      const execution = previous.then(() => runOffer(opportunity));
      const settled = execution.then(
        () => undefined,
        () => undefined,
      );
      queues.set(opportunity.id, settled);

      try {
        return await execution;
      } finally {
        if (queues.get(opportunity.id) === settled) queues.delete(opportunity.id);
      }
    },
  });
}
