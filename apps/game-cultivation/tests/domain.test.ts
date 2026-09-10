import { describe, expect, it } from 'vitest';

import {
  applyChoice,
  chooseCultivation,
  createCultivationState,
  realm,
  reincarnate,
  score,
  type CultivationSave,
} from '@coffeeeeffoc/game-cultivation/domain';
import { defaultCultivationContent } from '@coffeeeeffoc/game-cultivation/content';

describe('cultivation domain', () => {
  it('preserves bounded stats and realm scoring', () => {
    expect(
      applyChoice({ body: 1, spirit: 1, luck: 1 }, { text: '', result: '', delta: { body: -3 } })
        .body,
    ).toBe(0);
    expect(score({ body: 1, spirit: 1, luck: 1 })).toBe(7);
    expect(realm(createCultivationState().stats)).toBe('炼气');
    expect(realm({ body: 20, spirit: 20, luck: 20 })).toBe('元婴');
    expect(realm({ body: 30, spirit: 30, luck: 30 })).toBe('飞升');
  });

  it('completes all eighteen events and preserves settlement save fields', () => {
    let state = createCultivationState();
    let save: CultivationSave = {
      coins: 80,
      bestCultivation: 0,
      cultivationChapter: 1,
      bestOffice: 12,
    };

    for (let index = 0; index < 18; index += 1) {
      ({ state, save } = chooseCultivation(state, 0, defaultCultivationContent, save));
    }

    expect(state.ended).toBe(true);
    expect(save.cultivationChapter).toBe(3);
    expect(save.bestCultivation).toBe(score(state.stats));
    expect(save.coins).toBe(80 + Math.floor(score(state.stats) / 3));
    expect(save.bestOffice).toBe(12);
  });

  it('keeps the rewarded reincarnation bonus', () => {
    expect(reincarnate(true).stats).toEqual({ body: 6, spirit: 6, luck: 7 });
    expect(reincarnate(false).stats).toEqual({ body: 5, spirit: 5, luck: 5 });
  });
});
