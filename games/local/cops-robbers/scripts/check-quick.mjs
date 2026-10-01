import assert from 'node:assert/strict';
import { levels } from '../src/levels.js';
import { initialState, step, validatePlan } from '../src/engine.js';
import { quickTrials, quickSolutions, quickOutcome, solveQuick } from '../src/quick-trials.js';
import { readPuzzleLink, puzzleUrl } from '../src/share.js';
globalThis.self = {postMessage(value){this.answer=value;}};
await import('../src/hint-worker.js');
for (const trial of quickTrials) {
  assert.ok(!levels.some(level=>JSON.stringify({nodes:level.nodes,edges:level.edges})===JSON.stringify({nodes:trial.nodes,edges:trial.edges})), 'quick arena is separately authored');
  assert.equal(solveQuick(trial,{...initialState(trial),turn:trial.turnLimit}),null,'no hint can spend turns beyond the objective');
  let state = initialState(trial);
  for (const plan of quickSolutions[trial.id]) {
    self.onmessage({data:{id:'hint',levelId:trial.id,mode:'quick',rule:'standard',state}});
    assert.ok(self.answer.plan);assert.equal(validatePlan(trial,state,self.answer.plan),null);
    assert.equal(validatePlan(trial,state,plan),null);state=step(trial,state,plan).state;
  }
  assert.equal(quickOutcome(trial,state),'won');assert.equal(state.turn,trial.par);
  assert.equal(quickOutcome(trial,{...state,turn:trial.turnLimit+1}),'lost','late capture never awards quick win');
  const url = puzzleUrl('https://u:secret@example.test/game?token=secret',{mode:'quick',level:trial.id,rule:'standard'});
  assert.deepEqual(readPuzzleLink(url),{mode:'quick',level:trial.id,rule:'standard',role:'pursuer',first:'pursuer'});
}
const first=quickTrials[0];let idle=initialState(first);
for(let i=0;i<first.turnLimit;i++)idle=step(first,idle,idle.cops).state;
assert.equal(quickOutcome(first,idle),'lost');assert.ok(idle.robbers.some(node=>node>=0),'turn limit is a real failure even without escape');
assert.equal(readPuzzleLink('https://example.test/game?mode=quick&level=4'),null);
assert.equal(readPuzzleLink('https://example.test/game?mode=quick&level=3&rule=relay&role=runner').rule,'standard');
console.log('PASS 3 distinct quick win witnesses (2/2/4 steps), hard turn limit, remaining-budget hints and exact quick links');
