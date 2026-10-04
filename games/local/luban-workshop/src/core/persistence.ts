import {
  axisIndex,
  EPSILON,
  isCollisionFree,
  pieceBounds,
  sweepMove,
  sweepRotation,
} from './collision.ts';
import type {
  Axis,
  GameState,
  Level,
  Offsets,
  Orientation,
  Orientations,
  Snapshot,
  Vec3,
} from './types.ts';

import {
  IDENTITY_ORIENTATION,
  isCubeOrientation,
  orientationsEqual,
  relativeAxisRotation,
  validOrientation,
} from './rotation.ts';

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const axes: readonly Axis[] = ['x', 'y', 'z'];

export function serializeGame(state: GameState): string {
  return JSON.stringify({ version: 4, state });
}

/** Local storage is untrusted. Validate both endpoint geometry and the complete
 * swept path of each undo/redo step, including rigid groups. Legacy scalar saves
 * retain their original axis and range restrictions while being migrated.
 */
export function restoreGame(level: Level, raw: string): GameState | null {
  // Orientation snapshots include full rotation matrices as well as positions.
  // Oblique matrices need more bytes than signed permutations. Keep enough
  // room for 2,000 actions, including ten-piece fractional-turn histories.
  if (typeof raw !== 'string' || raw.length > 8_000_000) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (
      !isObject(data) ||
      (data.version !== 1 && data.version !== 2 && data.version !== 3 && data.version !== 4) ||
      !isObject(data.state)
    )
      return null;
    if (Number(data.version) < 3 && raw.length > 400_000) return null;
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
      return offsets;
    };
    const readOrientations = (input: unknown): Orientations | null => {
      if (Number(data.version) < 3)
        return Object.fromEntries(
          level.pieces.map((piece) => [
            piece.id,
            [...IDENTITY_ORIENTATION] as unknown as Orientation,
          ]),
        );
      if (!isObject(input) || Object.keys(input).length !== level.pieces.length) return null;
      const orientations: Orientations = {};
      for (const piece of level.pieces) {
        if (!Object.hasOwn(input, piece.id) || !validOrientation(input[piece.id])) return null;
        if (data.version === 3 && !isCubeOrientation(input[piece.id] as Orientation)) return null;
        orientations[piece.id] = [...(input[piece.id] as Orientation)] as unknown as Orientation;
      }
      return orientations;
    };
    const readSnapshot = (input: unknown): Snapshot | null => {
      if (!isObject(input) || !Number.isSafeInteger(input.moves) || Number(input.moves) < 0)
        return null;
      const offsets = readOffsets(input.offsets);
      const orientations = readOrientations(input.orientations);
      return offsets && orientations && isCollisionFree(level, offsets, orientations)
        ? { offsets, orientations, moves: Number(input.moves) }
        : null;
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
      const rotating = level.pieces
        .filter(
          (piece) =>
            !orientationsEqual(before.orientations[piece.id]!, after.orientations[piece.id]!),
        )
        .map((piece) => piece.id);
      if (rotating.length) {
        if (Number(data.version) < 3) return null;
        const turn = relativeAxisRotation(
          before.orientations[rotating[0]!]!,
          after.orientations[rotating[0]!]!,
        );
        if (!turn || (data.version === 3 && Math.abs(turn.degrees - 90) > EPSILON)) return null;
        // A 180° endpoint has two possible swept arcs; accept if either is legal.
        const directions =
          Math.abs(turn.degrees - 180) < EPSILON ? ([-1, 1] as const) : [turn.direction];
        const matches = directions.some((direction) => {
          const bounds = level.pieces
            .filter((piece) => rotating.includes(piece.id))
            .map((piece) =>
              pieceBounds(piece, before.offsets[piece.id]!, before.orientations[piece.id]),
            );
          const legacyPivot = [0, 1, 2].map(
            (i) =>
              (Math.min(...bounds.map((box) => box.min[i]!)) +
                Math.max(...bounds.map((box) => box.max[i]!))) /
              2,
          ) as unknown as Vec3;
          // v3 used the enclosing-box center. Keep that legal history readable
          // even after migration and a later v4 save of the same timeline.
          return [undefined, legacyPivot].some((pivot) => {
            const result = sweepRotation(
              level,
              before.offsets,
              before.orientations,
              rotating,
              turn.axis,
              direction as -1 | 1,
              turn.degrees,
              pivot,
            );
            return (
              !result.blocked &&
              level.pieces.every(
                (piece) =>
                  result.offsets[piece.id]!.every(
                    (value, j) => Math.abs(value - after.offsets[piece.id]![j]!) <= EPSILON,
                  ) &&
                  orientationsEqual(result.orientations[piece.id]!, after.orientations[piece.id]!),
              )
            );
          });
        });
        if (!matches) return null;
        continue;
      }
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
      const result = sweepMove(
        level,
        before.offsets,
        changed,
        target,
        moveAxis,
        before.orientations,
      );
      if (!Number.isFinite(result.actualOffset) || Math.abs(result.actualOffset - target) > EPSILON)
        return null;
    }
    return {
      levelId: level.id,
      phase: state.phase,
      offsets: current.offsets,
      orientations: current.orientations,
      moves: current.moves,
      history,
      future,
    };
  } catch {
    return null;
  }
}
