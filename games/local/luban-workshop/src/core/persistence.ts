import { axisIndex, EPSILON, isCollisionFree, sweepMove } from './collision.ts';
import type { Axis, GameState, Level, Offsets, Snapshot, Vec3 } from './types.ts';

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const axes: readonly Axis[] = ['x', 'y', 'z'];

export function serializeGame(state: GameState): string {
  return JSON.stringify({ version: 2, state });
}

/** Local storage is untrusted. Validate both endpoint geometry and the complete
 * swept path of each undo/redo step, including rigid groups. Legacy scalar saves
 * retain their original axis and range restrictions while being migrated.
 */
export function restoreGame(level: Level, raw: string): GameState | null {
  if (typeof raw !== 'string' || raw.length > 400000) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!isObject(data) || (data.version !== 1 && data.version !== 2) || !isObject(data.state))
      return null;
    const legacy = data.version === 1;
    const state = data.state;
    if (
      state.levelId !== level.id ||
      (state.phase !== 'disassemble' && state.phase !== 'reassemble') ||
      !Array.isArray(state.history) ||
      !Array.isArray(state.future) ||
      state.history.length + state.future.length > 2000
    )
      return null;

    const readOffsets = (input: unknown): Offsets | null => {
      if (!isObject(input) || Object.keys(input).length !== level.pieces.length) return null;
      const offsets: Offsets = {};
      for (const piece of level.pieces) {
        if (!Object.hasOwn(input, piece.id)) return null;
        const value = input[piece.id];
        let vector: Vec3;
        if (legacy) {
          if (
            typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value < piece.range[0] - EPSILON ||
            value > piece.range[1] + EPSILON
          )
            return null;
          const migrated: [number, number, number] = [0, 0, 0];
          migrated[axisIndex(piece.axis)] = value;
          vector = migrated;
        } else {
          if (
            !Array.isArray(value) ||
            value.length !== 3 ||
            !value.every(
              (coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate),
            )
          )
            return null;
          vector = [value[0], value[1], value[2]];
        }
        offsets[piece.id] = vector;
      }
      return isCollisionFree(level, offsets) ? offsets : null;
    };
    const readSnapshot = (input: unknown): Snapshot | null => {
      if (!isObject(input) || !Number.isSafeInteger(input.moves) || Number(input.moves) < 0)
        return null;
      const offsets = readOffsets(input.offsets);
      return offsets ? { offsets, moves: Number(input.moves) } : null;
    };
    const current = readSnapshot(state);
    if (!current) return null;
    const history: Snapshot[] = [];
    const future: Snapshot[] = [];
    for (const [input, output] of [
      [state.history, history],
      [state.future, future],
    ] as const) {
      for (const item of input) {
        const snapshot = readSnapshot(item);
        if (!snapshot) return null;
        output.push(snapshot);
      }
    }
    const timeline = [...history, current, ...future.slice().reverse()];
    for (let i = 1; i < timeline.length; i++) {
      const before = timeline[i - 1]!;
      const after = timeline[i]!;
      if (after.moves !== before.moves + 1) return null;
      const changed: string[] = [];
      let moveAxis: Axis | undefined;
      let moveDelta: number | undefined;
      for (const piece of level.pieces) {
        const delta = axes.map(
          (_, index) => after.offsets[piece.id]![index]! - before.offsets[piece.id]![index]!,
        );
        // Finite coordinates alone do not guarantee a finite subtraction.
        if (delta.some((value) => !Number.isFinite(value))) return null;
        const movingAxes = axes.filter((_, index) => Math.abs(delta[index]!) > EPSILON);
        if (movingAxes.length === 0) continue;
        if (movingAxes.length !== 1) return null;
        const axis = movingAxes[0]!;
        const distance = delta[axisIndex(axis)]!;
        if (
          (legacy && axis !== piece.axis) ||
          (moveAxis !== undefined && moveAxis !== axis) ||
          (moveDelta !== undefined && Math.abs(distance - moveDelta) > EPSILON)
        )
          return null;
        moveAxis = axis;
        moveDelta = distance;
        changed.push(piece.id);
      }
      if (!changed.length || (legacy && changed.length !== 1) || moveAxis === undefined)
        return null;
      const target = after.offsets[changed[0]!]![axisIndex(moveAxis)];
      const result = sweepMove(level, before.offsets, changed, target, moveAxis);
      if (!Number.isFinite(result.actualOffset) || Math.abs(result.actualOffset - target) > EPSILON)
        return null;
    }
    return {
      levelId: level.id,
      phase: state.phase,
      offsets: current.offsets,
      moves: current.moves,
      history,
      future,
    };
  } catch {
    return null;
  }
}
