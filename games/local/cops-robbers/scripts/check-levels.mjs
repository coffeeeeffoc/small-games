import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { prepareLevel, initialState, legalTargets, legalPlans, validatePlan, step, solve, stateKey } from '../src/engine.js';
import { levels, chapters } from '../src/levels.js';
import { solutions } from '../src/solutions.js';

const exitRegression = prepareLevel({ nodes:[{},{},{},{}], edges:[[0,1],[1,2],[2,3]], cops:[0], robbers:[2], exits:[3] });
const escaped = step(exitRegression,initialState(exitRegression),[0]);
assert.deepEqual(escaped.state.robbers,[-2], 'a robber reaching an open exit escapes instead of waiting to be caught');
assert.deepEqual(escaped.escaped,[0]);
assert.deepEqual(escaped.caught,[],'escaped robbers never count as caught');
assert.deepEqual(escaped.robberMoves,[3],'escape animation retains the actual exit destination');
assert.equal(solve(exitRegression,escaped.state),null,'a failed state cannot be solved as a win');
assert.throws(()=>step(exitRegression,escaped.state,[1]),/逃脱/,'failed rounds cannot revive escaped robbers');
assert.deepEqual(legalPlans(exitRegression,escaped.state),[]);

const mixed = prepareLevel({ nodes:Array.from({length:7},()=>({})),edges:Array.from({length:6},(_,i)=>[i,i+1]),cops:[1],robbers:[0,5],exits:[6] });
const mixedResult=step(mixed,initialState(mixed),[1]);
assert.deepEqual(mixedResult.state.robbers,[-1,-2],'catching one robber does not hide another robber escaping in the same step');
assert.deepEqual(mixedResult.caught,[0]);
assert.deepEqual(mixedResult.escaped,[1]);
assert.equal(solve(mixed,mixedResult.state),null);

const atExit = prepareLevel({ nodes:[{},{}],edges:[[0,1]],cops:[0],robbers:[1],exits:[1] });
assert.deepEqual(step(atExit,initialState(atExit),[0]).escaped,[0],'an exit has a route to the outside even if its map neighbor is blocked');

const detour = prepareLevel({ nodes:[{},{},{},{},{},{},{}],edges:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[2,6]],cops:[6],robbers:[1],exits:[3] });
const rerouted = step(detour,initialState(detour),[2]);
assert.deepEqual(rerouted.state.robbers,[0],'a blocked shortest road makes the robber take the other side of a loop toward the exit');
assert.deepEqual(step(detour,rerouted.state,[2]).state.robbers,[5],'reachable exit routes advance without an extra confirmation or idle turn');

const guardExit = prepareLevel({ nodes:[{},{},{},{},{}],edges:[[0,1],[1,2],[1,3],[3,4]],cops:[2],robbers:[3],exits:[0] });
assert.deepEqual(step(guardExit,initialState(guardExit),[1]).state.robbers,[4],'blocking the escape route switches the robber to avoiding police');
assert.deepEqual(step(guardExit,{ cops:[1],robbers:[-1,4],turn:1 },[3]).state.robbers,[-1,-1],'caught identities remain caught in later captures');
assert.deepEqual(step(guardExit,{ cops:[1],robbers:[3],turn:1 },[0]).escaped,[],'police can stand directly on an exit to close it');

const line = (count, cops, robbers) => prepareLevel({ nodes: Array.from({ length: count }, (_, x) => ({ x, y: 0 })), edges: Array.from({ length: count - 1 }, (_, i) => [i,i+1]), cops, robbers });
const short = line(3,[0],[2]);
const start = initialState(short);
const capture = step(short,start,[1]);
assert.deepEqual(capture.afterPolice,[-1], 'capture occurs before the robber gets a turn');
assert.deepEqual(capture.state,{ cops:[1], robbers:[-1], turn:1 });
assert.deepEqual(capture.caught,[0]);
assert.deepEqual(start,{ cops:[0],robbers:[2],turn:0 }, 'planning and execution leave history snapshots intact');
assert.notEqual(validatePlan(short,start,[2]),null,'cannot jump or walk into a robber');
assert.notEqual(validatePlan(short,start,[]),null);
assert.notEqual(validatePlan(short,start,[NaN]),null);
assert.throws(() => step(short,start,[-1]));
assert.deepEqual(legalTargets(short,start,0),[0,1]);
assert.deepEqual(short.dist[0],[0,1,2]);
assert.deepEqual(solve(short,start),[[1]]);
assert.deepEqual(solve(short,capture.state),[]);
assert.equal(solve(short,start,{ maxStates:0 }),null);

const long = line(5,[0],[2]);
const fleeing = step(long,initialState(long),[1]);
assert.deepEqual(fleeing.afterPolice,[2]);
assert.deepEqual(fleeing.state.robbers,[3],'robber visibly moves to a safer node');
assert.deepEqual(step(long,initialState(long),[1]),fleeing,'preview and execution are deterministic');

