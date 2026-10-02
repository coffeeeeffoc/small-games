import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { levels } from '../src/levels.js';
import { solutions } from '../src/solutions.js';
import { optimalSolutions, optimalRelaySolutions } from '../src/optimal-solutions.js';
import { prepareLevel, initialState, legalPlans, searchSolution, step } from '../src/engine.js';
import { relayLevelIds, movedOfficer, relayError } from '../src/relay.js';
import { quickTrials, searchQuick } from '../src/quick-trials.js';

// Independent layer reachability audit: bit masks merge interchangeable actors;
// relay officers retain their ordered positions and baton. No route cache,
// heuristic, predecessor reconstruction, or search cutoff is used by this oracle.
function minimumTurns(level, start, relayLast = null) {
  const key = (state, last) => {
    const mask = nodes => nodes.reduce((bits, node) => node < 0 ? bits : bits | (1 << node), 0);
    return `${last === null ? mask(state.cops) : state.cops.join(',')}:${mask(state.robbers)}:${last}`;
  };
  let frontier = [{ state:start, last:relayLast }], turns = 0;
  const seen = new Set([key(start,relayLast)]);
  while (frontier.length) {
    const next = [];
    for (const {state,last} of frontier) {
      if (state.robbers.includes(-2)) continue;
      if (state.robbers.every(node => node === -1)) return turns;
      for (const plan of legalPlans(level,state)) {
        const actor = movedOfficer(state,plan);
        if (last !== null && relayError(state,plan,last)) continue;
        const after = step(level,state,plan).state;
        if (after.robbers.includes(-2)) continue;
        const baton = last === null || actor < 0 ? last : actor, id = key(after,baton);
        if (seen.has(id)) continue;
        seen.add(id); next.push({state:after,last:baton});
      }
    }
    frontier = next; turns++;
  }
  return null;
}

globalThis.self = { postMessage(answer) { this.answer = answer; } };
await import('../src/hint-worker.js');
const hint = (levelId,state,rule='standard',last=-1,mode='challenge') => {
  self.onmessage({data:{id:'audit',levelId,state,rule,last,mode}});
  assert.equal(self.answer.id,'audit'); return self.answer;
};
const audit = [], relayAudit = [];
let hints = 0;
for (const level of levels) {
  const plans = optimalSolutions[level.id], start = initialState(level);
  assert.equal(plans.length,minimumTurns(level,start),`independent shortest proof ${level.id}`);
  assert.equal(level.par,plans.length,`three stars are attainable at the shortest length ${level.id}`);
  let state = start;
  for (const [index,plan] of plans.entries()) {
    const answer = hint(level.id,state);
    assert.equal(answer.status,'solved'); assert.equal(answer.remaining,plans.length-index);
    assert.deepEqual(answer.plan,plan,`certified optimal hint ${level.id}/${index}`);
    state = step(level,state,answer.plan).state; hints++;
  }
  assert.ok(state.robbers.every(node => node === -1));
  assert.deepEqual(hint(level.id,state).plan,null);
  audit.push({id:level.id,referenceTurns:solutions[level.id].length,shortestTurns:plans.length,hints:plans.length});
  console.log(`Optimal ${level.id}/100: ${plans.length} turns`);
}
assert.equal(optimalSolutions[100].length,17,'level 100 regresses from the old 28-turn hint');
for (const id of relayLevelIds) {
  const level = levels[id-1], plans = optimalRelaySolutions[id];
  assert.equal(plans.length,minimumTurns(level,initialState(level),-1),`relay shortest proof ${id}`);
  let state = initialState(level), last = -1;
  for (const [index,plan] of plans.entries()) {
    const answer = hint(id,state,'relay',last);
    assert.equal(answer.status,'solved'); assert.equal(answer.remaining,plans.length-index);
    assert.equal(relayError(state,answer.plan,last),null);
    assert.deepEqual(answer.plan,plan);
    const actor = movedOfficer(state,plan); if (actor >= 0) last = actor;
    state = step(level,state,plan).state;
  }
  relayAudit.push({id,shortestTurns:plans.length});
}

