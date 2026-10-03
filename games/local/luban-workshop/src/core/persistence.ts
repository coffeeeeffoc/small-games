import { EPSILON, isCollisionFree, sweepMove } from './collision.ts';
import type { GameState, Level, Offsets, Snapshot } from './types.ts';

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function serializeGame(state: GameState): string {
  return JSON.stringify({ version: 1, state });
}

/** Local storage is untrusted: reject malformed, colliding, out-of-range, or
 * impossible undo timelines, and let the caller start a clean level instead.
 */
export function restoreGame(level: Level, raw: string): GameState | null {
  if (typeof raw !== 'string' || raw.length > 400000) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!isObject(data) || data.version !== 1 || !isObject(data.state)) return null;
    const state = data.state;
    if (state.levelId !== level.id || !['disassemble', 'reassemble'].includes(String(state.phase)))
      return null;
    const validOffsets = (offsets: unknown): offsets is Offsets => {
      if (!isObject(offsets) || Object.keys(offsets).length !== level.pieces.length) return false;
      for (const piece of level.pieces) {
        const value = offsets[piece.id];
        if (
          typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value < piece.range[0] - EPSILON ||
          value > piece.range[1] + EPSILON
        )
          return false;
      }
      return isCollisionFree(level, offsets as Offsets);
    };
    const validSnapshot = (item: unknown): item is Snapshot =>
      isObject(item) &&
      validOffsets(item.offsets) &&
      Number.isSafeInteger(item.moves) &&
      Number(item.moves) >= 0;
    if (
      !validSnapshot(state) ||
      !Array.isArray(state.history) ||
      !Array.isArray(state.future) ||
      state.history.length + state.future.length > 2000
    )
      return null;
    if (!state.history.every(validSnapshot) || !state.future.every(validSnapshot)) return null;
    const timeline = [
      ...state.history,
      { offsets: state.offsets, moves: state.moves },
      ...state.future.slice().reverse(),
    ] as Snapshot[];
    for (let i = 1; i < timeline.length; i++) {
      const before = timeline[i - 1]!;
      const after = timeline[i]!;
      const changed = level.pieces.filter(
        (piece) => Math.abs(before.offsets[piece.id]! - after.offsets[piece.id]!) > EPSILON,
      );
      if (changed.length !== 1 || after.moves !== before.moves + 1) return null;
      const pieceId = changed[0]!.id;
      const result = sweepMove(level, before.offsets, pieceId, after.offsets[pieceId]!);
      if (Math.abs(result.actualOffset - after.offsets[pieceId]!) > EPSILON) return null;
    }
    return {
      levelId: level.id,
      phase: state.phase as GameState['phase'],
      offsets: { ...state.offsets },
      moves: state.moves,
      history: state.history.map((item) => ({ offsets: { ...item.offsets }, moves: item.moves })),
      future: state.future.map((item) => ({ offsets: { ...item.offsets }, moves: item.moves })),
    };
  } catch {
    return null;
  }
}
