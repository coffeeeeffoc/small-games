export function prepareLevel(raw) {
  const adj = raw.nodes.map(() => []);
  for (const [a, b] of raw.edges) { adj[a].push(b); adj[b].push(a); }
  adj.forEach(neighbors => neighbors.sort((a, b) => a - b));
  const dist = adj.map((_, start) => {
    const distances = adj.map(() => Infinity), queue = [start];
    distances[start] = 0;
    for (let i = 0; i < queue.length; i++) for (const next of adj[queue[i]]) {
      if (distances[next] !== Infinity) continue;
      distances[next] = distances[queue[i]] + 1; queue.push(next);
    }
    return distances;
  });
  return { ...raw, exits: raw.exits || [], adj, dist };
}

export const initialState = level => ({ cops: [...level.cops], robbers: [...level.robbers], turn: 0 });
export const stateKey = state => `${state.cops.join(',')}|${state.robbers.join(',')}`;

export function legalTargets(level, state, copIndex) {
  const from = state.cops[copIndex];
  if (from === undefined) return [];
  return [from, ...level.adj[from]].filter(node => !state.robbers.includes(node) && (node === from || !state.cops.includes(node)));
}

export function validatePlan(level, state, plan) {
  if (state.robbers.includes(-2)) return '突围队员已经逃脱，请撤销或重试';
  if (!Array.isArray(plan) || plan.length !== state.cops.length) return '请选择一位追逐队员移动';
  if (plan.filter((node, index) => node !== state.cops[index]).length > 1) return '每步只能移动一位追逐队员';
  for (let i = 0; i < plan.length; i++) {
    if (!Number.isInteger(plan[i]) || !legalTargets(level, state, i).includes(plan[i])) return '追逐队员只能走到相邻路口，不能走进突围队员所在位置';
  }
  if (new Set(plan).size !== plan.length) return '两位追逐队员不能停在同一路口';
  return null;
}

export function legalPlans(level, state) {
  if (state.robbers.includes(-2)) return [];
  const plans = [[...state.cops]];
  state.cops.forEach((from, index) => {
    for (const target of legalTargets(level, state, index)) if (target !== from) {
      const plan = [...state.cops]; plan[index] = target; plans.push(plan);
    }
  });
  return plans;
}

function advance(level, state, cops) {
  const occupied = new Set(cops);
  const exits = new Set(level.exits);
  const surrounded = node => !exits.has(node) && level.adj[node].every(exit => occupied.has(exit));
  const afterPolice = state.robbers.map(node => node < 0 ? node : exits.has(node) ? -2 : surrounded(node) ? -1 : node);
  // A single reverse BFS finds the nearest reachable escape route for every robber.
  const escapeDistance = level.nodes.map(() => Infinity), queue = level.exits.filter(node => !occupied.has(node));
  for (const node of queue) escapeDistance[node] = 0;
  for (let i = 0; i < queue.length; i++) for (const next of level.adj[queue[i]]) {
    if (occupied.has(next) || escapeDistance[next] !== Infinity) continue;
    escapeDistance[next] = escapeDistance[queue[i]] + 1; queue.push(next);
  }
  const robberMoves = afterPolice.map(node => {
    if (node < 0) return node;
    let best = node, bestSafe = -1, bestDistance = -1, bestExits = -1;
    for (const candidate of [node, ...level.adj[node]]) {
      if (occupied.has(candidate)) continue;
      if (Number.isFinite(escapeDistance[node]) && escapeDistance[candidate] !== escapeDistance[node] - 1) continue;
      const freeExits = level.adj[candidate].filter(exit => !occupied.has(exit)).length;
      const safe = freeExits > 0 || exits.has(candidate) ? 1 : 0;
      const distance = Math.min(...cops.map(cop => level.dist[candidate][cop]));
      if (safe > bestSafe || safe === bestSafe && (distance > bestDistance || distance === bestDistance && (freeExits > bestExits || freeExits === bestExits && candidate < best))) {
        best = candidate; bestSafe = safe; bestDistance = distance; bestExits = freeExits;
      }
    }
    return best;
  });
  const robbers = robberMoves.map(node => node < 0 ? node : exits.has(node) ? -2 : surrounded(node) ? -1 : node);
  return {
    state: { cops: [...cops], robbers, turn: state.turn + 1 }, afterPolice, robberMoves,
    caught: robbers.flatMap((node, i) => node === -1 && state.robbers[i] >= 0 ? [i] : []),
    escaped: robbers.flatMap((node, i) => node === -2 && state.robbers[i] >= 0 ? [i] : []),
  };
}

export function step(level, state, plan) {
  const error = validatePlan(level, state, plan);
  if (error) throw new Error(error);
  return advance(level, state, plan);
}

// Co-located robbers move and are caught together. Identities only matter for
// officers in relay play, where the last officer must also be part of the key.
const searchKey = (state, last) => `${last === null ? [...state.cops].sort((a, b) => a - b) : state.cops}|${[...new Set(state.robbers.filter(n => n >= 0))].sort((a, b) => a - b)}:${last}`;

export function searchSolution(level, state, { maxStates = 240000, maxDepth = Infinity, relayLast = null } = {}) {
  const result = (status, plans = null, reason = null, examined = 0) => ({ status, plans, reason, examined });
  if (state.robbers.includes(-2)) return result('unsolvable', null, 'escaped');
  if (state.robbers.every(node => node === -1)) return result('solved', []);
  const queue = [{ state, last: relayLast, depth: 0, parent: -1, plan: null }];
  const visited = new Set([searchKey(state, relayLast)]);
  let depthLimited = false;
  // Every action, including waiting, costs one turn. FIFO traversal visits all
  // shorter paths before returning a win, so every returned route is shortest.
  for (let index = 0; index < queue.length; index++) {
    if (index >= maxStates) return result('incomplete', null, 'max-states', index);
    const current = queue[index];
    if (current.depth >= maxDepth) { depthLimited = true; continue; }
    for (const plan of legalPlans(level, current.state)) {
      const actor = plan.findIndex((node, i) => node !== current.state.cops[i]);
      if (current.last !== null && actor >= 0 && actor === current.last) continue;
      const nextState = advance(level, current.state, plan).state;
      if (nextState.robbers.includes(-2)) continue;
      const last = current.last === null || actor < 0 ? current.last : actor;
      const key = searchKey(nextState, last);
      if (visited.has(key)) continue;
      visited.add(key);
      if (nextState.robbers.every(node => node === -1)) {
        const plans = [plan];
        for (let entry = current; entry.parent >= 0; entry = queue[entry.parent]) plans.push(entry.plan);
        return result('solved', plans.reverse(), null, index + 1);
      }
      queue.push({ state: nextState, last, depth: current.depth + 1, parent: index, plan });
    }
  }
  return result(depthLimited ? 'incomplete' : 'unsolvable', null, depthLimited ? 'max-depth' : 'exhausted', queue.length);
}

export function solve(level, state, options) {
  return searchSolution(level, state, options).plans;
}
