import type { Box, Level, Offsets, PieceDefinition } from './types.ts';

export const EPSILON = 0.000001;
export const axisIndex = (axis: PieceDefinition['axis']): 0 | 1 | 2 =>
  axis === 'x' ? 0 : axis === 'y' ? 1 : 2;

export function worldBox(box: Box, piece: PieceDefinition, offset: number): Box {
  const index = axisIndex(piece.axis);
  return {
    min: box.min.map((value, i) => value + (i === index ? offset : 0)) as unknown as Box['min'],
    max: box.max.map((value, i) => value + (i === index ? offset : 0)) as unknown as Box['max'],
  };
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.min.every((value, i) => value < b.max[i]! - EPSILON && a.max[i]! > b.min[i]! + EPSILON);
}

export function isCollisionFree(level: Level, offsets: Offsets): boolean {
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

/** Exact swept AABB test for a union of boxes translating along one fixed axis.
 * Testing the entire swept interval prevents even a very fast drag from tunnelling.
 * Face contact is permitted; positive-volume intersection is not.
 */
export function sweepMove(
  level: Level,
  offsets: Offsets,
  pieceId: string,
  requestedOffset: number,
): SweepResult {
  const piece = level.pieces.find((candidate) => candidate.id === pieceId);
  const current = offsets[pieceId];
  if (!piece || !Number.isFinite(current) || !Number.isFinite(requestedOffset)) {
    return { actualOffset: current ?? 0, blocked: true, blockedBy: [] };
  }
  const target = Math.min(piece.range[1], Math.max(piece.range[0], requestedOffset));
  const delta = target - current!;
  if (Math.abs(delta) < EPSILON) {
    return {
      actualOffset: current!,
      blocked: Math.abs(requestedOffset - current!) > EPSILON,
      blockedBy: [],
    };
  }
  const axis = axisIndex(piece.axis);
  const sign = Math.sign(delta);
  let permittedDistance = Math.abs(delta);
  let blockedBy: string[] = [];
  for (const other of level.pieces) {
    if (other.id === pieceId) continue;
    for (const original of piece.boxes) {
      const a = worldBox(original, piece, current!);
      for (const originalOther of other.boxes) {
        const b = worldBox(originalOther, other, offsets[other.id]!);
        // A pair can collide only if its projections overlap on both fixed axes.
        if (
          a.min.some(
            (value, i) =>
              i !== axis && (value >= b.max[i]! - EPSILON || a.max[i]! <= b.min[i]! + EPSILON),
          )
        )
          continue;
        let gap: number;
        if (sign > 0 && a.max[axis] <= b.min[axis] + EPSILON) gap = b.min[axis] - a.max[axis];
        else if (sign < 0 && a.min[axis] >= b.max[axis] - EPSILON) gap = a.min[axis] - b.max[axis];
        else if (a.min[axis] < b.max[axis] - EPSILON && a.max[axis] > b.min[axis] + EPSILON)
          gap = 0;
        else continue; // This obstacle is behind the moving piece.
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
  const actualOffset = Math.round((current! + sign * permittedDistance) * 1e6) / 1e6;
  return { actualOffset, blocked: Math.abs(actualOffset - requestedOffset) > EPSILON, blockedBy };
}