const line = prepareLevel({nodes:[{},{},{},{},{}],edges:[[0,1],[1,2],[2,3],[3,4]],cops:[0],robbers:[2]});
const lineStart = initialState(line);
assert.equal(searchSolution(line,lineStart,{maxStates:0}).status,'incomplete','budget exhaustion is never evidence of no solution');
assert.equal(searchSolution(line,lineStart,{maxDepth:0}).reason,'max-depth');
assert.equal(searchSolution(line,lineStart).plans.length,3,'waiting and every movement cost a turn');
const ring = prepareLevel({nodes:[{},{},{},{}],edges:[[0,1],[1,2],[2,3],[3,0]],cops:[0],robbers:[2]});
assert.equal(searchSolution(ring,initialState(ring)).status,'unsolvable','exhausting a one-officer ring proves no win');
const duplicated = {...lineStart,robbers:[2,2,-1]};
assert.equal(searchSolution(line,duplicated).plans.length,3,'co-located and captured identities do not affect the shortest length');
const level = levels[29], reordered = {...initialState(level),cops:[...level.cops].reverse()};
const reorderedAnswer = searchSolution(level,reordered);
assert.equal(reorderedAnswer.plans.length,optimalSolutions[level.id].length);
let reorderedState = reordered;
for (const plan of reorderedAnswer.plans) reorderedState = step(level,reorderedState,plan).state;
assert.ok(reorderedState.robbers.every(node => node === -1),'canonical search retains executable officer identities');
// This state is off the certified route, and previously reused a 28-step witness.
const offRoute = step(levels[99],initialState(levels[99]),solutions[100][0]).state;
const recovered = hint(100,offRoute);
assert.equal(recovered.status,'solved');
assert.equal(recovered.remaining,minimumTurns(levels[99],offRoute),'off-route hints are also shortest');
assert.ok(recovered.remaining < solutions[100].length-1);
const afterWait = step(levels[99],initialState(levels[99]),levels[99].cops).state;
assert.deepEqual(afterWait,{cops:[16,10,3],robbers:[7,22,19],turn:1});
const waitRecovery = hint(100,afterWait);
assert.equal(waitRecovery.status,'solved');
assert.equal(waitRecovery.remaining,18,'a recoverable first wait must not be treated as unsolvable');
const trapped = {cops:[16,11,14],robbers:[2,0,3],turn:4};
assert.equal(hint(100,trapped).status,'unsolvable','a genuinely unwinnable live position is reported distinctly');
assert.equal(searchSolution(levels[99],initialState(levels[99]),{maxDepth:16}).reason,'max-depth','depth 16 cannot certify a solution or global impossibility');
assert.equal(hint(100,{...offRoute,robbers:[-2,-1,-1]}).status,'unsolvable');
assert.equal(hint(999,offRoute).status,'error','worker errors are distinct from no solution');
const quick = quickTrials[0];
assert.equal(searchQuick(quick,{...initialState(quick),turn:quick.turnLimit}).status,'unsolvable');
assert.equal(searchQuick(quick,{...initialState(quick),robbers:[-1],turn:quick.turnLimit+1}).status,'unsolvable','late capture cannot become a solved quick hint');
assert.equal(hint(1,{...initialState(quick),turn:quick.turnLimit},'standard',-1,'quick').status,'unsolvable','reference cache respects the remaining budget');

mkdirSync(new URL('../outputs/',import.meta.url),{recursive:true});
writeFileSync(new URL('../outputs/optimal-audit.json',import.meta.url),JSON.stringify({levels:audit,relay:relayAudit,verifiedHints:hints,nonOptimalReferences:audit.filter(row=>row.referenceTurns>row.shortestTurns).length},null,2));
console.log(`PASS 100 independent shortest proofs, ${hints} certified hints, 6 optimal relay routes, off-route recovery, identity symmetry, quick limits and honest search statuses`);
