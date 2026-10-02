export const initialDuel = (level, firstSide = 'pursuer') => ({ cops: [...level.cops], robbers: [...level.robbers], turn: 0, side: firstSide, winner: null });
export function legalDuelTargets(level, state, actor, side = state.side) {
  if (state.winner || !['pursuer', 'runner'].includes(side) || !Number.isInteger(actor)) return [];
  const positions = side === 'pursuer' ? state.cops : state.robbers, from = positions[actor];
  if (!Number.isInteger(from) || from < 0 || !level.adj[from]) return [];
  return [from, ...level.adj[from]].filter(node => !positions.some((position, index) => index !== actor && position === node) && (side === 'pursuer' || !state.cops.includes(node)));
}
export function duelActions(level, state) {
  return (state.side === 'pursuer' ? state.cops : state.robbers).flatMap((_, actor) => legalDuelTargets(level, state, actor).map(target => ({ type: 'move', side: state.side, actor, target })));
}
export function stepDuel(level, state, action) {
  if (state.winner || !action || action.type !== 'move' || action.side !== state.side || !legalDuelTargets(level, state, action.actor).includes(action.target)) throw new Error('现在不能执行这步：请选择轮到的一方和相邻路口。');
  const next = { ...state, cops: [...state.cops], robbers: [...state.robbers], turn: state.turn + 1, side: state.side === 'pursuer' ? 'runner' : 'pursuer' };
  if (action.side === 'pursuer') { next.cops[action.actor] = action.target; next.robbers = next.robbers.map(node => node === action.target ? -1 : node); }
  else next.robbers[action.actor] = action.target;
  if (next.robbers.every(node => node < 0)) next.winner = 'pursuer';
  else if (next.robbers.some(node => level.exits.includes(node)) || next.turn >= level.roundLimit * 2) next.winner = 'runner';
  return next;
}
function evaluate(level, state) {
  if (state.winner) return state.winner === 'pursuer' ? 100000 - state.turn : -100000 + state.turn;
  const runners = state.robbers.filter(node => node >= 0);
  let cost = 0;
  for (const runner of runners) {
    const distances = state.cops.map(cop => level.dist[cop][runner]).sort((a, b) => a - b);
    cost += distances[0] * 12 + (distances[1] || 0) * 3 + legalDuelTargets(level, state, state.robbers.indexOf(runner), 'runner').length * 2;
    if (level.exits.length) {
      const safeExits = level.exits.filter(exit => !state.cops.includes(exit));
      if (safeExits.length) cost += 45 / (1 + Math.min(...safeExits.map(exit => level.dist[runner][exit])));
    }
  }
  return -cost - runners.length * 150;
}
export function chooseDuelAction(level, state) {
  // ponytail: 2-4 ply alpha-beta fits a phone turn; deeper search belongs in a worker if maps grow beyond 36 nodes.
  const depth = level.difficulty >= 4 ? 4 : level.difficulty >= 2 ? 3 : 2;
  function search(current, remaining, alpha, beta) {
    if (!remaining || current.winner) return evaluate(level, current);
    const maximize = current.side === 'pursuer';
    let score = maximize ? -Infinity : Infinity;
    const options = duelActions(level, current).map(action => ({ action, next: stepDuel(level, current, action) })).sort((a, b) => maximize ? evaluate(level, b.next) - evaluate(level, a.next) : evaluate(level, a.next) - evaluate(level, b.next));
    for (const { next } of options) {
      const value = search(next, remaining - 1, alpha, beta);
      score = maximize ? Math.max(score, value) : Math.min(score, value);
      if (maximize) alpha = Math.max(alpha, score); else beta = Math.min(beta, score);
      if (beta <= alpha) break;
    }
    return score;
  }
  const options = duelActions(level, state), maximize = state.side === 'pursuer';
  let chosen = options[0], best = maximize ? -Infinity : Infinity;
  for (const action of options) {
    const score = search(stepDuel(level, state, action), depth - 1, -Infinity, Infinity);
    if (maximize ? score > best : score < best) { best = score; chosen = action; }
  }
  return chosen;
}
