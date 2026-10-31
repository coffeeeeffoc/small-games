import { describe, expect, it } from 'vitest';
import rule from '../rules/tetracube-ranked.mjs';
import { LEVELS } from '../../../games/local/tetracube/assets/scripts/core/campaign.js';
import { restoreRun } from '../../../games/local/tetracube/assets/scripts/core/session.js';

describe('Tetracube server-owned ranking', () => {
  it('declares two real boards with step-count tie breaking', () => {
    expect(rule.boards.map(({ id, secondaryUnit }) => ({ id, secondaryUnit }))).toEqual([
      { id: 'campaign', secondaryUnit: 'steps' },
      { id: 'endless', secondaryUnit: 'steps' },
    ]);
  });
  it.each(LEVELS)('$id validates the complete authored puzzle across JSON checkpoints', (level) => {
    const state = rule.create('campaign', 23, level.id);
    const frames = [];
    const send = (input) => {
      const frame = { input, ticks: 0 };
      frames.push(frame);
      rule.apply(state, [frame]);
    };
    for (let n = 0; n < level.layers; n++) {
      for (const plane of level.turns) send({ action: 'rotate', plane, direction: 1 });
      for (const axis of [0, 1]) {
        const target = Math.min(...level.target.map((cell) => cell[axis]));
        let current = Math.min(
          ...restoreRun(state)
            .game.cells()
            .map((cell) => cell[axis]),
        );
        while (current !== target) {
          const direction = Math.sign(target - current);
          send({ action: 'move', axis, direction });
          current += direction;
        }
      }
      send({ action: 'drop' });
    }
    const replay = JSON.parse(JSON.stringify(rule.create('campaign', 23, level.id)));
    rule.apply(replay, frames);
    expect(replay).toEqual(state);
    expect(rule.result(replay)).toMatchObject({
      complete: true,
      eligible: true,
      score: level.index + 1,
      secondary: frames.length,
    });
    expect(rule.result(replay).secondary).toBeGreaterThan(0);
    replay.assisted = true;
    expect(rule.result(replay).eligible).toBe(false);
  });
  it('rejects invented scores, steps, assists and unknown levels without mutating a checkpoint', () => {
    const state = rule.create('endless', 10);
    const original = structuredClone(state);
    for (const input of [
      { score: 9999 },
      { steps: 0 },
      { action: 'revive' },
      { action: 'move', axis: 0, direction: 100 },
      { action: 'drop', seed: 1 },
    ]) {
      expect(() => rule.apply(state, [{ input, ticks: 0 }])).toThrow();
      expect(state).toEqual(original);
    }
    expect(() => rule.create('campaign', 1, 'unknown')).toThrow();
    expect(() => rule.create('endless', 1, LEVELS[0].id)).toThrow();
    expect(rule.result(state).eligible).toBe(false);
    rule.apply(state, [
      { input: { action: 'drop' }, ticks: 240 },
      { input: { action: 'end' }, ticks: 0 },
    ]);
    expect(rule.result(state)).toMatchObject({
      complete: true,
      eligible: true,
      secondary: 2,
      elapsedMs: 2000,
    });
    expect(rule.result(state).score).toBeGreaterThan(0);
  });
  it('server replay marks every 180-degree assist ineligible even without client invalidation', () => {
    const state = rule.create('endless', 10);
    rule.apply(state, [
      { input: { action: 'flip', turn: 'invert' }, ticks: 0 },
      { input: { action: 'end' }, ticks: 0 },
    ]);
    expect(rule.result(state)).toMatchObject({ complete: true, eligible: false, secondary: 2 });
    expect(state.assisted).toBe(true);
  });
});
