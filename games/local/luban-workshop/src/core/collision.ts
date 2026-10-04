import type {
  Axis,
  Box,
  Level,
  Offsets,
  Orientation,
  Orientations,
  PieceDefinition,
  Vec3,
} from './types.ts';
import {
  IDENTITY_ORIENTATION,
  isIdentityOrientation,
  multiplyOrientation,
  pieceCenter,
  quarterTurnOrientation,
  transformVector,
  validOrientation,
} from './rotation.ts';

export const EPSILON = 0.000001;
export const axisIndex = (axis: Axis): 0 | 1 | 2 => (axis === 'x' ? 0 : axis === 'y' ? 1 : 2);
export const axes: readonly Axis[] = ['x', 'y', 'z'];
export const selectionIds = (ids: string | readonly string[]): string[] => [
  ...new Set(typeof ids === 'string' ? [ids] : ids),
];
export const finiteVector = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

export function worldBox(
  box: Box,
  piece: PieceDefinition,
  offset: Vec3,
  orientation: Orientation = IDENTITY_ORIENTATION,
): Box {
  if (isIdentityOrientation(orientation))
    return {
      min: box.min.map((value, i) => value + offset[i]!) as unknown as Vec3,
      max: box.max.map((value, i) => value + offset[i]!) as unknown as Vec3,
    };
  const center = pieceCenter(piece);
  const transformed = [box.min, box.max].map((point) =>
    transformVector(point.map((value, i) => value - center[i]!) as unknown as Vec3, orientation),
  );
  return {
    min: center.map(
      (value, i) => Math.min(transformed[0]![i]!, transformed[1]![i]!) + value + offset[i]!,
    ) as unknown as Vec3,
    max: center.map(
      (value, i) => Math.max(transformed[0]![i]!, transformed[1]![i]!) + value + offset[i]!,
    ) as unknown as Vec3,
  };
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.min.every((value, i) => value < b.max[i]! - EPSILON && a.max[i]! > b.min[i]! + EPSILON);
}

export function pieceBounds(piece: PieceDefinition, offset: Vec3, orientation?: Orientation): Box {
  const boxes = piece.boxes.map((box) => worldBox(box, piece, offset, orientation));
  return {
    min: [0, 1, 2].map((i) => Math.min(...boxes.map((box) => box.min[i]!))) as unknown as Vec3,
    max: [0, 1, 2].map((i) => Math.max(...boxes.map((box) => box.max[i]!))) as unknown as Vec3,
  };
}

/** A symmetric piece may seat with another cube orientation. Compare occupied
 * volume rather than requiring a particular matrix or box partition. Puzzle
 * definitions use disjoint material boxes; face contact contributes no volume. */
