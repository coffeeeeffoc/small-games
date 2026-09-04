import { z } from 'zod';

/** Partial advertising policy resolved across platform, Shell, Game, and opportunity layers. */
export const adPolicySchema = z.object({
  enabled: z.boolean().optional(),
  cooldownMs: z.number().int().nonnegative().optional(),
  maxPerSession: z.number().int().nonnegative().optional(),
});

/** Validated advertising policy fields. */
export type AdPolicy = Readonly<z.infer<typeof adPolicySchema>>;

/** Policy layers ordered from strongest platform rule to weakest Reward Opportunity rule. */
export type AdConfigLayers = Readonly<{
  platform?: AdPolicy;
  shell?: AdPolicy;
  game?: AdPolicy;
  opportunities?: Readonly<Record<string, AdPolicy>>;
}>;

/** Pure decision returned before an adapter may display an advertisement. */
export type AdDecision = Readonly<{
  allowed: boolean;
  reason?: 'disabled' | 'frequency-cap' | 'cooldown';
  policy: Required<AdPolicy>;
}>;

const defaults: Required<AdPolicy> = {
  enabled: true,
  cooldownMs: 0,
  maxPerSession: Number.MAX_SAFE_INTEGER,
};

/** Resolves policy with platform > Shell > Game > Reward Opportunity precedence. */
export function resolveAdPolicy(layers: AdConfigLayers, opportunityId: string): Required<AdPolicy> {
  return {
    ...defaults,
    ...adPolicySchema.parse(layers.opportunities?.[opportunityId] ?? {}),
    ...adPolicySchema.parse(layers.game ?? {}),
    ...adPolicySchema.parse(layers.shell ?? {}),
    ...adPolicySchema.parse(layers.platform ?? {}),
  };
}

/** Applies session frequency and cooldown history without mutating configuration or history. */
export function evaluateAdOffer(
  layers: AdConfigLayers,
  opportunityId: string,
  shownAt: readonly number[],
  now: number,
): AdDecision {
  const policy = resolveAdPolicy(layers, opportunityId);
  if (!policy.enabled) return { allowed: false, reason: 'disabled', policy };
  if (shownAt.length >= policy.maxPerSession) {
    return { allowed: false, reason: 'frequency-cap', policy };
  }
  const latest = shownAt.at(-1);
  if (latest !== undefined && now - latest < policy.cooldownMs) {
    return { allowed: false, reason: 'cooldown', policy };
  }
  return { allowed: true, policy };
}
