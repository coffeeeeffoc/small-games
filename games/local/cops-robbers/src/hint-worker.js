import { levels } from './levels.js';
import { solutions } from './solutions.js';
import { initialState, stateKey, step, solve } from './engine.js';

self.onmessage = ({ data }) => {
  const { id, levelId, state } = data;
  try {
    const level = levels.find(item => item.id === levelId);
    if (!level) throw new Error('Unknown level');
    const reference = solutions[levelId] || [];
    let cursor = initialState(level), answer = null;
    for (let i = 0; i < reference.length; i++) {
      if (stateKey(cursor) === stateKey(state)) { answer = reference.slice(i); break; }
      cursor = step(level, cursor, reference[i]).state;
    }
    answer ??= solve(level, state, { maxStates: 24000, maxDepth: 50 });
    self.postMessage({ id, plan: answer?.[0] || null });
  } catch { self.postMessage({ id, plan: null }); }
};
