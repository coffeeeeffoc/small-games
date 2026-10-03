import type { Axis, Box, Level, Offsets, PieceDefinition, Vec3 } from './types.ts';

export const EPSILON = 0.000001;
export const axisIndex = (axis: Axis): 0 | 1 | 2 => (axis === 'x' ? 0 : axis === 'y' ? 1 : 2);
export const axes: readonly Axis[] = ['x', 'y', 'z'];
export const selectionIds = (ids: string | readonly string[]): string[] => [
  ...new Set(typeof ids === 'string' ? [ids] : ids),
];
export const finiteVector = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

export function worldBox(box: Box, _piece: PieceDefinition, offset: Vec3): Box {
  return {
    min: box.min.map((value, i) => value + offset[i]!) as unknown as Vec3,
    max: box.max.map((value, i) => value + offset[i]!) as unknown as Vec3,
  };
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.min.every((value, i) => value < b.max[i]! - EPSILON && a.max[i]! > b.min[i]! + EPSILON);
}

export function pieceBounds(piece: PieceDefinition, offset: Vec3): Box {
  return {
    min: [0, 1, 2].map(
      (i) => Math.min(...piece.boxes.map((box) => box.min[i]!)) + offset[i]!,
    ) as unknown as Vec3,
    max: [0, 1, 2].map(
      (i) => Math.max(...piece.boxes.map((box) => box.max[i]!)) + offset[i]!,
    ) as unknown as Vec3,
  };
}

/** Clearance between enclosing boxes prevents a piece sitting inside a fork's
 * empty slot from counting as removed. It also depends only on relative pose. */
export function piecesSeparated(a: Box, b: Box): boolean {
  const clearance = 0.25;
  return a.min.some(
    (value, i) =>
      value >= b.max[i]! + clearance - EPSILON || b.min[i]! >= a.max[i]! + clearance - EPSILON,
  );
}

export function isCollisionFree(level: Level, offsets: Offsets): boolean {
  if (level.pieces.some((piece) => !finiteVector(offsets[piece.id]))) return false;
  for (let i = 0; i < level.pieces.length; i++) {
    const a = level.pieces[i]!;
    for (let j = i + 1; j < level.pieces.length; j++) {
      const b = level.pieces[j]!;
      for (const aBox of a.boxes)
        for (const bBox of b.boxes) {
          if (boxesOverlap(worldBox(aBox, a, offsets[a.id]!), worldBox(bBox, b, offsets[b.id]!)))
            return false;
        }
    }
  }
  return true;
}

export interface SweepResult {
  actualOffset: number;
  blocked: boolean;
  blockedBy: string[];
}

/** Exact swept AABB test for a rigid selection translating on a world axis.
 * Selected members retain their relative poses and never obstruct each other.
 * The entire interval is checked, including obstacles beyond the drag endpoint.
 * Face contact is permitted; positive-volume intersection is not.
 */
export function sweepMove(
  level: Level,
  offsets: Offsets,
  pieceIds: string | readonly string[],
  requestedOffset: number,
  requestedAxis?: Axis,
): SweepResult {
  const ids = selectionIds(pieceIds);
  const leader = level.pieces.find((candidate) => candidate.id === ids[0]);
  const axis = requestedAxis ?? leader?.axis ?? 'x';
  const index = axisIndex(axis);
  const current = offsets[ids[0] ?? '']?.[index];
  const invalid = {
    actualOffset: Number.isFinite(current) ? current! : 0,
    blocked: true,
    blockedBy: [],
  };
  if (
    !leader ||
    !axes.includes(axis) ||
    !Number.isFinite(requestedOffset) ||
    !Number.isFinite(current) ||
    !Number.isFinite(requestedOffset - current!) ||
    level.pieces.some((piece) => !finiteVector(offsets[piece.id])) ||
    ids.some((id) => !level.pieces.some((piece) => piece.id === id))
  )
    return invalid;
  const delta = requestedOffset - current!;
  if (ids.some((id) => !Number.isFinite(offsets[id]![index] + delta))) return invalid;
  if (Math.abs(delta) < EPSILON) return { actualOffset: current!, blocked: false, blockedBy: [] };
  const sign = Math.sign(delta);
  let permittedDistance = Math.abs(delta);
  let blockedBy: string[] = [];
  const selected = new Set(ids);
  for (const piece of level.pieces) {
    if (!selected.has(piece.id)) continue;
    for (const other of level.pieces) {
      if (selected.has(other.id)) continue;
      for (const original of piece.boxes) {
        const a = worldBox(original, piece, offsets[piece.id]!);
        for (const originalOther of other.boxes) {
          const b = worldBox(originalOther, other, offsets[other.id]!);
          if (
            a.min.some(
              (value, i) =>
                i !== index && (value >= b.max[i]! - EPSILON || a.max[i]! <= b.min[i]! + EPSILON),
            )
          )
            continue;
          let gap: number;
          if (sign > 0 && a.max[index] <= b.min[index] + EPSILON) gap = b.min[index] - a.max[index];
          else if (sign < 0 && a.min[index] >= b.max[index] - EPSILON)
            gap = a.min[index] - b.max[index];
          else if (a.min[index] < b.max[index] - EPSILON && a.max[index] > b.min[index] + EPSILON)
            gap = 0;
          else continue;
          gap = Math.max(0, gap);
          if (gap < permittedDistance - EPSILON) {
            permittedDistance = gap;
            blockedBy = [other.id];
          } else if (
            Math.abs(gap - permittedDistance) < EPSILON &&
            gap < Math.abs(delta) - EPSILON &&
            !blockedBy.includes(other.id)
          ) {
            blockedBy.push(other.id);
          }
        }
      }
    }
  }
  const actualOffset = current! + sign * permittedDistance;
  return { actualOffset, blocked: Math.abs(actualOffset - requestedOffset) > EPSILON, blockedBy };
}
