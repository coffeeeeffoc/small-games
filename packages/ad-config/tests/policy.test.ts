import { describe, expect, it } from 'vitest';

import { evaluateAdOffer, resolveAdPolicy } from '@coffeeeeffoc/ad-config';

describe('ad policy', () => {
  it('applies platform, Shell, Game, and Reward Opportunity precedence', () => {
    expect(
      resolveAdPolicy(
        {
          platform: { enabled: false },
          shell: { cooldownMs: 200 },
          game: { cooldownMs: 100, maxPerSession: 3 },
          opportunities: { revive: { enabled: true, cooldownMs: 10, maxPerSession: 9 } },
        },
        'revive',
      ),
    ).toEqual({ enabled: false, cooldownMs: 200, maxPerSession: 3 });
  });

  it('evaluates disabled, session cap, cooldown, and allowed decisions purely', () => {
    expect(evaluateAdOffer({ platform: { enabled: false } }, 'reward', [], 100).reason).toBe(
      'disabled',
    );
    expect(evaluateAdOffer({ platform: { maxPerSession: 1 } }, 'reward', [10], 100).reason).toBe(
      'frequency-cap',
    );
    expect(evaluateAdOffer({ platform: { cooldownMs: 100 } }, 'reward', [50], 100).reason).toBe(
      'cooldown',
    );
    expect(evaluateAdOffer({}, 'reward', [], 100).allowed).toBe(true);
  });
});
