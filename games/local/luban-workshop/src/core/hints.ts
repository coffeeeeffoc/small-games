import { EPSILON } from './collision.ts';
import { getProgress } from './game.ts';
import { createSearchSweep } from './search-sweep.ts';
import type { GameState, Hint, Level, Offsets } from './types.ts';

interface SearchNode {
  offsets: Offsets;
  parent: SearchNode | null;
  action: Hint | null;
  depth: number;
  remaining: number;
}

/** Prefer states with a lower possible total move count; break ties toward
 * progress. Every unfinished piece needs at least one move, so this heuristic
 * remains valid for locks that need temporary movement or backtracking.
 */
const priority = (a: SearchNode, b: SearchNode): number =>
  a.depth + a.remaining - (b.depth + b.remaining) || a.remaining - b.remaining;

class Frontier {
  private nodes: SearchNode[] = [];

  push(node: SearchNode): void {
    let index = this.nodes.push(node) - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (priority(this.nodes[parent]!, node) <= 0) break;
      this.nodes[index] = this.nodes[parent]!;
      index = parent;
    }
    this.nodes[index] = node;
  }

  pop(): SearchNode | undefined {
    const first = this.nodes[0];
    const last = this.nodes.pop();
    if (!last || this.nodes.length === 0) return first;
    let index = 0;
    while (index * 2 + 1 < this.nodes.length) {
      let child = index * 2 + 1;
      if (child + 1 < this.nodes.length && priority(this.nodes[child + 1]!, this.nodes[child]!) < 0)
        child++;
      if (priority(last, this.nodes[child]!) <= 0) break;
      this.nodes[index] = this.nodes[child]!;
      index = child;
    }
    this.nodes[index] = last;
    return first;
  }
}

// Following an already solved path should never repeat the search on every
// hint press. The level identity also isolates caches for revised geometry.
const solutions = new WeakMap<Level, Map<string, Hint>>();
const sweeps = new WeakMap<Level, ReturnType<typeof createSearchSweep>>();
const CACHE_LIMIT = 512;

/** Searches legal maximal slides from the actual current position. Contact
 * points, endpoints, and seats are derived from geometry, never a canned order.
 * A bounded A* search keeps branch and captive-key puzzles responsive while
 * retaining the possibility of temporarily moving away from the goal. Assembly
 * is searched in reverse, from seated pieces to the player's exact positions:
 * the original contact points then remain available even after a frame has
 * moved away. Every returned reverse move follows the same collision-free path.
 */
export function getHint(level: Level, state: GameState): Hint | null {
  if (getProgress(level, state).complete) return null;
  const key = (offsets: Offsets) =>
    `${state.phase}:` + level.pieces.map((piece) => Math.round(offsets[piece.id]! * 1e6)).join(',');
  const cache = solutions.get(level) ?? new Map<string, Hint>();
  solutions.set(level, cache);
  const startKey = key(state.offsets);
  const cached = cache.get(startKey);
  if (cached) return { ...cached };
  const sweep = sweeps.get(level) ?? createSearchSweep(level);
  sweeps.set(level, sweep);
  const reverse = state.phase === 'reassemble';
  const origin: Offsets = reverse
    ? Object.fromEntries(level.pieces.map((piece) => [piece.id, 0]))
    : state.offsets;
  const remaining = (offsets: Offsets): number => {
    if (reverse)
      return level.pieces.filter(
        (piece) => Math.abs(offsets[piece.id]! - state.offsets[piece.id]!) >= EPSILON,
      ).length;
    const progress = getProgress(level, { ...state, offsets });
    return progress.total - (state.phase === 'disassemble' ? progress.removed : progress.assembled);
  };
  const describe = (pieceId: string, targetOffset: number, current: number): Hint => {
    const piece = level.pieces.find((candidate) => candidate.id === pieceId)!;
    const goalAction =
      reverse && Math.abs(targetOffset) < EPSILON
        ? '推回原位'
        : Math.abs(targetOffset) >= piece.removedAt - EPSILON
          ? '沿轨道抽出'
          : '沿轨道移到让位处';
    return {
      pieceId,
      targetOffset,
      direction: targetOffset > current ? 1 : -1,
      message: `试着将${piece.name.split(' · ').at(-1)}${goalAction}。沿高亮箭头拖动。`,
    };
  };
  const frontier = new Frontier();
  frontier.push({
    offsets: origin,
    parent: null,
    action: null,
    depth: 0,
    remaining: remaining(origin),
  });
  const visited = new Map([[key(origin), 0]]);
  for (let expanded = 0; expanded < 12000; expanded++) {
    const node = frontier.pop();
    if (!node) break;
    if (node.depth !== visited.get(key(node.offsets))) continue;
    if (node.remaining === 0) {
      let cursor = node;
      while (cursor.parent && cursor.action) {
        if (reverse) {
          const pieceId = cursor.action.pieceId;
          cache.set(
            key(cursor.offsets),
            describe(pieceId, cursor.parent.offsets[pieceId]!, cursor.offsets[pieceId]!),
          );
        } else cache.set(key(cursor.parent.offsets), cursor.action);
        if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
        cursor = cursor.parent;
      }
      return { ...cache.get(startKey)! };
    }
    for (const piece of level.pieces) {
      const current = node.offsets[piece.id]!;
      // Include returning a partly moved piece to its seat. This keeps advice
      // useful after experiments rather than merely replaying a canned solution.
      const targets = reverse
        ? [state.offsets[piece.id]!, piece.range[1], piece.range[0], 0]
        : [piece.range[1], piece.range[0], 0];
      for (const target of new Set(targets)) {
        const actualOffset = sweep(node.offsets, piece.id, target);
        if (Math.abs(actualOffset - current) < EPSILON) continue;
        const offsets = { ...node.offsets, [piece.id]: actualOffset };
        const stateKey = key(offsets);
        const depth = node.depth + 1;
        if (depth >= (visited.get(stateKey) ?? Infinity)) continue;
        visited.set(stateKey, depth);
        const hint = describe(piece.id, actualOffset, current);
        frontier.push({
          offsets,
          parent: node,
          action: hint,
          depth,
          remaining: remaining(offsets),
        });
      }
    }
  }
  return null;
}
