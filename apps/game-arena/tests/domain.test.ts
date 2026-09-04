import { describe, expect, it } from 'vitest';
import { defaultArenaContent } from '@coffeeeeffoc/game-arena/content';
import {
  advanceLeague,
  chooseMutation,
  createArenaState,
  enemyFor,
  hatch,
  hatchArena,
  mutationOptions,
  power,
  settleBattle,
  startBattle,
  type ArenaSave,
} from '@coffeeeeffoc/game-arena/domain';
describe('arena domain', () => {
  it('hatches, mutates, and grows rivals deterministically', () => {
    const creature = hatch(defaultArenaContent, 0.1, 1);
    expect(creature.species).toBe('赛博鸡');
    const mutated = chooseMutation(
      hatchArena(defaultArenaContent, 0.1, 1),
      defaultArenaContent.traits[0],
    );
    expect(mutated.creature?.traits).toHaveLength(1);
    expect(power(enemyFor(defaultArenaContent, creature, 4))).toBeGreaterThan(
      power(enemyFor(defaultArenaContent, creature, 0)),
    );
    expect(mutationOptions(defaultArenaContent, 2)).toHaveLength(3);
  });
  it('settles wins, collection, rewards, and all five league advances', () => {
    let state = hatchArena(defaultArenaContent, 0.9, 1);
    state = { ...state, phase: 'ready', creature: { ...state.creature!, attack: 999 } };
    let save: ArenaSave = { coins: 80, arenaWins: 0, arenaLeague: 1, collection: [], officeDay: 4 };
    for (let tier = 0; tier < 5; tier += 1) {
      state = { ...startBattle(state, defaultArenaContent), battleStep: 8 };
      const result = settleBattle(state, save, defaultArenaContent);
      expect(result.state.win).toBe(true);
      save = result.save;
      state = advanceLeague(result.state);
      if (tier < 4) state = { ...state, phase: 'ready' };
    }
    expect(save).toMatchObject({ coins: 200, arenaWins: 5, arenaLeague: 5, officeDay: 4 });
    expect(save.collection).toHaveLength(1);
    expect(state).toEqual(createArenaState());
  });
});