const swapping = line(5,[0,1],[4]);
assert.notEqual(validatePlan(swapping,initialState(swapping),[1,0]),null,'two police cannot move or swap on one click');
assert.notEqual(validatePlan(swapping,initialState(swapping),[1,1]),null,'police cannot finish on the same node');
assert.deepEqual(legalTargets(swapping,initialState(swapping),0),[0],'occupied teammate positions are not destinations');
assert.deepEqual(step(swapping,initialState(swapping),[0,2]).state.cops,[0,2]);

const ring = prepareLevel({ nodes:[{},{},{},{}],edges:[[0,1],[1,2],[2,3],[3,0]],cops:[0,3],robbers:[1] });
assert.deepEqual(step(ring,initialState(ring),[0,2]).caught,[0],'both exits of a ring must be blocked');
assert.deepEqual(step(ring,initialState(ring),[0,3]).caught,[]);

const grouped = line(4,[0],[2,3]);
const together = step(grouped,initialState(grouped),[1]).state;
assert.deepEqual(together.robbers,[3,3],'robbers choose from the same snapshot and may gather');
assert.deepEqual(step(grouped,together,[2]).caught,[0,1],'all robbers on a surrounded node are caught');
assert.notEqual(validatePlan(grouped,together,[3]),null,'a crowded robber node is still blocked');

const sequential = line(5,[2],[0,4]);
let separate = step(sequential,initialState(sequential),[1]).state;
assert.deepEqual(separate.robbers,[-1,4]);
separate = step(sequential,separate,[2]).state;
assert.deepEqual(step(sequential,separate,[3]).state.robbers,[-1,-1]);

const fork = prepareLevel({ nodes:[{},{},{},{}],edges:[[0,1],[1,2],[1,3]],cops:[0],robbers:[1] });
assert.deepEqual(step(fork,initialState(fork),[0]).state.robbers,[2],'equal candidates use the lower node id');
assert.equal(stateKey({ cops:[1],robbers:[2],turn:1 }),stateKey({ cops:[1],robbers:[2],turn:9 }),'repetition ignores the turn counter');

