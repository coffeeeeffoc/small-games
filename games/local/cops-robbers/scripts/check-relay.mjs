import assert from 'node:assert/strict';
import { levels } from '../src/levels.js';
import { solutions } from '../src/solutions.js';
import { initialState, legalTargets, validatePlan, step } from '../src/engine.js';
import { relayLevelIds, movedOfficer, lastOfficer, relayTargets, relayError, solveRelay } from '../src/relay.js';
import { readPuzzleLink, puzzleUrl } from '../src/share.js';

let moves = 0;
globalThis.self = { postMessage(value) { this.answer = value; } };
await import('../src/hint-worker.js');
for (const id of relayLevelIds) {
  const level = levels[id - 1];
  let state = initialState(level), last = -1;
  for (const plan of solutions[id]) {
    assert.equal(validatePlan(level, state, plan), null);
    assert.equal(relayError(state, plan, last), null, `relay witness ${id}/${state.turn}`);
    self.onmessage({ data: { id: 'test', levelId: id, state, rule: 'relay', last } });
    assert.ok(self.answer.plan, `hint at relay ${id}/${state.turn}`);
    assert.equal(relayError(state, self.answer.plan, last), null, 'hint can execute with the current baton owner');
    const actor = movedOfficer(state, plan);
    if (actor >= 0) last = actor;
    state = step(level, state, plan).state;
    moves++;
  }
  assert.ok(state.robbers.every(node => node === -1));
  const recovered = solveRelay(level, initialState(level));
  assert.ok(recovered, `independent relay search solves ${id}`);
  let cursor = initialState(level), previous = -1;
  for (const plan of recovered) {
    assert.equal(relayError(cursor, plan, previous), null);
    const actor = movedOfficer(cursor, plan); if (actor >= 0) previous = actor;
    cursor = step(level, cursor, plan).state;
  }
  assert.ok(cursor.robbers.every(node => node === -1));
}
const level = levels[0], start = initialState(level), first = solutions[1][0], actor = movedOfficer(start, first), after = step(level, start, first).state;
assert.equal(lastOfficer(after, [start]), actor);
assert.equal(lastOfficer(after, [start, after, after]), actor, 'waits do not transfer the baton');
assert.equal(lastOfficer({ ...after, relayLast: actor }, Array.from({ length: 100 }, () => after)), actor, 'baton survives bounded history');
assert.deepEqual(relayTargets(level, after, actor, actor), [after.cops[actor]]);
assert.ok(legalTargets(level, after, actor).length > 1, 'the variant changes an otherwise legal movement');
assert.equal(relayError(after, [...after.cops], actor), null, 'waiting remains legal');
for (const key of ['mode','level','role','first','rule']) assert.equal(readPuzzleLink(`https://example.test/game?level=1&${key}=x&${key}=y`), null);
for (const raw of ['0','101','1.1','-1','Infinity','1e1','%20']) assert.equal(readPuzzleLink(`https://example.test/game?level=${raw}`), null);
assert.equal(readPuzzleLink(`https://example.test/game?level=1&extra=${'x'.repeat(1024)}`), null);
assert.equal(readPuzzleLink('https://example.test/game?level=2&rule=relay').rule, 'standard');
const puzzle = { mode: 'challenge', level: 7, rule: 'relay' };
const url = puzzleUrl('https://player:private-token@example.test/game?token=secret&score=999#auth', puzzle);
assert.equal(url, 'https://example.test/game?mode=challenge&level=7&rule=relay');
assert.deepEqual(readPuzzleLink(url), { ...puzzle, role:'pursuer', first:'pursuer' });
const duel = { mode:'escape', level:100, rule:'standard', role:'runner', first:'pursuer' };
assert.deepEqual(readPuzzleLink(puzzleUrl('https://example.test/game?token=secret', duel)), duel);
console.log(`PASS 6 relay win witnesses (${moves} moves), independent search, executable hints, wait/history rules and validated clean same-puzzle links`);
