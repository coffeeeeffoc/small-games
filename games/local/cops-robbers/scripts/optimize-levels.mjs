import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { levels } from '../src/levels.js';
import { initialState, searchSolution, step } from '../src/engine.js';
import { relayLevelIds, relayLevels, movedOfficer, relayError } from '../src/relay.js';

assert.equal(levels.length,120,'finish generating the complete catalog before certifying hints');
const optimalSolutions = {}, optimalRelaySolutions = {};
for (const [catalog, relay] of [[levels,false],[relayLevels,true]]) for (const level of catalog) {
  const answer = searchSolution(level, initialState(level), { maxStates: Infinity, relayLast: relay ? -1 : null });
  assert.equal(answer.status, 'solved', `level ${level.id}, relay=${relay}`);
  let state = initialState(level), last = -1;
  for (const plan of answer.plans) {
    if (relay) assert.equal(relayError(state, plan, last), null);
    const actor = movedOfficer(state, plan); if (actor >= 0) last = actor;
    state = step(level,state,plan).state;
  }
  assert.ok(state.robbers.every(node=>node===-1));
  (relay ? optimalRelaySolutions : optimalSolutions)[level.id] = answer.plans;
  console.log(`${relay?'Relay':'Standard'} ${level.id}: shortest ${answer.plans.length}, examined ${answer.examined}`);
}
// Publish only after every map has an exact shortest route and a legal replay.
const format = routes => `{\n${Object.entries(routes).map(([id, plans]) => `  "${id}": ${JSON.stringify(plans)}`).join(',\n')}\n}`;
const routesSource = `// Certified by exhaustive breadth-first search; regenerate with scripts/optimize-levels.mjs.\nexport const optimalSolutions = ${format(optimalSolutions)};\nexport const optimalRelaySolutions = ${format(optimalRelaySolutions)};\n`;
let index = 0;
const mapsUrl = new URL('../src/levels.js', import.meta.url);
const source = readFileSync(mapsUrl, 'utf8').replace(/"par": \d+/g, () => `"par": ${optimalSolutions[levels[index++].id].length}`);
assert.equal(index, 100, "legacy inline maps only; extension owns its certified par");
writeFileSync(new URL('../src/optimal-solutions.js', import.meta.url), routesSource);
writeFileSync(mapsUrl, source);
