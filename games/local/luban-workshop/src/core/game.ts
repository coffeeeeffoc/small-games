import { EPSILON, sweepMove } from './collision.ts';
import type { GameState, Level, MoveResult, Progress, Snapshot, Transaction } from './types.ts';

const snapshot = (state: GameState): Snapshot => ({
  offsets: { ...state.offsets },
  moves: state.moves,
});
const changed = (a: GameState, b: GameState) =>
  Object.keys(a.offsets).some((id) => Math.abs(a.offsets[id]! - b.offsets[id]!) > EPSILON);
const record = (before: GameState, after: GameState): GameState =>
  changed(before, after)
    ? {
        ...after,
        moves: before.moves + 1,
        history: [...before.history, snapshot(before)],
        future: [],
      }
    : before;

export function createGame(level: Level): GameState {
  return {
    levelId: level.id,
    offsets: Object.fromEntries(level.pieces.map((piece) => [piece.id, 0])),
    phase: 'disassemble',
    moves: 0,
    history: [],
    future: [],
  };
}

export const resetGame = createGame;

function moveWithoutHistory(
  level: Level,
  state: GameState,
  pieceId: string,
  targetOffset: number,
): MoveResult {
  const result = sweepMove(level, state.offsets, pieceId, targetOffset);
  if (!(pieceId in state.offsets)) return { ...result, state };
  return {
    ...result,
    state: { ...state, offsets: { ...state.offsets, [pieceId]: result.actualOffset } },
  };
}

/** A discrete button/keyboard move; drag gestures use transactions instead. */
export function tryMove(
  level: Level,
  state: GameState,
  pieceId: string,
  targetOffset: number,
): MoveResult {
  const result = moveWithoutHistory(level, state, pieceId, targetOffset);
  return { ...result, state: record(state, result.state) };
}

export function beginTransaction(state: GameState, pieceId: string): Transaction {
  return { pieceId, before: state, state, snappedState: state };
}

export function updateTransaction(
  level: Level,
  transaction: Transaction,
  targetOffset: number,
): MoveResult & { transaction: Transaction } {
  const result = moveWithoutHistory(level, transaction.state, transaction.pieceId, targetOffset);
  // Match the half-unit nudge controls so switching between touch and buttons
  // never ejects a valid half-grid position onto an unrelated whole-grid seat.
  // Release on the nearest half-grid position only if its entire path is clear.
  // This is computed from the current preview so a snap cannot tunnel either.
  const snapped = moveWithoutHistory(
    level,
    result.state,
    transaction.pieceId,
    Math.round(result.actualOffset * 2) / 2,
  );
  return {
    ...result,
    transaction: { ...transaction, state: result.state, snappedState: snapped.state },
  };
}

export function commitTransaction(transaction: Transaction): GameState {
  return record(transaction.before, transaction.snappedState);
}

export function cancelTransaction(transaction: Transaction): GameState {
  return transaction.before;
}

export function undo(state: GameState): GameState {
  const previous = state.history.at(-1);
  if (!previous) return state;
  return {
    ...state,
    ...previous,
    offsets: { ...previous.offsets },
    history: state.history.slice(0, -1),
    future: [...state.future, snapshot(state)],
  };
}

export function redo(state: GameState): GameState {
  const next = state.future.at(-1);
  if (!next) return state;
  return {
    ...state,
    ...next,
    offsets: { ...next.offsets },
    history: [...state.history, snapshot(state)],
    future: state.future.slice(0, -1),
  };
}

export function getProgress(level: Level, state: GameState): Progress {
  const removed = level.pieces.filter(
    (piece) => Math.abs(state.offsets[piece.id]!) >= piece.removedAt - EPSILON,
  ).length;
  const assembled = level.pieces.filter(
    (piece) => Math.abs(state.offsets[piece.id]!) < EPSILON,
  ).length;
  return {
    removed,
    assembled,
    total: level.pieces.length,
    complete: (state.phase === 'disassemble' ? removed : assembled) === level.pieces.length,
  };
}

export function switchToReassembly(level: Level, state: GameState): GameState {
  if (state.phase !== 'disassemble' || !getProgress(level, state).complete) return state;
  return { ...state, phase: 'reassemble', moves: 0, history: [], future: [] };
}
