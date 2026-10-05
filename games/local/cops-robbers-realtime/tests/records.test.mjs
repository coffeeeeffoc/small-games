import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyStreetRun,
  streetRunBoard,
} from '../../../../services/runtime-api/rules/street-runs.mjs';
import { getLevels } from '../src/levels.js';
import { createGame, startGame, stepGame, commandCop } from '../src/engine.js';
import { formatRecord } from '../src/records.js';

const config = {
  version: 'street-solo-v2',
  mode: 'quick',
  role: 'cop',
  level: 1,
  rule: 'standard',
  first: 'simultaneous',
};
export function winningTrace() {
  const game = createGame(getLevels('quick')[0]);
  startGame(game);
  const orders = [];
  let ticks = 0;
  while (game.phase === 'playing' && ticks < 1200) {
    for (const actor of [0, 1])
      if (ticks === 60 + actor * 30) {
        const order = { tick: ticks, type: 'move', actor, x: 500, y: 300 };
        assert.ok(commandCop(game, actor, order));
        orders.push(order);
      }
    stepGame(game, 1 / 60);
    ticks++;
  }
  assert.equal(game.phase, 'won');
  return { ticks, orders };
}
test('server replays actual winning orders and derives time, with isolated configurations', () => {
  const trace = winningTrace(),
    result = verifyStreetRun(config, trace);
  assert.equal(result.elapsedMs, Math.round((trace.ticks * 1000) / 60));
  assert.equal(result.board, streetRunBoard(config));
  assert.notEqual(streetRunBoard({ ...config, level: 2 }), result.board);
  assert.notEqual(streetRunBoard({ ...config, mode: 'challenge', rule: 'relay' }), result.board);
  assert.notEqual(
    streetRunBoard({ ...config, mode: 'escape', first: 'cop' }),
    streetRunBoard({ ...config, mode: 'escape', first: 'robber' }),
  );
});
test('fabricated time, wrong result, illegal actor, unsorted ticks, rules and extra score rejected', () => {
  const trace = winningTrace();
  for (const input of [
    { ...trace, ticks: 1 },
    { ...trace, ticks: trace.ticks + 1 },
    { ...trace, score: 1 },
    { ...trace, orders: [] },
    { ...trace, orders: [{ ...trace.orders[0], actor: 7 }] },
    { ...trace, orders: trace.orders.toReversed() },
    { ...trace, orders: [{ ...trace.orders[0], x: NaN }] },
    { ...trace, orders: [{ ...trace.orders[0], elapsedMs: 1 }] },
  ])
    assert.throws(() => verifyStreetRun(config, input), /INVALID_RUN/);
  for (const update of [
    { version: 'old' },
    { version: 'street-solo-v1' },
    { level: 4 },
    { role: 'robber' },
    { first: 'cop' },
    { rule: 'relay' },
  ])
    assert.throws(() => verifyStreetRun({ ...config, ...update }, trace), /INVALID_RUN/);
});
test('display retains hundredths and distinguishes unavailable records', () => {
  assert.equal(formatRecord(4.25), '00:04.25');
  assert.equal(formatRecord(64.25), '01:04.25');
  assert.equal(formatRecord(59.999), '01:00.00');
  assert.equal(formatRecord(null), '暂无');
});
