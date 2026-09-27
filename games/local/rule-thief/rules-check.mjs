import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { LEVELS, RULES, initial, clone, step, actor, solve, stateKey, actions } from './rules.js';
const solutions = JSON.parse(readFileSync(new URL('./docs/solutions.json', import.meta.url), 'utf8'));
const invariant = state => {
  assert.equal(Object.keys(state.owners).length, 3);
  assert.deepEqual(Object.keys(state.owners).sort(), Object.keys(RULES).sort());
  assert.equal(new Set(state.entities.map(e => `${e.x},${e.y}`)).size, state.entities.length);
  assert(state.entities.length <= 4);
  for (const id of Object.values(state.owners)) assert(actor(state, id));
  for (const e of state.entities) {
    assert(e.x > 0 && e.x < 5 && e.y > 0 && e.y < 5);
    if (LEVELS[state.level].map[e.y][e.x] === '#') assert.equal(state.owners.phase, e.id);
  }
};
const replay = solutions.map((path, level) => {
  let state = initial(level), snapshots = [], hadStack = false, reclaimed = false;
  const start = clone(state);
  for (const action of path) {
    const before = clone(state), preview = step(state, action, true), actual = step(state, action);
    assert(preview.ok, preview.reason); assert.deepEqual(actual.state, preview.state); assert.deepEqual(state, before);
    snapshots.push(before); state = actual.state; invariant(state);
    hadStack ||= new Set(Object.values(state.owners)).size < 3;
    reclaimed ||= hadStack && state.owners.phase === 'p';
    assert.deepEqual(clone(snapshots.at(-1)), before);
  }
  assert.equal(state.status, 'won', `level ${level + 1} must win`);
  const won = clone(state);
  while (snapshots.length) state = snapshots.pop();
  assert.deepEqual(state, start);
  return { level: level + 1, moves: path.length, hadStack, reclaimed, final: won };
});
assert(replay[1].hadStack && replay[1].reclaimed);
const noStack = solve(initial(1), { allow: next => new Set(Object.values(next.owners)).size === 3 });
const noReclaim = solve(initial(1), { allow: (_, a, previous) => !(a.type === 'transfer' && a.rule === 'phase' && previous.owners.phase === 'a') });
const noSteal = solve(initial(0), { allow: (_, a, previous) => !(a.type === 'transfer' && a.rule === 'stride' && previous.owners.stride === 's') });
for (const proof of [noStack, noReclaim, noSteal]) assert.equal(proof.status, 'unsolvable', JSON.stringify(proof));
const lost = step(initial(0), { type: 'wait' }); assert.equal(lost.state.status, 'lost');
const stolen = step(initial(0), { type: 'transfer', rule: 'stride', target: 'b' });
assert.equal(stolen.state.status, 'playing'); assert.deepEqual(actor(stolen.state, 's'), actor(initial(0), 's'));
assert.notDeepEqual(actor(stolen.state, 'b'), actor(initial(0), 'b')); // new host moves in the same beat
assert.equal(step(initial(1), { type: 'transfer', rule: 'phase', target: 'p' }).ok, false); // inside wall
assert.equal(step(initial(1), { type: 'transfer', rule: 'stride', target: 'p' }).ok, false); // out of reach
assert.equal(step(initial(0), { type: 'move', dir: 99 }).ok, false);
assert.equal(step(initial(0), { type: 'transfer', rule: 'fake', target: 'p' }).ok, false);
const tinyLimit = solve(initial(1), { maxStates: 1 }); assert.equal(tinyLimit.status, 'unknown'); assert.equal(tinyLimit.visited, 1);
const facing = initial(1); actor(facing, 'c').x = 4; actor(facing, 'c').y = 1;
assert.equal(actor(step(facing, { type: 'wait' }).state, 'c').dir, 1);
const blockedDrift = initial(1); actor(blockedDrift, 'b').y = 1;
assert.equal(actor(step(blockedDrift, { type: 'wait' }).state, 'b').y, 1);
// Legal equivalent solutions win by location alone, never by matching a script.
const alternative = [...solutions[1].slice(0, -1), { type: 'wait' }, ...solutions[1].slice(-1)];
let alt = initial(1);
for (const a of alternative) alt = step(alt, a).state;
assert.equal(alt.status, 'won');
// Exhaustively visit a bounded sample of actual transitions, including losing branches.
let frontier = [initial(0)], seen = new Set();
for (let i = 0; i < frontier.length && seen.size < 500; i++) {
  const s = frontier[i]; if (seen.has(stateKey(s)) || s.status !== 'playing') continue;
  seen.add(stateKey(s));
  for (const a of actions(s)) { const r = step(s, a, true); invariant(r.state); assert.deepEqual(r.state, step(s, a).state); frontier.push(r.state); }
}
const report = { checkedAt: new Date().toISOString(), maps: LEVELS.map(l => l.map), replay, proofs: { noStack, noReclaim, noSteal }, capacity: tinyLimit, transitionStatesChecked: seen.size, alternativeSolution: 'won', limits: '30,000 states / 5 seconds; capped search returns unknown' };
writeFileSync(new URL('./docs/rules-check.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ replay: replay.map(({level,moves}) => ({level,moves})), proofs: report.proofs, transitionStatesChecked: seen.size, alternativeSolution: report.alternativeSolution }, null, 2));
