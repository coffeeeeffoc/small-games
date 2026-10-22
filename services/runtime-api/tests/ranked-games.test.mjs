import { describe, expect, it } from 'vitest';
import { rankedRules } from '../rules/ranked-games.mjs';

describe('real rescue and tower rule adapters', () => {
  it.each(rankedRules)(
    '$id restores a JSON checkpoint and replays identical fixed steps',
    (rule) => {
      const first = rule.create('endless', 1234);
      const second = JSON.parse(JSON.stringify(first));
      const opening =
        rule.id === 'cage-rescue'
          ? { launch: true, targetX: -200 }
          : { rotation: 0.2, brake: true };
      rule.apply(first, [{ ticks: 0, input: opening }]);
      rule.apply(second, [{ ticks: 0, input: opening }]);
      rule.apply(first, [{ ticks: 100, input: {} }]);
      for (let tick = 0; tick < 100; tick++) rule.apply(second, [{ ticks: 1, input: {} }]);
      expect(JSON.parse(JSON.stringify(first))).toEqual(JSON.parse(JSON.stringify(second)));
      expect(rule.result(first)).toEqual(rule.result(second));
      expect(() => rule.apply(first, [{ ticks: 0, input: { revive: true } }])).toThrow();
      expect(() => rule.apply(first, [{ ticks: 0, input: { score: 9999 } }])).toThrow();
      expect(() => rule.create('endless', 1, 'forged-level')).toThrow();
      expect(() => rule.create('campaign', 1, 'forged-level')).toThrow();
    },
  );
  it('validates a complete real tower run from input only; campaign cannot submit a loss as progress', () => {
    const rule = rankedRules.find((item) => item.id === 'tower-brake');
    const state = rule.create('campaign', 5, 'first-brake');
    const frames = [];
    for (let tick = 0; tick < 20000 && state.game.status === 'playing'; tick++) {
      const layer = state.game.level.layers[state.game.nextLayer];
      if (layer.gap) {
        const tau = Math.PI * 2;
        const norm = (angle) => ((angle % tau) + tau) % tau;
        const center = norm(layer.gap.start + norm(layer.gap.end - layer.gap.start) / 2);
        const rotation = Math.PI / 2 - center - state.game.rotation;
        frames.push({ ticks: 0, input: { rotation } });
        rule.apply(state, [frames.at(-1)]);
      }
      frames.push({ ticks: 1, input: {} });
      rule.apply(state, [frames.at(-1)]);
    }
    expect(state.game.status).toBe('won');
    const replayed = rule.create('campaign', 5, 'first-brake');
    rule.apply(replayed, frames);
    expect(rule.result(replayed)).toEqual(rule.result(state));
    expect(rule.result(replayed)).toMatchObject({ complete: true, eligible: true, score: 1 });
    expect(rule.result(replayed).secondary).toBeGreaterThan(1000);
    replayed.game.continued = true;
    expect(rule.result(replayed).eligible).toBe(false);
    replayed.game.status = 'lost';
    expect(rule.result(replayed).score).toBe(0);
  });
});

describe('advanced mechanic checkpoints', () => {
  it.each([
    ['cage-rescue', 'rescue-25'],
    ['tower-brake', 'tower-25'],
  ])('%s replays a JSON checkpoint with combined mechanics', (id, levelId) => {
    const rule = rankedRules.find((item) => item.id === id);
    const state = rule.create('campaign', 73, levelId);
    rule.apply(state, [
      { ticks: 120, input: id === 'cage-rescue' ? { launch: true, targetX: 180 } : {} },
    ]);
    const restored = JSON.parse(JSON.stringify(state));
    rule.apply(state, [{ ticks: 240, input: {} }]);
    for (let index = 0; index < 240; index++) rule.apply(restored, [{ ticks: 1, input: {} }]);
    expect(JSON.parse(JSON.stringify(restored))).toEqual(JSON.parse(JSON.stringify(state)));
    expect(rule.result(restored)).toEqual(rule.result(state));
  });
});

it('rescue replays a naturally activated splitter across a JSON checkpoint', async () => {
  const { createRoutePlayer } = await import(
    '../../../games/local/cage-rescue/tests/route-player.mjs'
  );
  const rule = rankedRules.find((item) => item.id === 'cage-rescue');
  const state = rule.create('campaign', 73, 'rescue-08');
  const play = createRoutePlayer();
  const opening = [];
  for (let tick = 0; tick < 120 * 90 && !state.game.extraBalls.length; tick++) {
    const frame = { ticks: 1, input: play(state.game) };
    opening.push(frame);
    rule.apply(state, [frame]);
  }
  expect(state.game.extraBalls).toHaveLength(2);
  const restored = JSON.parse(JSON.stringify(state));
  const fresh = rule.create('campaign', 73, 'rescue-08');
  rule.apply(fresh, opening);
  expect(fresh).toEqual(state);
  rule.apply(state, [{ ticks: 120, input: { targetX: 195 } }]);
  for (let tick = 0; tick < 120; tick++)
    rule.apply(restored, [{ ticks: 1, input: { targetX: 195 } }]);
  expect(restored).toEqual(state);
  expect(rule.result(restored)).toEqual(rule.result(state));
});
