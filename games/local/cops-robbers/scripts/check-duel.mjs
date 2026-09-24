import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { prepareLevel } from '../src/engine.js';
import { duelLevels } from '../src/duel-levels.js';
import { initialDuel, legalDuelTargets, duelActions, stepDuel, chooseDuelAction } from '../src/duel.js';

const fixture = prepareLevel({ nodes: [{}, {}, {}, {}], edges: [[0,1],[1,2],[2,3]], cops: [0], robbers: [2], exits: [3], roundLimit: 3, difficulty: 1 });
let state = initialDuel(fixture, 'runner');
assert.equal(state.side, 'runner');
assert.equal(stepDuel(fixture, state, {type:'move',side:'runner',actor:0,target:3}).winner, 'runner');
assert.throws(() => stepDuel(fixture, state, {type:'move',side:'pursuer',actor:0,target:1}));
assert.throws(() => stepDuel(fixture, state, {type:'move',side:'runner',actor:0,target:0}));
assert.throws(() => stepDuel(fixture, state, {type:'move',side:'runner',actor:9,target:1}));
assert.throws(() => stepDuel(fixture, state, {type:'move',side:'runner',actor:0,target:NaN}));
state = {...initialDuel(fixture), cops:[1]};
assert.equal(stepDuel(fixture, state, {type:'move',side:'pursuer',actor:0,target:2}).winner,'pursuer');
assert.equal(state.robbers[0], 2, 'source state stays immutable');
const timed = {...initialDuel(fixture), turn:5};
assert.equal(stepDuel(fixture,timed,{type:'move',side:'pursuer',actor:0,target:0}).winner,'runner');
assert.deepEqual(legalDuelTargets(fixture,{...state,winner:'runner'},0),[]);

// Reject an escape route that stays outside every pursuer's possible reach,
// even allowing every pursuer to move each round. Such maps are provably free wins.
export function hasUncontestedEscape(level, firstSide) {
  const pending = level.robbers.map(node => [node, 0]), seen = new Set();
  while (pending.length) {
    const [node, time] = pending.shift(), key = `${node}:${time}`;
    if (seen.has(key) || time > level.nodes.length) continue;
    seen.add(key);
    if (level.exits.includes(node)) return true;
    const nextTime = time + 1, copSteps = firstSide === 'runner' ? time : nextTime;
    for (const next of level.adj[node]) if (level.cops.every(cop => level.dist[cop][next] > copSteps)) pending.push([next, nextTime]);
  }
  return false;
}
// A bounded minimax proof rejects trivial forced openings; unknown is not a fairness proof.
function openingWinner(level, state, depth = 6, memo = new Map()) {
 if (state.winner) return state.winner;
 if (!depth) return null;
 const key = `${state.cops}|${state.robbers}|${state.side}|${depth}`;
 if (memo.has(key)) return memo.get(key);
 let allLose = true;
 for (const action of duelActions(level, state)) {
  const winner = openingWinner(level, stepDuel(level, state, action), depth - 1, memo);
  if (winner === state.side) { memo.set(key, winner); return winner; }
  if (!winner) allLose = false;
 }
 const result = allLose ? state.side === 'runner' ? 'pursuer' : 'runner' : null;
 memo.set(key, result); return result;
}
let seed=629251;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const report={modes:{}, ai:[], checks:['both roles and initiatives','forged/invalid actions rejected','immutable step','capture and escape outcomes','survival deadline','no uncontested escape witness','no forced opening win within six plies for either initiative','connected unique graphs','difficulty topology progression']};
for(const mode of ['escape','survival']){
 const maps=duelLevels.filter(level=>level.mode===mode), graphs=new Set();
 assert.equal(maps.length,100);
 const outcomes={pursuer:0,runner:0};
 for(const [index,level] of maps.entries()){
  assert.equal(level.id,index+1);assert.ok(level.dist[0].every(Number.isFinite));
  graphs.add(JSON.stringify(level.edges));
  assert.ok(level.cops.every(cop=>level.robbers.every(runner=>level.dist[cop][runner]>=2)),'no opening adjacent capture');
  assert.equal(new Set([...level.cops,...level.robbers,...level.exits]).size,level.cops.length+level.robbers.length+level.exits.length);
  if(mode==='escape')for(const firstSide of ['pursuer','runner'])assert.equal(hasUncontestedEscape(level,firstSide),false,`${mode}/${level.id}: no free runner route with ${firstSide} first`);
  for(const firstSide of ['pursuer','runner'])assert.equal(openingWinner(level,initialDuel(level,firstSide)),null,`${mode}/${level.id}: no proven six-ply opening win with ${firstSide} first`);
  for(const firstSide of ['pursuer','runner'])for(let trial=0;trial<20;trial++){
   let cursor=initialDuel(level,firstSide);
   while(!cursor.winner){const actions=duelActions(level,cursor);assert.ok(actions.length);const action=actions[Math.floor(random()*actions.length)];cursor=stepDuel(level,cursor,action);assert.ok(cursor.turn<=level.roundLimit*2);}
   outcomes[cursor.winner]++;
  }
 }
 assert.equal(graphs.size,100,'each map has a distinct road graph, not a recolor');
 const metrics=list=>({nodes:list.reduce((n,l)=>n+l.nodes.length,0)/list.length,roads:list.reduce((n,l)=>n+l.edges.length,0)/list.length,loops:list.reduce((n,l)=>n+l.edges.length-l.nodes.length+1,0)/list.length,branches:list.reduce((n,l)=>n+l.adj.filter(v=>v.length>=3).length,0)/list.length,rounds:list.reduce((n,l)=>n+l.roundLimit,0)/list.length});
 const early=metrics(maps.slice(0,20)),late=metrics(maps.slice(-20));
 assert.ok(late.nodes>=early.nodes*2);assert.ok(late.loops>=early.loops*2);assert.ok(late.branches>=early.branches*2);
 assert.ok(outcomes.pursuer>0&&outcomes.runner>0);
 report.modes[mode]={count:maps.length,uniqueRoadGraphs:graphs.size,early,late,randomOutcomes:outcomes};
 for(const id of [1,20,50,80,100])for(const firstSide of ['pursuer','runner']){
  const level=maps[id-1];let cursor=initialDuel(level,firstSide),maxMs=0;
  while(!cursor.winner){const before=performance.now(),action=chooseDuelAction(level,cursor);maxMs=Math.max(maxMs,performance.now()-before);assert.ok(action);cursor=stepDuel(level,cursor,action);}
  report.ai.push({mode,id,firstSide,winner:cursor.winner,turns:cursor.turn,maxThinkMs:Math.round(maxMs)});
 }
}
mkdirSync(new URL('../outputs',import.meta.url),{recursive:true});
writeFileSync(new URL('../outputs/duel-audit.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
