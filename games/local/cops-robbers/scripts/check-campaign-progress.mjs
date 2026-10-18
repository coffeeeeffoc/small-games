import assert from 'node:assert/strict';
import { levels } from '../src/levels.js';
import { relayLevels, legacyRelayLevelIds } from '../src/relay.js';
import { quickTrials, quickSolutions } from '../src/quick-trials.js';
import { optimalRelaySolutions } from '../src/optimal-solutions.js';
import { initialState, step, validatePlan } from '../src/engine.js';
import { levelUnlocked, nextPlayable, campaignRecord, campaignPar } from '../src/progress.js';

for (const [mode, catalog] of [['standard', levels], ['relay', relayLevels], ['quick', quickTrials]]) {
  const map = catalog[0], par = campaignPar(map, mode);
  assert.equal(campaignRecord(map, { turns: par, stars: 1 }, par, mode).stars, 3, 'same score repairs legacy stars');
  assert.equal(campaignRecord(map, { turns: par, stars: 1 }, par + 1, mode).turns, par, 'slower replay cannot replace a best');
  assert.equal(campaignRecord(map, { turns: par }, undefined, mode).stars, 3, 'valid turns restore a missing star field');
  assert.equal(campaignRecord(map, { turns: -1 }, undefined, mode), null);
}
assert.equal(campaignRecord(quickTrials[0], { turns: quickTrials[0].turnLimit + 1 }, undefined, 'quick'), null);
assert.throws(() => campaignPar({ id: 99999, par: 4 }, 'relay'), /Missing relay/);

for (const catalog of [levels,relayLevels,quickTrials]) {
  assert.equal(catalog.length,120);
  assert.equal(new Set(catalog.map(level=>level.id)).size,120);
  const records={};
  assert.ok(levelUnlocked(catalog,records,catalog[0].id));
  for(const level of catalog.slice(1)) assert.equal(levelUnlocked(catalog,records,level.id),false,'normal users cannot skip progress');
  for(const level of catalog) {
    assert.equal(nextPlayable(catalog,records).id,level.id);
    assert.ok(levelUnlocked(catalog,records,level.id));
    records[level.id]={stars:3,turns:level.par};
  }
  for(const level of catalog)assert.ok(levelUnlocked(catalog,records,level.id));
  assert.ok(levelUnlocked(catalog,{},catalog.at(-1).id,true),'developer selection is explicit');
  assert.equal(levelUnlocked(catalog,{},999,true),false,'developer mode cannot invent a map');
  assert.ok(levelUnlocked(catalog,{[catalog.at(-1).id]:{stars:2,turns:19}},catalog.at(-1).id),'legacy completed records remain replayable');
}
assert.deepEqual(relayLevels.slice(0,6).map(map=>map.id),legacyRelayLevelIds,'old relay progression order is retained');
for(const [catalog, routes, relay] of [[relayLevels,optimalRelaySolutions,true],[quickTrials,quickSolutions,false]]) {
  const signatures=new Set();
  for(const map of catalog) {
    signatures.add(JSON.stringify({nodes:map.nodes,edges:map.edges,cops:[...map.cops].sort(),robbers:[...map.robbers].sort(),exits:[...map.exits].sort()}));
    let state=initialState(map),last=-1;
    for(const plan of routes[map.id]) {
      assert.equal(validatePlan(map,state,plan),null);
      const actor=plan.findIndex((node,i)=>node!==state.cops[i]);
      if(relay&&actor>=0){assert.notEqual(actor,last);last=actor;}
      state=step(map,state,plan).state;
      assert.ok(!state.robbers.includes(-2));
    }
    assert.ok(state.robbers.every(node=>node===-1));
    if(!relay)assert.ok(state.turn<=map.turnLimit);
  }
  assert.equal(signatures.size,120,'all puzzles differ in roads, actors or objectives');
}
console.log('PASS 3 × 120 ordered campaigns, 120 distinct relay/quick configurations, legal full witnesses, legacy replay and developer isolation gates');
