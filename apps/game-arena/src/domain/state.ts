import type { JsonValue } from '@coffeeeeffoc/game-contract';
import type { ArenaContent, Trait } from '../content/schema.js';
import { enemyFor, hatch, mutate, winsBattle, type Creature } from './model.js';

/** Shared save fields read and updated by the arena game. */
export type ArenaSave = Record<string, JsonValue> & {
  coins: number;
  arenaWins: number;
  arenaLeague: number;
  collection: string[];
};
/** User-visible phases in one five-league arena run. */
export type ArenaPhase = 'egg' | 'mutate' | 'ready' | 'battle' | 'result';
/** Complete serializable state for an arena run. */
export type ArenaState = {
  creature: Creature | null;
  phase: ArenaPhase;
  tier: number;
  mutationsLeft: number;
  pickRound: number;
  win: boolean | null;
  battleStep: number;
};
/** Creates a fresh run waiting for the player to hatch a creature. */
export function createArenaState(): ArenaState {
  return {
    creature: null,
    phase: 'egg',
    tier: 0,
    mutationsLeft: 2,
    pickRound: 0,
    win: null,
    battleStep: 0,
  };
}
/** Hatches a deterministic creature and opens its first mutation round. */
export function hatchArena(content: ArenaContent, seed: number, now = Date.now()): ArenaState {
  return { ...createArenaState(), creature: hatch(content, seed, now), phase: 'mutate' };
}
/** Applies one selected mutation and advances toward battle readiness. */
export function chooseMutation(state: ArenaState, trait: Trait): ArenaState {
  if (!state.creature || state.phase !== 'mutate') throw new Error('Mutation is not available');
  return {
    ...state,
    creature: mutate(state.creature, trait),
    pickRound: state.pickRound + 1,
    mutationsLeft: Math.max(0, state.mutationsLeft - 1),
    phase: state.mutationsLeft <= 1 ? 'ready' : 'mutate',
  };
}
/** Starts the eight-step automatic battle and records its deterministic outcome. */
export function startBattle(state: ArenaState, content: ArenaContent): ArenaState {
  if (!state.creature || state.phase !== 'ready') throw new Error('Battle is not ready');
  return {
    ...state,
    phase: 'battle',
    battleStep: 0,
    win: winsBattle(state.creature, enemyFor(content, state.creature, state.tier)),
  };
}
/** Settles a completed battle and applies win rewards to shared save data. */
export function settleBattle(
  state: ArenaState,
  save: ArenaSave,
  content: ArenaContent,
): { state: ArenaState; save: ArenaSave } {
  if (!state.creature || state.phase !== 'battle' || state.battleStep < 8)
    throw new Error('Battle is not complete');
  const win =
    state.win ?? winsBattle(state.creature, enemyFor(content, state.creature, state.tier));
  return {
    state: { ...state, phase: 'result', battleStep: 8, win },
    save: win
      ? {
          ...save,
          coins: save.coins + 12 + state.tier * 6,
          arenaWins: save.arenaWins + 1,
          arenaLeague: Math.max(save.arenaLeague, state.tier + 1),
          collection: [...new Set([...save.collection, state.creature.species])],
        }
      : save,
  };
}
/** Advances a winner to the next league or resets after the fifth victory. */
export function advanceLeague(state: ArenaState): ArenaState {
  return state.tier >= 4
    ? createArenaState()
    : {
        ...state,
        tier: state.tier + 1,
        mutationsLeft: 1,
        phase: 'mutate',
        win: null,
        battleStep: 0,
      };
}
/** Applies the mutation earned from a completed Reward Opportunity. */
export function rewardedMutation(state: ArenaState, trait: Trait): ArenaState {
  return state.creature
    ? {
        ...state,
        creature: mutate(state.creature, trait),
        phase: 'ready',
        win: null,
        battleStep: 0,
      }
    : state;
}