assert.equal(levels.length,60);
assert.equal(chapters.length,5);
assert.equal(Object.keys(solutions).length,60);
const roadSketches = new Set();
let moves = 0;
const audit = [];
let seed = 91842;
const random = () => ((seed = (Math.imul(seed,1664525) + 1013904223) >>> 0) / 4294967296);
for (const [index,level] of levels.entries()) {
  assert.equal(level.id,index+1);
  assert.equal(level.chapter,Math.floor(index/12));
  assert.ok(level.cops.length >= 1 && level.cops.length <= 5);
  assert.ok(level.robbers.length >= 1 && level.robbers.length <= 5);
  assert.ok(level.exits.length>=1 && level.exits.length<=3,'each level has real escape gates');
  assert.equal(new Set(level.exits).size,level.exits.length);
  for (const exit of level.exits) {
    assert.ok(Number.isInteger(exit) && level.nodes[exit],`level ${level.id} has a valid exit`);
    assert.ok(!level.cops.includes(exit) && !level.robbers.includes(exit),'every exit starts open');
    const {x,y} = level.nodes[exit];
    assert.ok(x<=100 || x>=500 || y<=100 || y>=500,'escape gates are at the edge of the map');
  }
  assert.equal(new Set([...level.cops,...level.robbers]).size,level.cops.length+level.robbers.length,'initial actors have separate positions');
  assert.ok(level.nodes.length >= 3 && level.nodes.length <= 24);
  assert.ok(level.dist[0].every(Number.isFinite),`level ${level.id} is connected`);
  assert.ok(level.adj.every(exits => exits.length > 0));
  assert.equal(new Set(level.edges.map(edge => [...edge].sort((a,b) => a-b).join(','))).size,level.edges.length);
  for (const [a,b] of level.edges) assert.ok(a !== b && level.nodes[a] && level.nodes[b]);
  for (const [i,a] of level.nodes.entries()) {
    assert.ok(a.x >= 60 && a.x <= 540 && a.y >= 70 && a.y <= 530);
    for (const b of level.nodes.slice(i+1)) assert.ok(Math.hypot(a.x-b.x,a.y-b.y) >= 85,`level ${level.id} has separated tap targets`);
  }
  assert.ok(!level.robbers.some(node => level.adj[node].every(exit => level.cops.includes(exit))),`level ${level.id} does not start captured`);
  for (const robber of level.robbers) {
    const seen = new Set([robber]), queue = [robber];
    for (let i=0;i<queue.length;i++) for (const next of level.adj[queue[i]]) if (!level.cops.includes(next) && !seen.has(next)) { seen.add(next); queue.push(next); }
    assert.ok(level.exits.some(exit=>seen.has(exit)),`level ${level.id}: every robber initially has an unblocked escape route`);
  }
  roadSketches.add(JSON.stringify({ nodes:level.nodes,edges:level.edges }));
  let state = initialState(level);
  const solution = solutions[level.id];
  let captureRounds=0;
  const movedCops=new Set();
  assert.equal(level.par,solution.length);
  for (const plan of solution) {
    assert.equal(validatePlan(level,state,plan),null,`valid plan in level ${level.id}`);
    assert.ok(plan.filter((node,i)=>node!==state.cops[i]).length<=1,'one click moves at most one officer');
    plan.forEach((node,i)=>{ if (node!==state.cops[i]) movedCops.add(i); });
    const snapshot = JSON.stringify(state), result = step(level,state,plan);
    assert.equal(JSON.stringify(state),snapshot);
    assert.deepEqual(step(level,state,plan),result);
    assert.equal(result.escaped.length,0,'the verified winning route never loses a robber');
    if (result.caught.length) captureRounds++;
    state = result.state; moves++;
  }
  assert.ok(state.robbers.every(node => node === -1),`all robbers caught in level ${level.id}`);
  if (index>=12) assert.ok(movedCops.size>=2,'later levels require moving multiple officers');

  let idle=initialState(level);
  for (let i=0;i<level.nodes.length && !idle.robbers.includes(-2);i++) idle=step(level,idle,idle.cops).state;
  assert.ok(idle.robbers.includes(-2),`level ${level.id}: ignoring the open gates actually loses`);
  assert.equal(solve(level,idle),null);

  const alternate=step(level,initialState(level),solution[0]).state;
  const recovery = solve(level,alternate,{ maxStates:24000,maxDepth:50 });
  assert.ok(recovery,`hints find the remaining capture route in level ${level.id}`);
  let recovered=alternate;
  for (const plan of recovery) recovered = step(level,recovered,plan).state;
  assert.ok(recovered.robbers.every(node => node === -1));

  let randomWins=0, randomEscapes=0;
  for (let attempt=0;attempt<40;attempt++) {
    let cursor=initialState(level);
    for (let turn=0;turn<40 && !cursor.robbers.includes(-2) && cursor.robbers.some(node=>node>=0);turn++) {
      const options=legalPlans(level,cursor).slice(1);
      cursor=step(level,cursor,options.length?options[Math.floor(random()*options.length)]:cursor.cops).state;
    }
    if (cursor.robbers.every(node=>node===-1)) randomWins++;
    if (cursor.robbers.includes(-2)) randomEscapes++;
  }
  const firstChoices=legalPlans(level,initialState(level));
  const immediateLosses=firstChoices.filter(plan=>step(level,initialState(level),plan).escaped.length>0).length;
  audit.push({id:level.id,chapter:level.chapter,par:level.par,cops:level.cops.length,robbers:level.robbers.length,exits:level.exits.length,captureRounds,movedCops:movedCops.size,idleEscapeStep:idle.turn,firstChoices:firstChoices.length,immediateLosses,randomWins,randomEscapes,trials:40});
}
assert.ok(roadSketches.size >= 55,'the catalog contains distinct actual road layouts');
assert.ok(levels.slice(24).filter(level => level.edges.length >= level.nodes.length).length >= 25,'later districts contain real cycles');
const averages = chapters.map((_, chapter) => levels.filter(level => level.chapter === chapter).reduce((sum,level) => sum+level.par,0)/12);
assert.ok(averages.every((average,index) => index === 0 || average > averages[index-1]),'average solution length increases each chapter');
const multiple=audit.filter(item=>item.robbers>1), splitCaptures=multiple.filter(item=>item.captureRounds>1);
assert.ok(splitCaptures.length/multiple.length>=0.8,'most multi-robber levels require separate capture rounds');
const randomWins=audit.reduce((sum,item)=>sum+item.randomWins,0);
assert.ok(audit.slice(12).reduce((sum,item)=>sum+item.randomWins,0)<48*40*0.25,'later levels cannot be won reliably by random movement');
mkdirSync(new URL('../outputs/',import.meta.url),{recursive:true});
writeFileSync(new URL('../outputs/level-audit.json',import.meta.url),JSON.stringify({rules:'single officer move, all robbers move, any escape loses',levels:60,verifiedMoves:moves,distinctLayouts:roadSketches.size,chapterAverages:averages,separateCaptures:`${splitCaptures.length}/${multiple.length}`,randomWins,randomTrials:2400,audit},null,2));
console.log(`Rules OK. 60/60 solutions (${moves} single-officer moves), 60/60 real escape failures, 60/60 current-position hints. ${roadSketches.size} road layouts; chapter averages ${averages.map(value=>value.toFixed(1)).join(' / ')}. Separate captures ${splitCaptures.length}/${multiple.length}; random wins ${randomWins}/2400.`);
