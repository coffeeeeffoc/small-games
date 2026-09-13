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
  if (state.robbers.includes(-2)) return '小偷已经逃脱，请撤销或重试';
  if (!Array.isArray(plan) || plan.length !== state.cops.length) return '请选择一位警察移动';
  if (plan.filter((node, index) => node !== state.cops[index]).length > 1) return '每步只能移动一位警察';
  for (let i = 0; i < plan.length; i++) {
    if (!Number.isInteger(plan[i]) || !legalTargets(level, state, i).includes(plan[i])) return '警察只能走到相邻路口，不能走进小偷所在位置';
  }
  if (new Set(plan).size !== plan.length) return '两位警察不能停在同一路口';
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

// Cop identities and caught robber identities do not change which positions can win.
const searchKey = state => `${[...state.cops].sort((a, b) => a - b)}|${state.robbers.filter(n => n >= 0).sort((a, b) => a - b)}`;

export function solve(level, state, { maxStates = 18000, maxDepth = 70 } = {}) {
  if (state.robbers.includes(-2)) return null;
  if (state.robbers.every(node => node === -1)) return [];
  const live = current => [...new Set(current.robbers.filter(node => node >= 0))];
  function estimate(current) {
    let closest = Infinity, total = 0;
    const targets = live(current);
    if (!targets.length) return 0;
    for (const robber of targets) {
      let effort = Infinity;
      // Plan toward a capturable node near the robber, including a dead end on a branch.
      for (let node = 0; node < level.nodes.length; node++) {
        if (level.exits.includes(node)) continue;
        const exits = level.adj[node];
        if (exits.length > current.cops.length) continue;
        const cost = exits.reduce((sum, exit) => sum + Math.min(...current.cops.map(cop => level.dist[cop][exit])), 0) / exits.length;
        effort = Math.min(effort, cost + level.dist[robber][node] * 1.4);
      }
      closest = Math.min(closest, effort); total += effort;
    }
    return targets.length * 9 + closest * 2 + total * 0.25;
  }
  const heap = [];
  let sequence = 0;
  const push = item => {
    let i = heap.length; heap.push(item);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent].score <= item.score) break;
      heap[i] = heap[parent]; i = parent;
    }
    heap[i] = item;
  };
  const pop = () => {
    const first = heap[0], last = heap.pop();
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++;
        if (heap[child].score >= last.score) break;
        heap[i] = heap[child]; i = child;
      }
      heap[i] = last;
    }
    return first;
  };
  const start = { state, depth: 0, parent: null, plan: null, score: estimate(state) };
  push(start);
  const visited = new Map([[searchKey(state), 0]]);
  // ponytail: bounded best-first search keeps hints responsive; raise the state budget for larger future maps.
  let examined = 0;
  while (heap.length && examined++ < maxStates) {
    const current = pop();
    if (current.depth >= maxDepth || visited.get(searchKey(current.state)) < current.depth) continue;
    for (const plan of legalPlans(level, current.state)) {
      const nextState = advance(level, current.state, plan).state;
      if (nextState.robbers.includes(-2)) continue;
      const key = searchKey(nextState), depth = current.depth + 1;
      if ((visited.get(key) ?? Infinity) <= depth) continue;
      visited.set(key, depth);
      const next = { state: nextState, depth, parent: current, plan: [...plan], score: depth * 0.7 + estimate(nextState) + sequence++ * 1e-10 };
      if (nextState.robbers.every(node => node === -1)) {
        const solution = [];
        for (let entry = next; entry.parent; entry = entry.parent) solution.push(entry.plan);
        return solution.reverse();
      }
      push(next);
    }
  }
  return null;
}
