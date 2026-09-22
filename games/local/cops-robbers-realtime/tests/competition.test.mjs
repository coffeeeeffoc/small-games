import test from 'node:test';
import assert from 'node:assert/strict';
import rule from '../../../../services/runtime-api/rules/realtime.mjs';
import { LEVELS } from '../src/levels.js';
import { roadDistance } from '../src/engine.js';

test('ranked street reuses physical capture, rejects forged inputs and survives snapshot/reconnect timing', () => {
  const state = rule.initial(41), level = LEVELS[0], commands = [];
  assert.deepEqual(rule.initial(99), state, 'one published board has identical conditions for every attempt');
  for (const input of [{ type: 'score', score: 999 }, { type: 'move', cop: 0, x: Infinity, y: 0 },
    { type: 'move', cop: -1, x: 500, y: 300 }, { type: 'move', cop: 0, x: 0, y: 0 },
    { type: 'hold', cop: 0, elapsedMs: 120000 }]) {
    assert.throws(() => rule.action(state, input, 0));
  }
  const idle = rule.initial(41);
  rule.advance(idle, 120000);
  assert.equal(idle.game.phase, 'lost', 'disconnecting does not pause thief motion or prevent escape');
  assert.equal(rule.result(idle).eligible, false);
  assert.ok(rule.result(idle).secondary > 1000);
  let guards = 0;
  for (let elapsed = 0; elapsed <= 120000 && !rule.result(state).finished; elapsed += 50) {
    rule.advance(state, elapsed);
    const guard = level.solution[guards];
    let input;
    if (guard && elapsed >= 1200 + guards * 350) {
      const point = level.nodes[guard.node];
      input = { type: 'move', cop: guard.cop, x: point.x, y: point.y }; guards++;
    } else if (elapsed >= 3500 && (elapsed - 3500) % 1000 === 0) {
      const target = state.game.robbers.filter(r => !r.caught).sort((a, b) =>
        roadDistance(state.game, state.game.cops[level.hunter], a) - roadDistance(state.game, state.game.cops[level.hunter], b))[0];
      if (target) input = { type: 'move', cop: level.hunter, x: target.x, y: target.y };
    }
    if (input && !rule.result(state).finished) { rule.action(state, input, elapsed); commands.push({ elapsed, input }); }
  }
  const result = rule.result(state);
  assert.equal(state.game.phase, 'won');
  assert.equal(result.eligible, true);
  assert.equal(result.captured, level.robbers.length);
  assert.ok(result.secondary > 1000 && result.secondary < 120000);
  let restored = rule.initial(41);
  for (const { elapsed, input } of commands) {
    // No polling between moves, with real JSON persistence between every command.
    restored = JSON.parse(JSON.stringify(restored));
    rule.action(restored, input, elapsed);
  }
  rule.advance(restored, 120000);
  assert.deepEqual(rule.result(restored), result, 'arrival-independent 120 Hz clock preserves physical finish time');
  assert.deepEqual(restored.game.cops, state.game.cops);
  assert.throws(() => rule.advance(state, 0));
  assert.throws(() => rule.action(state, { type: 'hold', cop: 0 }, 120000));
  const publicState = rule.view(restored);
  assert.equal(publicState.game, undefined);
  assert.equal(publicState.map.solution, undefined);
  assert.equal(publicState.robbers[0].routePoints, undefined, 'future AI route is not transmitted');
});
