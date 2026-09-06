import { z } from 'zod';

import { adPolicySchema, type AdConfigLayers, type AdPolicy } from './policy.js';

/** Operator-authored material displayed by a Managed Ad through the current Game Host. */
export const managedCreativeSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9_-]+$/),
    title: z.string().min(1).max(80),
    body: z.string().max(200).optional(),
    ctaLabel: z.string().min(1).max(24),
    /** Watching this full duration is the adapter-verified complete view. */
    durationMs: z.number().int().min(1000).max(30000),
  })
  .strict();

export type ManagedCreative = Readonly<z.infer<typeof managedCreativeSchema>>;

/** Rewards are granted only for complete views, bounded per Game Session. */
export const managedRewardRuleSchema = z
  .object({
    enabled: z.boolean(),
    maxPerSession: z.number().int().nonnegative().optional(),
  })
  .strict();

export type ManagedRewardRule = Readonly<z.infer<typeof managedRewardRuleSchema>>;

/** Binds one Reward Opportunity to a creative with its frequency and reward rules. */
export const managedPlacementSchema = z
  .object({
    opportunityId: z.string().min(1).max(128),
    creativeId: managedCreativeSchema.shape.id,
    policy: adPolicySchema,
    reward: managedRewardRuleSchema,
  })
  .strict();

export type ManagedPlacement = Readonly<z.infer<typeof managedPlacementSchema>>;

/** Published operator configuration; drafts never reach players until projected. */
export const managedAdConfigSchema = z
  .object({
    formatVersion: z.literal(1),
    gameId: z.string().min(1).max(128),
    enabled: z.boolean(),
    policy: adPolicySchema,
    creatives: z.array(managedCreativeSchema).min(1).max(32),
    placements: z.array(managedPlacementSchema).max(64),
  })
  .strict()
  .superRefine((config, ctx) => {
    const creativeIds = new Set<string>();
    config.creatives.forEach((creative, index) => {
      if (creativeIds.has(creative.id))
        ctx.addIssue({
          code: 'custom',
          path: ['creatives', index, 'id'],
          message: '素材 ID 重复',
        });
      creativeIds.add(creative.id);
    });
    const opportunityIds = new Set<string>();
    config.placements.forEach((placement, index) => {
      if (opportunityIds.has(placement.opportunityId))
        ctx.addIssue({
          code: 'custom',
          path: ['placements', index, 'opportunityId'],
          message: 'Reward Opportunity 重复',
        });
      opportunityIds.add(placement.opportunityId);
      if (!creativeIds.has(placement.creativeId))
        ctx.addIssue({
          code: 'custom',
          path: ['placements', index, 'creativeId'],
          message: '素材不存在',
        });
    });
  });

export type ManagedAdConfig = Readonly<z.infer<typeof managedAdConfigSchema>>;

/** Accessible validation feedback shared by Studio, Management, and publication. */
export type ManagedAdValidationIssue = {
  path: Array<string | number>;
  message: string;
};

export type ManagedAdValidationResult =
  | { success: true; data: ManagedAdConfig }
  | { success: false; issues: ManagedAdValidationIssue[] };

/** One validation boundary for draft saves and publication; unknown fields are rejected. */
export function normalizeManagedAdConfig(input: unknown): ManagedAdValidationResult {
  const result = managedAdConfigSchema.safeParse(input);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.filter((part): part is string | number => typeof part !== 'symbol'),
      message: issue.message,
    })),
  };
}

/** A fresh draft starts disabled so saving can never serve advertisements by accident. */
export function defaultManagedAdConfig(gameId: string): ManagedAdConfig {
  return managedAdConfigSchema.parse({
    formatVersion: 1,
    gameId,
    enabled: false,
    policy: {},
    creatives: [{ id: 'welcome', title: '欢迎回来', ctaLabel: '了解更多', durationMs: 5000 }],
    placements: [],
  });
}

/** Resolved Managed Ad rules for one Reward Opportunity. */
export type ManagedPlacementResolution = Readonly<{
  creative: ManagedCreative;
  policy: AdPolicy;
  reward: Readonly<{ enabled: boolean; maxPerSession: number }>;
}>;

/** An unplaced or disabled Reward Opportunity is never served as a Managed Ad. */
export function resolveManagedPlacement(
  config: ManagedAdConfig,
  opportunityId: string,
): ManagedPlacementResolution | null {
  if (!config.enabled) return null;
  const placement = config.placements.find((entry) => entry.opportunityId === opportunityId);
  if (!placement) return null;
  const creative = config.creatives.find((entry) => entry.id === placement.creativeId);
  if (!creative) return null;
  return {
    creative,
    policy: placement.policy,
    reward: {
      enabled: placement.reward.enabled,
      maxPerSession: placement.reward.maxPerSession ?? Number.MAX_SAFE_INTEGER,
    },
  };
}

/** Operator configuration supplies the Shell and Reward Opportunity precedence layers. */
export function managedConfigLayers(
  config: ManagedAdConfig,
  opportunityId: string,
  base: AdConfigLayers = {},
): AdConfigLayers {
  const placement = config.placements.find((entry) => entry.opportunityId === opportunityId);
  return {
    ...base,
    shell: base.shell ?? config.policy,
    opportunities: {
      ...(placement ? { [opportunityId]: placement.policy } : {}),
      ...base.opportunities,
    },
  };
}
