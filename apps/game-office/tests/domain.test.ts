import { describe, expect, it } from 'vitest';

import { defaultOfficeContent } from '@coffeeeeffoc/game-office/content';
import {
  advanceOfficeTick,
  buyPrivacyScreen,
  createOfficeState,
  finishOfficeDay,
  restartOfficeRun,
  rescueOfficeRun,
  tickOffice,
  upgradeCost,
  type OfficeSave,
} from '@coffeeeeffoc/game-office/domain';

describe('office domain', () => {
  it('earns only while safely slacking and applies shield protection', () => {
    expect(tickOffice({ joy: 0, suspicion: 0 }, true, false, 0)).toEqual({ joy: 2, suspicion: 0 });
    expect(tickOffice({ joy: 0, suspicion: 0 }, true, true, 0).suspicion).toBe(8);
    expect(tickOffice({ joy: 0, suspicion: 0 }, true, true, 2).suspicion).toBe(4);
  });

  it('keeps the legacy upgrade curve and shared-wallet purchase', () => {
    expect(upgradeCost(2)).toBe(39);
    const state = createOfficeState(defaultOfficeContent);
    const save: OfficeSave = { coins: 80, bestOffice: 0, officeDay: 1, arenaWins: 3 };
    const result = buyPrivacyScreen(state, save);
    expect(result.state.shieldLevel).toBe(1);
    expect(result.save).toMatchObject({ coins: 65, arenaWins: 3 });
    expect(restartOfficeRun(result.state, defaultOfficeContent).shieldLevel).toBe(1);
  });

  it('runs all five day settlements and preserves unrelated save fields', () => {
    let state = createOfficeState(defaultOfficeContent);
    let save: OfficeSave = { coins: 80, bestOffice: 0, officeDay: 1, arenaWins: 4 };
    for (let day = 0; day < 5; day += 1) {
      state = { ...state, joy: 20, time: 0, intro: false };
      ({ state, save } = finishOfficeDay(state, save, defaultOfficeContent));
    }
    expect(state).toMatchObject({ day: 4, total: 100, done: true });
    expect(save).toMatchObject({ coins: 133, bestOffice: 100, officeDay: 5, arenaWins: 4 });
  });

  it('catches at full suspicion and rewarded rescue continues the same day', () => {
    const initial = {
      ...createOfficeState(defaultOfficeContent),
      intro: false,
      slacking: true,
      suspicion: 96,
    };
    const caught = advanceOfficeTick(initial, true);
    expect(caught).toMatchObject({ caught: true, suspicion: 100, day: 0 });
    expect(rescueOfficeRun(caught)).toMatchObject({ caught: false, suspicion: 15, day: 0 });
  });
});
