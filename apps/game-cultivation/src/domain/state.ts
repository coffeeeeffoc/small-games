import type { JsonValue } from '@coffeeeeffoc/game-contract';

import type { CultivationContent } from '../content/schema.js';
import { applyChoice, score, type Stats } from './model.js';

/** Cultivation-owned fields embedded in the legacy shared JSON save record. */
export type CultivationSave = Record<string, JsonValue> & {
  coins: number;
  bestCultivation: number;
  cultivationChapter: number;
};

/** Pure, serializable state for one cultivation lifetime. */
export type CultivationState = {
  stats: Stats;
  eventIndex: number;
  log: string;
  ended: boolean;
};

const openingLog = '你出生在一个下雨的夜晚。接生婆说：此子很会睡。';

/** Creates the initial state for a new unblessed lifetime. */
export function createCultivationState(): CultivationState {
  return { stats: { body: 5, spirit: 5, luck: 5 }, eventIndex: 0, log: openingLog, ended: false };
}

/** Applies one event choice and settles the shared save exactly once at the final event. */
export function chooseCultivation(
  state: CultivationState,
  choiceIndex: number,
  content: CultivationContent,
  save: CultivationSave,
): { state: CultivationState; save: CultivationSave } {
  if (state.ended) throw new Error('A completed cultivation life cannot accept another choice');
  const event = content.events[state.eventIndex];
  const choice = event?.choices[choiceIndex];
  if (!choice) throw new Error('Cultivation choice does not exist');

  const stats = applyChoice(state.stats, choice);
  const ended = state.eventIndex === content.events.length - 1;
  const nextIndex = ended ? state.eventIndex : state.eventIndex + 1;
  const nextChapter = content.events[nextIndex]?.chapter ?? event.chapter;
  const nextSave = ended
    ? {
        ...save,
        coins: save.coins + Math.floor(score(stats) / 3),
        bestCultivation: Math.max(save.bestCultivation, score(stats)),
        cultivationChapter: 3,
      }
    : { ...save, cultivationChapter: Math.max(save.cultivationChapter, nextChapter) };

  return {
    state: { stats, eventIndex: nextIndex, log: choice.result, ended },
    save: nextSave,
  };
}

/** Starts a new lifetime, optionally retaining the rewarded luck bonus. */
export function reincarnate(blessed: boolean): CultivationState {
  return {
    stats: blessed ? { body: 6, spirit: 6, luck: 7 } : { body: 5, spirit: 5, luck: 5 },
    eventIndex: 0,
    ended: false,
    log: blessed ? '你带着一缕前世福缘醒来。' : '轮回再启。这一次，你隐约记得前世的雨。',
  };
}
