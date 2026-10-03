import { EPSILON, sweepMove } from './collision.ts';
import { getProgress } from './game.ts';
import type { GameState, Hint, Level, Offsets } from './types.ts';

interface SearchNode {
  offsets: Offsets;
  first: Hint | null;
}

/** Searches legal maximal slides from the actual current position. Nothing in
 * the level data encodes a move order. Contact positions become search states,
 * allowing the next piece to move as soon as physical clearance is available.
 * This bounded solver is intended for these small, axis-only introductory locks.
 */
export function getHint(level: Level, state: GameState): Hint | null {
  if (getProgress(level, state).complete) return null;
  const key = (offsets: Offsets) =>
    level.pieces.map((piece) => Math.round(offsets[piece.id]! * 1e4)).join(',');
  const queue: SearchNode[] = [{ offsets: state.offsets, first: null }];
  const visited = new Set([key(state.offsets)]);
  for (let cursor = 0; cursor < queue.length && cursor < 12000; cursor++) {
    const node = queue[cursor]!;
    for (const piece of level.pieces) {
      const current = node.offsets[piece.id]!;
      // Include returning a partly moved piece to its seat. This keeps advice
      // useful after experiments rather than merely replaying a canned solution.
      const targets =
        state.phase === 'reassemble'
          ? [0, piece.range[0], piece.range[1]]
          : [piece.range[1], piece.range[0], 0];
      for (const target of targets) {
        const result = sweepMove(level, node.offsets, piece.id, target);
        if (Math.abs(result.actualOffset - current) < EPSILON) continue;
        const offsets = { ...node.offsets, [piece.id]: result.actualOffset };
        const stateKey = key(offsets);
        if (visited.has(stateKey)) continue;
        visited.add(stateKey);
        const direction = result.actualOffset > current ? 1 : -1;
        const goalAction =
          state.phase === 'reassemble' && Math.abs(result.actualOffset) < EPSILON
            ? '推回原位'
            : Math.abs(result.actualOffset) >= piece.removedAt - EPSILON
              ? '沿轨道抽出'
              : '沿轨道移动到接触处';
        const hint: Hint = node.first ?? {
          pieceId: piece.id,
          targetOffset: result.actualOffset,
          direction,
          message: `试着将${piece.name.split(' · ').at(-1)}${goalAction}。沿高亮箭头拖动。`,
        };
        if (getProgress(level, { ...state, offsets }).complete) return hint;
        queue.push({ offsets, first: hint });
      }
    }
  }
  return null;
}
