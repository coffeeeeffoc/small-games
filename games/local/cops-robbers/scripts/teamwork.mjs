import { initialState, legalPlans, step } from '../src/engine.js';

// Exhaust the finite position graph: no depth/state cutoff that could mistake
// a slow winning route for an impossible one. Officer identities do not affect play.
export function reducedSquadCanWin(level, omitted) {
  const start = initialState(level);
  start.cops.splice(omitted, 1);
  const key = state => `${[...state.cops].sort((a, b) => a - b)}|${[...new Set(state.robbers.filter(n => n >= 0))].sort((a, b) => a - b)}`;
  const pending = [start], seen = new Set([key(start)]);
  while (pending.length) {
    const state = pending.pop();
    for (const plan of legalPlans(level, state)) {
      const next = step(level, state, plan).state;
      if (next.robbers.includes(-2)) continue;
      if (next.robbers.every(node => node === -1)) return true;
      const nextKey = key(next);
      if (!seen.has(nextKey)) { seen.add(nextKey); pending.push(next); }
    }
  }
  return false;
}