export function isPieceAssembled(
  piece: PieceDefinition,
  offset: Vec3,
  orientation?: Orientation,
): boolean {
  if (!offset.every((value) => Math.abs(value) <= EPSILON)) return false;
  return piece.boxes.every((original) => {
    // Once the seat is within positional tolerance, compare orientation at the
    // exact seat. Otherwise face area amplifies harmless sub-epsilon drag error
    // into a volume mismatch and prevents a visibly restored puzzle completing.
    const box = worldBox(original, piece, [0, 0, 0], orientation);
    const volume = box.min.reduce((product, value, i) => product * (box.max[i]! - value), 1);
    const covered = piece.boxes.reduce(
      (total, target) =>
        total +
        box.min.reduce(
          (product, value, i) =>
            product *
            Math.max(0, Math.min(box.max[i]!, target.max[i]!) - Math.max(value, target.min[i]!)),
          1,
        ),
      0,
    );
    return Math.abs(covered - volume) < EPSILON;
  });
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

export function isCollisionFree(
  level: Level,
  offsets: Offsets,
  orientations?: Orientations,
): boolean {
  if (
    level.pieces.some(
      (piece) =>
        !finiteVector(offsets[piece.id]) ||
        (orientations && !validOrientation(orientations[piece.id])),
    )
  )
    return false;
  for (let i = 0; i < level.pieces.length; i++) {
    const a = level.pieces[i]!;
    for (let j = i + 1; j < level.pieces.length; j++) {
      const b = level.pieces[j]!;
      for (const aBox of a.boxes)
        for (const bBox of b.boxes) {
          if (
            boxesOverlap(
              worldBox(aBox, a, offsets[a.id]!, orientations?.[a.id]),
              worldBox(bBox, b, offsets[b.id]!, orientations?.[b.id]),
            )
          )
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
  orientations?: Orientations,
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
    level.pieces.some(
      (piece) =>
        !finiteVector(offsets[piece.id]) ||
        (orientations && !validOrientation(orientations[piece.id])),
    ) ||
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
        const a = worldBox(original, piece, offsets[piece.id]!, orientations?.[piece.id]);
        for (const originalOther of other.boxes) {
          const b = worldBox(originalOther, other, offsets[other.id]!, orientations?.[other.id]);
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

/** Exact coordinate extrema of every rotating corner over an angular interval.
 * This encloses the whole swept volume, not just sampled endpoint poses. */
function rotationEnvelope(box: Box, pivot: Vec3, axis: Axis, low: number, high: number): Box {
  const fixed = axisIndex(axis);
  const u = (fixed + 1) % 3;
  const v = (fixed + 2) % 3;
  const min = [...box.min];
  const max = [...box.max];
  min[u] = min[v] = Infinity;
  max[u] = max[v] = -Infinity;
  const extrema = (a: number, b: number): number[] => {
    const evaluate = (angle: number) => a * Math.cos(angle) + b * Math.sin(angle);
    const values = [evaluate(low), evaluate(high)];
    const turning = Math.atan2(b, a);
    for (let k = -2; k <= 2; k++) {
      const angle = turning + k * Math.PI;
      if (angle > low && angle < high) values.push(evaluate(angle));
    }
    return values;
  };
  for (const first of [box.min[u]!, box.max[u]!])
    for (const second of [box.min[v]!, box.max[v]!]) {
      const a = first - pivot[u]!;
      const b = second - pivot[v]!;
      const firstValues = extrema(a, -b).map((value) => value + pivot[u]!);
      const secondValues = extrema(b, a).map((value) => value + pivot[v]!);
      min[u] = Math.min(min[u]!, ...firstValues);
      max[u] = Math.max(max[u]!, ...firstValues);
      min[v] = Math.min(min[v]!, ...secondValues);
      max[v] = Math.max(max[v]!, ...secondValues);
    }
  return { min: min as unknown as Vec3, max: max as unknown as Vec3 };
}

export interface RotationSweep {
  offsets: Offsets;
  orientations: Orientations;
  pivot: Vec3;
  blocked: boolean;
  blockedBy: string[];
}

/** Rigid quarter turn about the selection's enclosing-box center. A recursive
 * interval bound proves clearance for the complete arc. Ambiguous intervals
 * below 90/128 degrees are conservatively rejected; no angular samples are
 * used as a substitute for continuous collision detection. Selected members
 * preserve their relative geometry, so they do not obstruct one another. */
export function sweepRotation(
  level: Level,
  offsets: Offsets,
  orientations: Orientations,
  pieceIds: string | readonly string[],
  axis: Axis,
  direction: -1 | 1,
): RotationSweep {
  const ids = selectionIds(pieceIds);
  const invalid: RotationSweep = {
    offsets,
    orientations,
    pivot: [0, 0, 0],
    blocked: true,
    blockedBy: [],
  };
  if (
    !ids.length ||
    !axes.includes(axis) ||
    (direction !== -1 && direction !== 1) ||
    ids.some((id) => !level.pieces.some((piece) => piece.id === id)) ||
    !isCollisionFree(level, offsets, orientations)
  )
    return invalid;
  const selected = new Set(ids);
  const moving = level.pieces.filter((piece) => selected.has(piece.id));
  const bounds = moving.map((piece) =>
    pieceBounds(piece, offsets[piece.id]!, orientations[piece.id]),
  );
  const pivot = [0, 1, 2].map(
    (i) =>
      (Math.min(...bounds.map((box) => box.min[i]!)) +
        Math.max(...bounds.map((box) => box.max[i]!))) /
      2,
  ) as unknown as Vec3;
  if (!finiteVector(pivot)) return invalid;
  const blockedBy: string[] = [];
  const low = direction < 0 ? -Math.PI / 2 : 0;
  const high = direction > 0 ? Math.PI / 2 : 0;
  const arcBlocked = (box: Box, other: Box, start: number, end: number, depth: number): boolean => {
    if (!boxesOverlap(rotationEnvelope(box, pivot, axis, start, end), other)) return false;
    if (depth === 7) return true;
    const middle = (start + end) / 2;
    return (
      arcBlocked(box, other, start, middle, depth + 1) ||
      arcBlocked(box, other, middle, end, depth + 1)
    );
  };
  for (const other of level.pieces) {
    if (selected.has(other.id)) continue;
    const stationary = other.boxes.map((box) =>
      worldBox(box, other, offsets[other.id]!, orientations[other.id]),
    );
    if (
      moving.some((piece) =>
        piece.boxes.some((box) => {
          const world = worldBox(box, piece, offsets[piece.id]!, orientations[piece.id]);
          return stationary.some((obstacle) => arcBlocked(world, obstacle, low, high, 0));
        }),
      )
    )
      blockedBy.push(other.id);
  }
  if (blockedBy.length) return { ...invalid, pivot, blockedBy };
  const rotation = quarterTurnOrientation(axis, direction);
  const nextOffsets = { ...offsets };
  const nextOrientations = { ...orientations };
  for (const piece of moving) {
    const center = pieceCenter(piece);
    const relative = center.map(
      (value, i) => value + offsets[piece.id]![i]! - pivot[i]!,
    ) as unknown as Vec3;
    const rotated = transformVector(relative, rotation);
    nextOffsets[piece.id] = rotated.map(
      (value, i) => value + pivot[i]! - center[i]!,
    ) as unknown as Vec3;
    nextOrientations[piece.id] = multiplyOrientation(rotation, orientations[piece.id]!);
  }
  if (!isCollisionFree(level, nextOffsets, nextOrientations)) return { ...invalid, pivot };
  return {
    offsets: nextOffsets,
    orientations: nextOrientations,
    pivot,
    blocked: false,
    blockedBy: [],
  };
}
