/** Attempt statistics live outside the reversible puzzle timeline. */
export interface RunStats {
  hints: number;
  disassemblyMoves: number | null;
}

export interface CompletionRecord {
  completed: boolean;
  independent: boolean;
  bestMoves: number | null;
}

const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export const freshRun = (): RunStats => ({ hints: 0, disassemblyMoves: null });
export const emptyRecord = (): CompletionRecord => ({
  completed: false,
  independent: false,
  bestMoves: null,
});

export function parseRun(raw: string | null): RunStats | null {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (
      !object(value) ||
      !count(value.hints) ||
      !(value.disassemblyMoves === null || count(value.disassemblyMoves))
    )
      return null;
    return { hints: value.hints, disassemblyMoves: value.disassemblyMoves };
  } catch {
    return null;
  }
}

export function parseRecord(raw: string | null): CompletionRecord | null {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (
      !object(value) ||
      typeof value.completed !== 'boolean' ||
      typeof value.independent !== 'boolean' ||
      !(value.bestMoves === null || count(value.bestMoves)) ||
      (!value.completed && (value.independent || value.bestMoves !== null))
    )
      return null;
    return {
      completed: value.completed,
      independent: value.independent,
      bestMoves: value.bestMoves,
    };
  } catch {
    return null;
  }
}

/** Unknown legacy attempt history can earn completion, but no independent seal
 * or move record. A later fresh attempt can still improve both achievements.
 */
export function finishRun(
  previous: CompletionRecord,
  run: RunStats,
  reassemblyMoves: number,
): CompletionRecord {
  const knownAttempt = count(run.hints) && count(run.disassemblyMoves) && count(reassemblyMoves);
  const total = knownAttempt ? run.disassemblyMoves! + reassemblyMoves : null;
  const moves = total !== null && count(total) ? total : null;
  return {
    completed: true,
    independent: previous.independent || (knownAttempt && run.hints === 0),
    bestMoves:
      moves === null
        ? previous.bestMoves
        : previous.bestMoves === null
          ? moves
          : Math.min(previous.bestMoves, moves),
  };
}
