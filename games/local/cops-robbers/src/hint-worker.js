import { levels } from './levels.js';
import { solutions } from './solutions.js';
import { initialState, stateKey, step, solve } from './engine.js';
import { movedOfficer, solveRelay } from './relay.js';
import { quickTrials, quickSolutions, solveQuick } from './quick-trials.js';

self.onmessage = ({ data }) => {
  const { id, levelId, state, rule, mode, last = -1 } = data;
  try {
    const level = (mode === 'quick' ? quickTrials : levels).find(item => item.id === levelId);
    if (!level) throw new Error('Unknown level');
    const reference = (mode === 'quick' ? quickSolutions : solutions)[levelId] || [];
    let cursor = initialState(level), previous = -1, answer = null;
    for (let i = 0; i < reference.length; i++) {
      if (stateKey(cursor) === stateKey(state) && (mode !== 'quick' || reference.length-i <= level.turnLimit-state.turn) && (rule !== 'relay' || previous === last)) { answer = reference.slice(i); break; }
      const moved = movedOfficer(cursor, reference[i]);
      if (moved >= 0) previous = moved;
      cursor = step(level, cursor, reference[i]).state;
    }
    answer ??= mode === 'quick' ? solveQuick(level,state) : rule === 'relay' ? solveRelay(level, state, last) : solve(level, state, { maxStates: 24000, maxDepth: 50 });
    self.postMessage({ id, plan: answer?.[0] || null });
  } catch { self.postMessage({ id, plan: null }); }
};
