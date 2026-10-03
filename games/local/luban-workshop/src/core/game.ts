import {
  axes,
  axisIndex,
  EPSILON,
  pieceBounds,
  piecesSeparated,
  selectionIds,
  sweepMove,
} from './collision.ts';
import type {
  Axis,
  GameState,
  Level,
  MoveResult,
  Offsets,
  Progress,
  Snapshot,
  Transaction,
  Vec3,
} from './types.ts';

export const cloneOffsets = (offsets: Offsets): Offsets =>
  Object.fromEntries(
    Object.entries(offsets).map(([id, offset]) => [id, [...offset] as unknown as Vec3]),
  );
const snapshot = (state: GameState): Snapshot => ({
  offsets: cloneOffsets(state.offsets),
  moves: state.moves,
});
const changed = (a: GameState, b: GameState) =>
  Object.keys(a.offsets).some((id) =>
    a.offsets[id]!.some((value, index) => Math.abs(value - b.offsets[id]![index]!) > EPSILON),
  );
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
    offsets: Object.fromEntries(level.pieces.map((piece) => [piece.id, [0, 0, 0]])),
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
  pieceIds: string | readonly string[],
  targetOffset: number,
  requestedAxis?: Axis,
): MoveResult {
  const ids = selectionIds(pieceIds);
  const leader = level.pieces.find((piece) => piece.id === ids[0]);
  const axis = requestedAxis ?? leader?.axis ?? 'x';
  const result = sweepMove(level, state.offsets, ids, targetOffset, axis);
  if (!leader || !axes.includes(axis) || ids.some((id) => !state.offsets[id]))
    return { ...result, state };
  const index = axisIndex(axis);
  const delta = result.actualOffset - state.offsets[leader.id]![index];
  if (Math.abs(delta) < EPSILON) return { ...result, state };
  const offsets = { ...state.offsets };
  for (const id of ids)
    offsets[id] = offsets[id]!.map(
      (value, i) => value + (i === index ? delta : 0),
    ) as unknown as Vec3;
  return { ...result, state: { ...state, offsets } };
}

/** A discrete nudge; a rigid group counts as one action. */
export function tryMove(
  level: Level,
  state: GameState,
  pieceIds: string | readonly string[],
  targetOffset: number,
  axis?: Axis,
): MoveResult {
  const result = moveWithoutHistory(level, state, pieceIds, targetOffset, axis);
  return { ...result, state: record(state, result.state) };
}

export function beginTransaction(
  state: GameState,
  pieceIds: string | readonly string[],
  axis?: Axis,
): Transaction {
  const ids = selectionIds(pieceIds);
  return { pieceId: ids[0] ?? '', pieceIds: ids, axis, before: state, state, snappedState: state };
}

export function updateTransaction(
  level: Level,
  transaction: Transaction,
  targetOffset: number,
  requestedAxis?: Axis,
): MoveResult & { transaction: Transaction } {
  // Lock an established gesture to one axis so each saved move is one legal sweep.
  const axis =
    transaction.axis ??
    requestedAxis ??
    level.pieces.find((piece) => piece.id === transaction.pieceId)?.axis ??
    'x';
  const result = moveWithoutHistory(
    level,
    transaction.state,
    transaction.pieceIds,
    targetOffset,
    axis,
  );
  const snapped = moveWithoutHistory(
    level,
    result.state,
    transaction.pieceIds,
    Math.round(result.actualOffset * 2) / 2,
    axis,
  );
  return {
    ...result,
    transaction: { ...transaction, axis, state: result.state, snappedState: snapped.state },
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
    offsets: cloneOffsets(previous.offsets),
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
    offsets: cloneOffsets(next.offsets),
    history: [...state.history, snapshot(state)],
    future: state.future.slice(0, -1),
  };
}
export function getProgress(level: Level, state: GameState): Progress {
  const bounds = level.pieces.map((piece) => pieceBounds(piece, state.offsets[piece.id]!));
  const removed = bounds.filter((box, i) =>
    bounds.every((other, j) => i === j || piecesSeparated(box, other)),
  ).length;
  const assembled = level.pieces.filter((piece) =>
    state.offsets[piece.id]!.every((coordinate) => Math.abs(coordinate) < EPSILON),
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
