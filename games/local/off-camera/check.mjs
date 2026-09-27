import assert from 'node:assert/strict';
import { cases, judge, simulate, solutions, matches, evidence, mismatch, permutations } from './logic.mjs';
const correct = [['move', 'sit'], ['mask', 'cake', 'unmask'], ['swap', 'steal', 'cover']];
for (const [i, c] of cases.entries()) {
  const initial = JSON.stringify(c.initial);
  assert.deepEqual(solutions(c), [correct[i]], `${c.id}: evidence must resolve to one sequence`);
  assert.equal(judge(c, correct[i]).won, true);
  assert.equal(judge(c, correct[i].slice(1)).won, false);
  assert.equal(judge(c, [c.cards[0], c.cards[0]]).won, false);
  assert.ok(judge(c, ['unknown']).error);
  for (const order of permutations(c.cards)) {
    const a = judge(c, order), b = judge(c, order);
    assert.deepEqual(a, b);
    if (!a.error && !a.won) { assert.equal(matches(c, a.state), false); assert.ok(mismatch(c, a.state).box.every(Number.isFinite)); }
  }
  assert.equal(JSON.stringify(c.initial), initial, 'simulation must not mutate the footage');
  console.log(`${c.id}: ${permutations(c.cards).length} permutations checked, ${solutions(c).length} solution`);
}
assert.equal(simulate(cases[0], ['sit', 'move']).state.boss, 'carried');
assert.deepEqual(evidence('cream', judge(cases[1], correct[1]).state), ['hand', 'rim', true, false]);
assert.ok(simulate(cases[1], ['unmask']).error);
const alternate = simulate(cases[1], ['cake', 'mask', 'unmask']).state;
assert.equal(judge(cases[1], ['mask', 'unmask', 'cake'], alternate).won, true);
assert.equal(judge(cases[1], ['cake', 'mask', 'unmask'], alternate).won, true);
assert.equal(solutions(cases[1], alternate).length, 2, 'equivalent visible answers must both pass');
assert.equal(simulate(cases[2], ['steal', 'swap', 'cover']).state.eaten, 'sausage');
assert.equal(simulate(cases[2], ['cover', 'swap', 'steal']).state.cover, 'sausage');
assert.equal(simulate(cases[2], ['cover', 'steal', 'swap']).state.eaten, null);
console.log('PASS: deterministic evidence, invalid actions, nonmutation, equivalent answers and story counterexamples.');
