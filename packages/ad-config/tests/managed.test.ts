import { describe, expect, it } from 'vitest';

import {
  defaultManagedAdConfig,
  managedConfigLayers,
  normalizeManagedAdConfig,
  resolveManagedPlacement,
  type ManagedAdConfig,
} from '@coffeeeeffoc/ad-config';

function config(overrides: Partial<ManagedAdConfig> = {}): ManagedAdConfig {
  const base = normalizeManagedAdConfig({
    formatVersion: 1,
    gameId: 'cultivation',
    enabled: true,
    policy: { maxPerSession: 4 },
    creatives: [
      { id: 'spring', title: '春日礼包', ctaLabel: '查看', durationMs: 5000 },
      { id: 'summer', title: '夏日礼包', body: '限时', ctaLabel: '领取', durationMs: 3000 },
    ],
    placements: [
      {
        opportunityId: 'revive',
        creativeId: 'spring',
        policy: { cooldownMs: 60_000 },
        reward: { enabled: true, maxPerSession: 2 },
      },
    ],
  });
  if (!base.success) throw new Error('fixture must validate');
  return { ...base.data, ...overrides };
}

describe('managed ad configuration', () => {
  it('rejects unknown fields, duplicate identities, and dangling creative references', () => {
    const dangling = normalizeManagedAdConfig({
      ...config(),
      placements: [
        { opportunityId: 'revive', creativeId: 'missing', policy: {}, reward: { enabled: true } },
      ],
    });
    expect(dangling.success).toBe(false);
    if (!dangling.success)
      expect(dangling.issues.map((issue) => issue.path.join('.'))).toContain(
        'placements.0.creativeId',
      );

    const duplicate = normalizeManagedAdConfig({
      ...config(),
      placements: [
        { opportunityId: 'revive', creativeId: 'spring', policy: {}, reward: { enabled: true } },
        { opportunityId: 'revive', creativeId: 'summer', policy: {}, reward: { enabled: true } },
      ],
    });
    expect(duplicate.success).toBe(false);

    const strict = normalizeManagedAdConfig({ ...config(), extra: true });
    expect(strict.success).toBe(false);
  });

  it('starts new drafts disabled so saving never serves advertisements', () => {
    const draft = defaultManagedAdConfig('cultivation');
    expect(draft.enabled).toBe(false);
    expect(resolveManagedPlacement(draft, 'revive')).toBeNull();
  });

  it('resolves only enabled, placed opportunities with their creative and reward rule', () => {
    const plan = config();
    expect(resolveManagedPlacement(plan, 'revive')).toEqual({
      creative: plan.creatives[0],
      policy: { cooldownMs: 60_000 },
      reward: { enabled: true, maxPerSession: 2 },
    });
    expect(resolveManagedPlacement(plan, 'unplaced')).toBeNull();
    expect(resolveManagedPlacement(config({ enabled: false }), 'revive')).toBeNull();
    expect(
      resolveManagedPlacement(
        config({
          placements: [
            {
              opportunityId: 'revive',
              creativeId: 'spring',
              policy: {},
              reward: { enabled: false },
            },
          ],
        }),
        'revive',
      )?.reward,
    ).toEqual({ enabled: false, maxPerSession: Number.MAX_SAFE_INTEGER });
  });

  it('maps operator policy onto the Shell and Reward Opportunity precedence layers', () => {
    const layers = managedConfigLayers(config(), 'revive', { platform: { enabled: false } });
    expect(layers.platform).toEqual({ enabled: false });
    expect(layers.shell).toEqual({ maxPerSession: 4 });
    expect(layers.opportunities?.revive).toEqual({ cooldownMs: 60_000 });
  });
});
