import assert from 'node:assert/strict';
import rules from '../../../../services/runtime-api/rules/cops.mjs';
import { solutions } from '../src/solutions.js';

let state = rules.initial(123);
assert.deepEqual(state, rules.initial(456), 'Main ranking always uses the same map');
assert.throws(() => rules.action(state, { type: 'score', score: 100000 }, 1));
assert.throws(() => rules.action(state, { type: 'move', cop: 0, target: 999 }, 1));
assert.throws(() => rules.action(state, { type: 'move', cop: -1, target: 1 }, 1));
const view = rules.view(state);
view.board.turn = 100;
assert.equal(state.board.turn, 0, 'Views must not mutate authoritative state');
for (const plan of solutions[state.levelId]) {
  const cop = Math.max(0, plan.findIndex((node, i) => node !== state.board.cops[i]));
  state = rules.action(state, { type: 'move', cop, target: plan[cop], score: 9999, elapsedMs: 0 }, (state.board.turn + 1) * 1000);
}
assert.deepEqual(rules.result(state), { finished: true, eligible: true, score: -13, secondary: 13000 });
assert.throws(() => rules.action(state, { type: 'move', cop: 0, target: state.board.cops[0] }, 14000));
assert.equal(rules.result({ ...state, elapsedMs: 300000 }).eligible, false, 'Timeout cannot rank');
console.log('PASS authoritative map, illegal operations, server clock, verified solution and terminal guard');
