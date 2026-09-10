import { describe, expect, it } from 'vitest';
import { defaultArenaContent as content } from '@coffeeeeffoc/game-arena/content';
import {
  advanceLeague,
  chooseMutation,
  createArenaState,
  hatchArena,
  settleBattle,
  startBattle,
  controlArena,
  tickArena,
  createDuel,
  inputDuel,
  tickDuel,
  hatch,
  enemyFor,
  type ArenaSave,
} from '@coffeeeeffoc/game-arena/domain';

const creature = hatch(content, 0.1, 1);
const fresh = () => createDuel(creature, enemyFor(content, creature, 0), 0);
const advance = (d = fresh(), ticks = 15) => {
  for (let i = 0; i < ticks; i++) d = tickDuel(d);
  return d;
};

describe('live cricket combat', () => {
  it('bases victory on actual attacks, with range, timing, stamina and no precomputed winner', () => {
    const d = fresh();
    expect(d.winner).toBeNull();
    const miss = inputDuel(inputDuel(d, 'tease'), 'release');
    expect(miss.enemyHp).toBe(d.enemyHp);
    const close = { ...d, x: 43, enemyX: 58 };
    const tap = inputDuel(inputDuel(close, 'tease'), 'release');
    const hit = inputDuel(advance(inputDuel(close, 'tease')), 'release');
    expect(hit.enemyHp).toBeLessThan(tap.enemyHp);
    expect(hit.stamina).toBeLessThan(d.stamina);
    expect(hit.hits).toBe(1);
    expect(inputDuel(hit, 'tease')).toBe(hit);
    const exhausted = { ...close, stamina: 5 };
    expect(inputDuel(exhausted, 'tease')).toBe(exhausted);
    const overcharged = inputDuel(advance(inputDuel(close, 'tease'), 32), 'release');
    expect(overcharged.enemyHp).toBeGreaterThan(hit.enemyHp);
  });
  it('rewards well-timed dodges; early dodges expire and recovering during a strike is dangerous', () => {
    const danger = { ...fresh(), windup: 0.3 };
    const dodge = advance(inputDuel(danger, 'dodge'), 7);
    expect(dodge.hp).toBe(danger.hp);
    expect(dodge.parries).toBe(1);
    expect(advance(inputDuel({ ...danger, windup: 0.7 }, 'dodge'), 15).hp).toBeLessThan(danger.hp);
    const hurt = advance(danger, 7);
    const resting = advance(inputDuel(danger, 'rest'), 7);
    expect(resting.hp).toBeLessThan(hurt.hp);
    expect(advance(inputDuel({ ...fresh(), stamina: 30 }, 'rest')).stamina).toBeGreaterThan(45);
  });
  it('cancel never attacks, terminal state cannot change, and inactivity loses', () => {
    const charged = advance(inputDuel(fresh(), 'tease'));
    const cancelled = inputDuel(charged, 'cancel');
    expect(cancelled.holding).toBe(false);
    expect(cancelled.charge).toBe(0);
    expect(cancelled.enemyHp).toBe(charged.enemyHp);
    const idle = advance(fresh(), 1201);
    expect(idle.winner).toBe(false);
    expect(inputDuel(idle, 'tease')).toBe(idle);
    expect(tickDuel(idle)).toBe(idle);
    expect(tickDuel(fresh(), Number.NaN).time).toBe(0);
  });
  it('lets skilled play win all five leagues and settles each reward exactly once', () => {
    let state = hatchArena(content, 0.2, 1);
    let save: ArenaSave = { coins: 80, arenaWins: 0, arenaLeague: 1, collection: [], officeDay: 4 };
    for (let tier = 0; tier < 5; tier++) {
      while (state.phase === 'mutate') state = chooseMutation(state, content.traits[3]);
      state = startBattle(state, content);
      expect(state.win).toBeNull();
      expect(() => settleBattle(state, save)).toThrow('Battle is not complete');
      for (let tick = 0; tick < 1201 && state.duel?.winner === null; tick++) {
        const d = state.duel!;
        if (d.windup > 0 && d.windup <= 0.35 && d.cooldown === 0)
          state = controlArena(state, 'dodge');
        else if (!d.windup && d.cycle > 1 && !d.holding && d.cooldown === 0 && d.stamina > 45)
          state = controlArena(state, 'tease');
        else if (d.holding && d.charge >= 0.65) state = controlArena(state, 'release');
        else if (!d.holding && d.cooldown === 0 && !d.windup && d.stamina < 65)
          state = controlArena(state, 'rest');
        state = tickArena(state);
      }
      expect(state.duel?.winner, `tier ${tier}: ${JSON.stringify(state.duel)}`).toBe(true);
      const settled = settleBattle(state, save);
      save = settled.save;
      expect(() => settleBattle(settled.state, save)).toThrow();
      state = advanceLeague(settled.state);
    }
    expect(save).toMatchObject({ coins: 200, arenaWins: 5, arenaLeague: 5, officeDay: 4 });
    expect(save.collection).toHaveLength(1);
    expect(state).toEqual(createArenaState());
  });
});
