import { legalTargets, searchSolution } from './engine.js';

// These streets have a complete win witness under the additional identity constraint.
export const relayLevelIds = Object.freeze([1, 4, 7, 12, 16, 27]);
export const movedOfficer = (before, plan) => plan.findIndex((node, i) => node !== before.cops[i]);
export function lastOfficer(state, history) {
  // Keep the baton through long waits and the bounded undo history.
  if (Number.isInteger(state.relayLast) && state.relayLast >= -1 && state.relayLast < state.cops.length) return state.relayLast;
  let after = state;
  for (let i = history.length - 1; i >= 0; i--) {
    const actor = movedOfficer(history[i], after.cops);
    if (actor >= 0) return actor;
    after = history[i];
  }
  return -1;
}
export function relayTargets(level, state, actor, last) {
  return legalTargets(level, state, actor).filter(node => actor !== last || node === state.cops[actor]);
}
export function relayError(state, plan, last) {
  const actor = movedOfficer(state, plan);
  return actor >= 0 && actor === last ? `接力要换人：上次是 ${last + 1} 号移动，请先调动另一位队员。留守不会重置接力。` : null;
}
export function solveRelay(level, state, last = -1, options = {}) {
  return searchSolution(level, state, { ...options, relayLast: last }).plans;
}
