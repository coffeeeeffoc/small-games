import type { JsonValue } from '@coffeeeeffoc/game-contract';

import type { OfficeContent } from '../content/schema.js';
import { tickOffice, upgradeCost } from './model.js';

/** Office-owned fields embedded in the legacy shared JSON save record. */
export type OfficeSave = Record<string, JsonValue> & {
  coins: number;
  bestOffice: number;
  officeDay: number;
};

/** Serializable state for one five-day office run. */
export type OfficeState = {
  day: number;
  time: number;
  joy: number;
  total: number;
  suspicion: number;
  slacking: boolean;
  bossWatching: boolean;
  caught: boolean;
  done: boolean;
  intro: boolean;
  shieldLevel: number;
};

/** Creates a fresh Monday run. */
export function createOfficeState(content: OfficeContent): OfficeState {
  return {
    day: 0,
    time: content.days[0].duration,
    joy: 0,
    total: 0,
    suspicion: 0,
    slacking: false,
    bossWatching: false,
    caught: false,
    done: false,
    intro: true,
    shieldLevel: 0,
  };
}

/** Starts another week while retaining session-scoped privacy-screen upgrades. */
export function restartOfficeRun(state: OfficeState, content: OfficeContent): OfficeState {
  return { ...createOfficeState(content), shieldLevel: state.shieldLevel };
}

/** Advances one active second using an externally sampled boss-inspection result. */
export function advanceOfficeTick(state: OfficeState, bossWatching: boolean): OfficeState {
  if (state.intro || state.caught || state.done || state.time <= 0) return state;
  const metrics = tickOffice(state, state.slacking, bossWatching, state.shieldLevel);
  return {
    ...state,
    ...metrics,
    bossWatching,
    time: state.time - 1,
    caught: metrics.suspicion >= 100,
  };
}

/** Settles the current day or the full campaign while preserving unrelated save fields. */
export function finishOfficeDay(
  state: OfficeState,
  save: OfficeSave,
  content: OfficeContent,
): { state: OfficeState; save: OfficeSave } {
  const total = state.total + state.joy;
  if (state.day === content.days.length - 1) {
    return {
      state: { ...state, total, done: true, slacking: false },
      save: {
        ...save,
        coins: save.coins + Math.floor(total / 3),
        bestOffice: Math.max(save.bestOffice, total),
        officeDay: 5,
      },
    };
  }

  const nextDay = state.day + 1;
  return {
    state: {
      ...state,
      day: nextDay,
      time: content.days[nextDay].duration,
      joy: 0,
      total,
      suspicion: 0,
      slacking: false,
      bossWatching: false,
      intro: true,
    },
    save: {
      ...save,
      coins: save.coins + 5,
      officeDay: Math.max(save.officeDay, nextDay + 1),
    },
  };
}

/** Purchases one of the three privacy-screen levels when affordable. */
export function buyPrivacyScreen(
  state: OfficeState,
  save: OfficeSave,
): { state: OfficeState; save: OfficeSave } {
  const cost = upgradeCost(state.shieldLevel);
  if (state.shieldLevel >= 3 || save.coins < cost) return { state, save };
  return {
    state: { ...state, shieldLevel: state.shieldLevel + 1 },
    save: { ...save, coins: save.coins - cost },
  };
}

/** Applies the completed rewarded rescue without changing the current day. */
export function rescueOfficeRun(state: OfficeState): OfficeState {
  return { ...state, suspicion: 15, caught: false, slacking: false };
}
