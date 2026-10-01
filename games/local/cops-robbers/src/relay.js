import { legalTargets, legalPlans, stateKey, step } from './engine.js';

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
export function solveRelay(level, state, last = -1, { maxStates = 24000, maxDepth = 40 } = {}) {
  if (state.robbers.includes(-2)) return null;
  if (state.robbers.every(node => node === -1)) return [];
  const queue = [{ state, last, parent: null, plan: null, depth: 0 }];
  const visited = new Set([`${stateKey(state)}:${last}`]);
  for (let index = 0; index < queue.length && index < maxStates; index++) {
    const current = queue[index];
    if (current.depth >= maxDepth) continue;
    for (const plan of legalPlans(level, current.state)) {
      if (relayError(current.state, plan, current.last)) continue;
      const nextState = step(level, current.state, plan).state;
      if (nextState.robbers.includes(-2)) continue;
      const moved = movedOfficer(current.state, plan), nextLast = moved < 0 ? current.last : moved;
      const key = `${stateKey(nextState)}:${nextLast}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const next = { state: nextState, last: nextLast, parent: current, plan, depth: current.depth + 1 };
      if (nextState.robbers.every(node => node === -1)) {
        const answer = [];
        for (let cursor = next; cursor.parent; cursor = cursor.parent) answer.push(cursor.plan);
        return answer.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}
