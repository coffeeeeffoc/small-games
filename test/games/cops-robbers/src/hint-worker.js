import { levels } from './levels.js';
import { optimalSolutions, optimalRelaySolutions } from './optimal-solutions.js';
import { initialState, stateKey, step, searchSolution } from './engine.js';
import { movedOfficer } from './relay.js';
import { quickTrials, quickSolutions, searchQuick } from './quick-trials.js';

self.onmessage = ({ data }) => {
  const { id, levelId, state, rule, mode, last = -1 } = data;
  try {
    const level = (mode === 'quick' ? quickTrials : levels).find(item => item.id === levelId);
    if (!level) throw new Error('Unknown level');
    const reference = (mode === 'quick' ? quickSolutions : rule === 'relay' ? optimalRelaySolutions : optimalSolutions)[levelId];
    let answer = null;
    if (reference && !state.robbers.includes(-2) && (mode !== 'quick' || state.turn <= level.turnLimit)) {
      let cursor = initialState(level), previous = -1;
      // A suffix of a certified shortest route is shortest from its own state.
      // Legacy win witnesses are intentionally never used as optimal hints.
      for (let i = 0; i <= reference.length; i++) {
        if (stateKey(cursor) === stateKey(state) && (mode !== 'quick' || reference.length-i <= level.turnLimit-state.turn) && (rule !== 'relay' || previous === last)) {
          answer = { status:'solved', plans:reference.slice(i) }; break;
        }
        if (i === reference.length) break;
        const moved = movedOfficer(cursor, reference[i]);
        if (moved >= 0) previous = moved;
        cursor = step(level, cursor, reference[i]).state;
      }
    }
    answer ??= mode === 'quick' ? searchQuick(level,state) : searchSolution(level,state,{relayLast:rule === 'relay' ? last : null});
    self.postMessage({ id, status:answer.status, reason:answer.reason || null, plan:answer.plans?.[0] || null, remaining:answer.plans?.length ?? null });
  } catch { self.postMessage({ id, status:'error', plan:null, remaining:null }); }
};
