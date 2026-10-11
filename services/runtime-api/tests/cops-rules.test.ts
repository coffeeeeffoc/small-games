import { beforeAll, describe, expect, it } from 'vitest';
import type { Rule } from '../src/competition/types.js';

type State = {
  levelId: number;
  mode: string;
  board: { turn: number; cops: number[]; robbers: number[] };
  elapsedMs: number;
};
type CopsRule = Omit<Rule, 'initial' | 'action'> & {
  initial(seed: number, mode?: string, firstRole?: string): State;
  action(state: State, input: unknown, elapsedMs: number, seat: number): State;
};
let rule: CopsRule;
beforeAll(async () => {
  const path = new URL('../rules/cops.mjs', import.meta.url).href;
  rule = ((await import(path)) as { default: CopsRule }).default;
});

describe('authoritative cops expanded map catalog', () => {
  it.each(['escape', 'survival'])('draws every %s map including the final 20', (mode) => {
    const states = Array.from({ length: 120 }, (_, seed) => rule.initial(seed, mode));
    expect(states.map((state) => state.levelId)).toEqual(
      Array.from({ length: 120 }, (_, index) => index + 1),
    );
    expect(rule.initial(120, mode).levelId).toBe(1);
    for (const state of states.slice(100)) {
      expect(rule.view(state, 0)).toMatchObject({
        kind: 'cops-duel',
        levelId: state.levelId,
        mode,
      });
      const next = rule.action(
        state,
        { type: 'move', side: 'pursuer', actor: 0, target: state.board.cops[0] },
        0,
        0,
      );
      expect(next.board.turn).toBe(1);
      expect(state.board.turn).toBe(0);
    }
    expect(rule.modes?.find((entry) => entry.id === mode)?.title).toContain('120关');
  });

  it('keeps persisted original map IDs playable and rejects unknown modes', () => {
    for (const mode of ['escape', 'survival']) {
      const state = rule.initial(99, mode, 'runner');
      expect(state.levelId).toBe(100);
      expect(rule.view(state, 1)).toMatchObject({ levelId: 100, firstRole: 'runner' });
      expect(
        rule.action(
          state,
          { type: 'move', side: 'runner', actor: 0, target: state.board.robbers[0] },
          0,
          1,
        ).board.turn,
      ).toBe(1);
    }
    for (const mode of ['missing', 'toString', '__proto__'])
      expect(() => rule.initial(1, mode)).toThrow('无效对战配置');
  });
});
